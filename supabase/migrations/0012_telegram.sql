-- Phase G: Telegram notifications
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

-- Who is linked to which Telegram chat. Each person sees only their own row.
create table if not exists public.telegram_links (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  chat_id    bigint not null unique,
  username   text,
  linked_at  timestamptz not null default now()
);

-- One-time codes for linking (valid 15 minutes).
create table if not exists public.telegram_link_codes (
  code        text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  expires_at  timestamptz not null
);

-- Server-only settings (e.g. the site's public address for links in messages).
create table if not exists public.app_settings (
  key    text primary key,
  value  text not null
);

-- Track which notifications were already handled for Telegram.
alter table public.notifications add column if not exists telegram_sent_at timestamptz;
-- Don't send anything from before Telegram existed.
update public.notifications set telegram_sent_at = now() where telegram_sent_at is null and created_at < now() - interval '1 minute';

alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.app_settings enable row level security;

revoke all on public.telegram_links, public.telegram_link_codes, public.app_settings from anon, authenticated;
grant select on public.telegram_links to authenticated;
grant select, insert, update, delete on public.telegram_links, public.telegram_link_codes, public.app_settings to service_role;

drop policy if exists "Users see their own Telegram link" on public.telegram_links;
create policy "Users see their own Telegram link" on public.telegram_links
  for select to authenticated using (user_id = auth.uid() and public.is_active_user());

-- A fresh linking code for the caller (old ones are discarded).
create or replace function public.create_telegram_link_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_active_user() then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;
  delete from public.telegram_link_codes where user_id = auth.uid() or expires_at < now();
  insert into public.telegram_link_codes (code, user_id, expires_at)
  values (v_code, auth.uid(), now() + interval '15 minutes');
  return v_code;
end;
$$;

create or replace function public.telegram_unlink()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.telegram_links where user_id = auth.uid();
$$;

revoke all on function public.create_telegram_link_code() from public, anon;
revoke all on function public.telegram_unlink() from public, anon;
grant execute on function public.create_telegram_link_code() to authenticated;
grant execute on function public.telegram_unlink() to authenticated;

-- Server only (secret key): redeem a code sent to the bot as "/start <code>".
create or replace function public.telegram_redeem_code(p_code text, p_chat_id bigint, p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  delete from public.telegram_link_codes
  where code = p_code and expires_at > now()
  returning user_id into v_user;
  if v_user is null then
    return null;
  end if;
  -- One chat per person and one person per chat.
  delete from public.telegram_links where chat_id = p_chat_id and user_id <> v_user;
  insert into public.telegram_links (user_id, chat_id, username)
  values (v_user, p_chat_id, left(p_username, 64))
  on conflict (user_id) do update set chat_id = excluded.chat_id, username = excluded.username, linked_at = now();
  return v_user;
end;
$$;

-- Server only: atomically claim unsent notifications for linked, active users.
-- Others are marked as handled so they aren't looked at again.
create or replace function public.claim_telegram_batch(p_limit int default 50)
returns table (
  notification_id uuid, type text, task_id uuid, task_title text,
  chat_id bigint, locale text, note text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n set telegram_sent_at = now()
  where n.telegram_sent_at is null
    and not exists (
      select 1 from public.telegram_links l join public.profiles p on p.id = l.user_id
      where l.user_id = n.user_id and p.is_active);

  return query
  with claimed as (
    update public.notifications n set telegram_sent_at = now()
    where n.id in (
      select id from public.notifications
      where telegram_sent_at is null
      order by created_at
      limit greatest(1, least(p_limit, 200))
      for update skip locked)
    returning n.id, n.type, n.task_id, n.user_id
  )
  select c.id, c.type, c.task_id, t.title, l.chat_id, p.locale,
         case when c.type = 'rejected' then (
           select tn.body from public.task_notes tn
           where tn.task_id = c.task_id and tn.is_rejection
           order by tn.created_at desc limit 1)
         end
  from claimed c
  join public.tasks t on t.id = c.task_id
  join public.telegram_links l on l.user_id = c.user_id
  join public.profiles p on p.id = c.user_id;
end;
$$;

revoke all on function public.telegram_redeem_code(text, bigint, text) from public, anon, authenticated;
revoke all on function public.claim_telegram_batch(int) from public, anon, authenticated;
grant execute on function public.telegram_redeem_code(text, bigint, text) to service_role;
grant execute on function public.claim_telegram_batch(int) to service_role;
