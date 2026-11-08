-- Phase C: personal boards
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- Every row belongs to one user (owner_id). Row-level security lets people
-- see and change ONLY their own rows: nobody else, not even the admin, can
-- read someone's personal board. The browser talks to these tables directly;
-- RLS is the guard.

create table if not exists public.personal_columns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 60),
  color       text not null default 'gray',
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists personal_columns_owner_idx on public.personal_columns (owner_id, position);

create table if not exists public.personal_labels (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  color       text not null default 'blue',
  created_at  timestamptz not null default now()
);
create index if not exists personal_labels_owner_idx on public.personal_labels (owner_id);

create table if not exists public.personal_cards (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  column_id   uuid not null references public.personal_columns (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  notes       text check (notes is null or char_length(notes) <= 10000),
  due_date    date,
  priority    text check (priority is null or priority in ('low', 'medium', 'high')),
  label_ids   uuid[] not null default '{}',
  -- [{ "id": "...", "text": "...", "done": false }, ...]
  checklist   jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists personal_cards_owner_idx on public.personal_cards (owner_id, column_id, position);

create table if not exists public.personal_settings (
  owner_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  background  text not null default 'none',
  updated_at  timestamptz not null default now()
);

drop trigger if exists personal_cards_set_updated_at on public.personal_cards;
create trigger personal_cards_set_updated_at
  before update on public.personal_cards
  for each row execute function public.set_updated_at();

-- Deleting a label removes it from the owner's cards.
create or replace function public.personal_label_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.personal_cards
  set label_ids = array_remove(label_ids, old.id)
  where owner_id = old.owner_id and old.id = any (label_ids);
  return old;
end;
$$;
revoke all on function public.personal_label_deleted() from public, anon, authenticated;

drop trigger if exists personal_labels_cleanup on public.personal_labels;
create trigger personal_labels_cleanup
  after delete on public.personal_labels
  for each row execute function public.personal_label_deleted();

-- ---------------------------------------------------------------------------
-- Security: owner only
-- ---------------------------------------------------------------------------
alter table public.personal_columns enable row level security;
alter table public.personal_labels enable row level security;
alter table public.personal_cards enable row level security;
alter table public.personal_settings enable row level security;

revoke all on public.personal_columns, public.personal_labels, public.personal_cards, public.personal_settings
  from anon, authenticated;
grant select, insert, update, delete
  on public.personal_columns, public.personal_labels, public.personal_cards, public.personal_settings
  to authenticated;
grant select, insert, update, delete
  on public.personal_columns, public.personal_labels, public.personal_cards, public.personal_settings
  to service_role;

drop policy if exists "Owner manages own columns" on public.personal_columns;
create policy "Owner manages own columns" on public.personal_columns
  for all to authenticated
  using (owner_id = auth.uid() and public.is_active_user())
  with check (owner_id = auth.uid() and public.is_active_user());

drop policy if exists "Owner manages own labels" on public.personal_labels;
create policy "Owner manages own labels" on public.personal_labels
  for all to authenticated
  using (owner_id = auth.uid() and public.is_active_user())
  with check (owner_id = auth.uid() and public.is_active_user());

drop policy if exists "Owner manages own cards" on public.personal_cards;
create policy "Owner manages own cards" on public.personal_cards
  for all to authenticated
  using (owner_id = auth.uid() and public.is_active_user())
  with check (
    owner_id = auth.uid()
    and public.is_active_user()
    -- the card's column must be one of the owner's own columns
    and exists (
      select 1 from public.personal_columns c
      where c.id = column_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists "Owner manages own settings" on public.personal_settings;
create policy "Owner manages own settings" on public.personal_settings
  for all to authenticated
  using (owner_id = auth.uid() and public.is_active_user())
  with check (owner_id = auth.uid() and public.is_active_user());

-- ---------------------------------------------------------------------------
-- First visit: create the starter columns once (safe if two tabs race).
-- ---------------------------------------------------------------------------
create or replace function public.ensure_personal_board(p_titles text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_colors text[] := array['gray', 'blue', 'green'];
  i int;
begin
  if not public.is_active_user() then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('personal_board:' || v_me::text));
  if exists (select 1 from public.personal_columns where owner_id = v_me) then
    return;
  end if;
  for i in 1 .. least(coalesce(array_length(p_titles, 1), 0), 10) loop
    insert into public.personal_columns (owner_id, title, color, position)
    values (v_me, left(btrim(p_titles[i]), 60), v_colors[1 + ((i - 1) % 3)], i);
  end loop;
end;
$$;

revoke all on function public.ensure_personal_board(text[]) from public, anon;
grant execute on function public.ensure_personal_board(text[]) to authenticated;
