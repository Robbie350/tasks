-- Step 2: profiles and roles
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it only creates what doesn't exist yet and replaces functions/policies.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'manager', 'specialist');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- profiles: one row per login (id = auth user id)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete restrict,
  full_name   text not null,
  email       text not null,
  role        public.user_role not null default 'specialist',
  is_active   boolean not null default true,
  avatar_url  text,
  created_at  timestamptz not null default now()
);
-- "on delete restrict": users are deactivated, never deleted, so their name stays
-- on past notes and activity entries.

create unique index if not exists profiles_email_key on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Create a profile automatically for every new auth user.
-- The role is read from app_metadata, which only the server (service role) can set.
-- user_metadata is NOT trusted for the role, because users can edit it themselves.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_app_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    case
      when requested_role in ('admin', 'manager', 'specialist')
        then requested_role::public.user_role
      else 'specialist'::public.user_role
    end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: profiles for any auth users created before this script ran.
insert into public.profiles (id, full_name, email)
select u.id, split_part(u.email, '@', 1), u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ---------------------------------------------------------------------------
-- Helpers used by security policies (now and in later steps).
-- They return NULL / false for deactivated users, so a deactivated user's
-- session can't read or change anything even before it expires.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_active_user() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- Everyone who is signed in and active can see all profiles (needed to show
-- names and avatars on the board). Nobody can insert, update or delete
-- profiles from the browser: user management goes through server code that
-- checks the caller is an admin (step 3).
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "Active users can view profiles" on public.profiles;
create policy "Active users can view profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_active_user());
