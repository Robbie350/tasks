-- Step 4: tasks, assignees, activity log, and create_task()
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- Browsers can READ these tables (when signed in and active) but can't write
-- to them directly. Every change goes through a database function that checks
-- the caller's role and writes the activity log, e.g. create_task() below.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('unassigned', 'todo', 'in_progress', 'review', 'done');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type public.task_priority as enum ('low', 'medium', 'high');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  description  text check (description is null or char_length(description) <= 5000),
  status       public.task_status not null default 'unassigned',
  priority     public.task_priority not null default 'medium',
  due_date     date,
  position     double precision not null default 0,  -- order within its column
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tasks_status_position_idx on public.tasks (status, position);

create table if not exists public.task_assignees (
  task_id      uuid not null references public.tasks (id) on delete cascade,
  user_id      uuid not null references public.profiles (id),
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid references public.profiles (id),
  primary key (task_id, user_id)
);

create index if not exists task_assignees_user_idx on public.task_assignees (user_id);

create table if not exists public.task_activity (
  id           bigint generated always as identity primary key,
  task_id      uuid not null references public.tasks (id) on delete cascade,
  actor_id     uuid not null references public.profiles (id),
  action       text not null check (action in (
                 'created', 'assigned', 'grabbed', 'joined', 'left',
                 'moved', 'approved', 'rejected', 'edited')),
  from_status  public.task_status,
  to_status    public.task_status,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists task_activity_task_idx on public.task_activity (task_id, created_at);

-- Keep updated_at current on every change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Security: read-only for active signed-in users, no direct writes.
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_activity enable row level security;

revoke all on public.tasks, public.task_assignees, public.task_activity from anon, authenticated;
grant select on public.tasks, public.task_assignees, public.task_activity to authenticated;
grant select, insert, update, delete on public.tasks, public.task_assignees, public.task_activity
  to service_role;

drop policy if exists "Active users can view tasks" on public.tasks;
create policy "Active users can view tasks"
  on public.tasks for select to authenticated
  using (public.is_active_user());

drop policy if exists "Active users can view assignees" on public.task_assignees;
create policy "Active users can view assignees"
  on public.task_assignees for select to authenticated
  using (public.is_active_user());

drop policy if exists "Active users can view activity" on public.task_activity;
create policy "Active users can view activity"
  on public.task_activity for select to authenticated
  using (public.is_active_user());

-- ---------------------------------------------------------------------------
-- create_task(): managers only.
-- With assignees the task starts in To Do, without anyone in Unassigned.
-- Writes 'created' plus one 'assigned' activity row per assignee.
-- ---------------------------------------------------------------------------
create or replace function public.create_task(
  p_title        text,
  p_description  text default null,
  p_priority     public.task_priority default 'medium',
  p_due_date     date default null,
  p_assignee_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_role      public.user_role := public.current_user_role();
  v_assignees uuid[] := coalesce(
                          (select array_agg(distinct a) from unnest(p_assignee_ids) a where a is not null),
                          '{}');
  v_status    public.task_status;
  v_task_id   uuid;
  v_bad       int;
begin
  if v_role is distinct from 'manager' then
    raise exception 'Only managers can create tasks.' using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'A task needs a title.' using errcode = '22023';
  end if;

  -- Assignees must be active managers or specialists.
  select count(*) into v_bad
  from unnest(v_assignees) a
  where not exists (
    select 1 from public.profiles p
    where p.id = a and p.is_active and p.role in ('manager', 'specialist')
  );
  if v_bad > 0 then
    raise exception 'Assignees must be active managers or specialists.' using errcode = '22023';
  end if;

  v_status := case when cardinality(v_assignees) > 0 then 'todo' else 'unassigned' end;

  insert into public.tasks (title, description, status, priority, due_date, position, created_by)
  values (
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_status,
    coalesce(p_priority, 'medium'),
    p_due_date,
    coalesce((select max(t.position) from public.tasks t where t.status = v_status), 0) + 1,
    v_me
  )
  returning id into v_task_id;

  insert into public.task_activity (task_id, actor_id, action, to_status, details)
  values (v_task_id, v_me, 'created', v_status, jsonb_build_object('title', btrim(p_title)));

  insert into public.task_assignees (task_id, user_id, assigned_by)
  select v_task_id, a, v_me from unnest(v_assignees) a;

  insert into public.task_activity (task_id, actor_id, action, details)
  select v_task_id, v_me, 'assigned', jsonb_build_object('user_id', a)
  from unnest(v_assignees) a;

  return v_task_id;
end;
$$;

revoke all on function public.create_task(text, text, public.task_priority, date, uuid[]) from public, anon;
grant execute on function public.create_task(text, text, public.task_priority, date, uuid[]) to authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
