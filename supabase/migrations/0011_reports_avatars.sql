-- Phase F: reports (managers and admin) and profile photos
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Reports. Read-only, managers and admin only.
-- ---------------------------------------------------------------------------
create or replace function public._require_reporter()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is null or public.current_user_role() not in ('manager', 'admin') then
    raise exception 'Only managers and the admin can see reports.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public._require_reporter() from public, anon, authenticated;

-- Headline numbers for the last p_days days.
create or replace function public.report_summary(p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 3650)));
begin
  perform public._require_reporter();
  return jsonb_build_object(
    'created',   (select count(*) from public.tasks where created_at >= v_since),
    'completed', (select count(*) from public.tasks where status = 'done' and done_at >= v_since),
    'rejected',  (select count(*) from public.task_activity where action = 'rejected' and created_at >= v_since),
    'open',      (select count(*) from public.tasks where status <> 'done'),
    'overdue',   (select count(*) from public.tasks where status <> 'done' and due_date < current_date),
    'avg_cycle_hours', (
      select round(avg(extract(epoch from done_at - created_at) / 3600)::numeric, 1)
      from public.tasks where status = 'done' and done_at >= v_since)
  );
end;
$$;

-- Per person: finished in the period (as an assignee), open now, overdue now.
create or replace function public.report_people(p_days int)
returns table (user_id uuid, full_name text, completed bigint, open bigint, overdue bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 3650)));
begin
  perform public._require_reporter();
  return query
  select p.id, p.full_name,
         count(*) filter (where t.status = 'done' and t.done_at >= v_since),
         count(*) filter (where t.status <> 'done'),
         count(*) filter (where t.status <> 'done' and t.due_date < current_date)
  from public.profiles p
  left join public.task_assignees a on a.user_id = p.id
  left join public.tasks t on t.id = a.task_id
  where p.is_active and p.role in ('manager', 'specialist')
  group by p.id, p.full_name
  order by 3 desc, 4 desc, p.full_name;
end;
$$;

-- How long tasks stay in each column. Built from the activity log: each status
-- change starts a stay that ends at the next change (or now, if still there).
create or replace function public.report_columns(p_days int)
returns table (status public.task_status, avg_hours numeric, median_hours numeric, stays bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 3650)));
begin
  perform public._require_reporter();
  return query
  with ev as (
    select e.task_id, e.to_status, e.created_at,
           lead(e.created_at) over (partition by e.task_id order by e.created_at, e.id) as next_at
    from public.task_activity e
    where e.to_status is not null
  ), stays as (
    select ev.to_status as st,
           extract(epoch from coalesce(ev.next_at, now()) - ev.created_at) / 3600 as hours
    from ev
    join public.tasks t on t.id = ev.task_id
    where ev.to_status <> 'done' and coalesce(ev.next_at, now()) >= v_since
  )
  select st,
         round(avg(hours)::numeric, 1),
         round((percentile_cont(0.5) within group (order by hours))::numeric, 1),
         count(*)
  from stays
  group by st
  order by array_position(array['unassigned','todo','in_progress','review']::public.task_status[], st);
end;
$$;

-- Tasks created and completed per week, for the last p_weeks weeks.
create or replace function public.report_weekly(p_weeks int)
returns table (week_start date, created bigint, completed bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_weeks int := greatest(1, least(p_weeks, 104));
begin
  perform public._require_reporter();
  return query
  with weeks as (
    select generate_series(
             date_trunc('week', now()) - make_interval(weeks => v_weeks - 1),
             date_trunc('week', now()),
             interval '1 week')::date as wk
  )
  select w.wk,
         (select count(*) from public.tasks t
           where t.created_at >= w.wk and t.created_at < w.wk + 7),
         (select count(*) from public.tasks t
           where t.status = 'done' and t.done_at >= w.wk and t.done_at < w.wk + 7)
  from weeks w
  order by w.wk;
end;
$$;

revoke all on function public.report_summary(int) from public, anon;
revoke all on function public.report_people(int) from public, anon;
revoke all on function public.report_columns(int) from public, anon;
revoke all on function public.report_weekly(int) from public, anon;
grant execute on function public.report_summary(int) to authenticated;
grant execute on function public.report_people(int) to authenticated;
grant execute on function public.report_columns(int) to authenticated;
grant execute on function public.report_weekly(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile photos. Stored in a public "avatars" bucket under random names; the
-- server uploads them (after checking who you are) and sets your avatar_url.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_avatar(p_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not public.is_active_user() then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;
  if p_url is not null and position('/storage/v1/object/public/avatars/' || auth.uid()::text || '/' in p_url) = 0 then
    raise exception 'Invalid file path.' using errcode = '22023';
  end if;
  select avatar_url into v_old from public.profiles where id = auth.uid();
  update public.profiles set avatar_url = p_url where id = auth.uid();
  return v_old;
end;
$$;

revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('avatars', 'avatars', true, 2097152)
    on conflict (id) do update set public = true, file_size_limit = 2097152;
  else
    raise notice 'storage schema not found; skipping bucket (not a Supabase database?)';
  end if;
end $$;
