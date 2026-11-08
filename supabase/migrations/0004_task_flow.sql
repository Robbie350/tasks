-- Step 5: task flow (grab, join, leave, move, approve, reject, edit)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- Rules (agreed, see README "Task flow rules"):
--   grab     Unassigned -> To Do, by any manager/specialist
--   join     To Do / In Progress / Review, by any manager/specialist
--   leave    by anyone on the task (not when Done). Last person leaving a To Do
--            task sends it back to Unassigned; In Progress / Review tasks stay put.
--   move     To Do -> In Progress -> Review, only by people assigned to the task
--   approve  Review -> Done, by a manager NOT assigned to the task
--   reject   Review -> In Progress with a required note, same managers;
--            assignees get a notification
--   edit     title / description / priority / due date, by managers
-- Admins manage users only and can do none of these.

-- ---------------------------------------------------------------------------
-- Notes (the thread UI arrives in step 6; rejection notes are written now)
-- ---------------------------------------------------------------------------
create table if not exists public.task_notes (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  author_id     uuid not null references public.profiles (id),
  body          text not null check (char_length(btrim(body)) between 1 and 5000),
  is_rejection  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists task_notes_task_idx on public.task_notes (task_id, created_at);

drop trigger if exists task_notes_set_updated_at on public.task_notes;
create trigger task_notes_set_updated_at
  before update on public.task_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications (the bell arrives in step 7; rows are written from now on)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  type        text not null check (type in ('assigned', 'rejected')),
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

alter table public.task_notes enable row level security;
alter table public.notifications enable row level security;

revoke all on public.task_notes, public.notifications from anon, authenticated;
grant select on public.task_notes, public.notifications to authenticated;
grant select, insert, update, delete on public.task_notes, public.notifications to service_role;

drop policy if exists "Active users can view notes" on public.task_notes;
create policy "Active users can view notes"
  on public.task_notes for select to authenticated
  using (public.is_active_user());

drop policy if exists "Users see their own notifications" on public.notifications;
create policy "Users see their own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable from the browser)
-- ---------------------------------------------------------------------------

-- The caller, who must be an active manager or specialist.
create or replace function public._require_worker()
returns public.user_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
begin
  if v_role is null or v_role not in ('manager', 'specialist') then
    raise exception 'Only managers and specialists can work on tasks.' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- Lock the task row for the rest of the transaction, so two people acting at
-- the same moment can't both succeed with conflicting changes.
create or replace function public._lock_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'That task no longer exists.' using errcode = 'P0002';
  end if;
  return v_task;
end;
$$;

create or replace function public._is_assignee(p_task_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.task_assignees where task_id = p_task_id and user_id = p_user_id
  );
$$;

-- Bottom of a column.
create or replace function public._next_position(p_status public.task_status)
returns double precision
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(position), 0) + 1 from public.tasks where status = p_status;
$$;

create or replace function public._set_status(p_task_id uuid, p_status public.task_status)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tasks
  set status = p_status, position = public._next_position(p_status)
  where id = p_task_id;
$$;

-- ---------------------------------------------------------------------------
-- grab_task: Unassigned -> To Do, caller becomes the assignee
-- ---------------------------------------------------------------------------
create or replace function public.grab_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := auth.uid();
  v_task public.tasks;
begin
  perform public._require_worker();
  v_task := public._lock_task(p_task_id);

  if v_task.status <> 'unassigned' then
    raise exception 'Someone already grabbed this task.' using errcode = '55000';
  end if;

  insert into public.task_assignees (task_id, user_id, assigned_by)
  values (p_task_id, v_me, v_me)
  on conflict do nothing;

  perform public._set_status(p_task_id, 'todo');

  insert into public.task_activity (task_id, actor_id, action, from_status, to_status)
  values (p_task_id, v_me, 'grabbed', 'unassigned', 'todo');
end;
$$;

-- ---------------------------------------------------------------------------
-- join_task: add yourself to a task in To Do / In Progress / Review
-- ---------------------------------------------------------------------------
create or replace function public.join_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := auth.uid();
  v_task public.tasks;
begin
  perform public._require_worker();
  v_task := public._lock_task(p_task_id);

  if v_task.status = 'unassigned' then
    raise exception 'Use Grab to take an unassigned task.' using errcode = '55000';
  end if;
  if v_task.status = 'done' then
    raise exception 'This task is already done.' using errcode = '55000';
  end if;
  if public._is_assignee(p_task_id, v_me) then
    raise exception 'You are already on this task.' using errcode = '55000';
  end if;

  insert into public.task_assignees (task_id, user_id, assigned_by)
  values (p_task_id, v_me, v_me);

  insert into public.task_activity (task_id, actor_id, action, details)
  values (p_task_id, v_me, 'joined', jsonb_build_object('status', v_task.status));
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_task: remove yourself. Last one out of a To Do task -> Unassigned.
-- ---------------------------------------------------------------------------
create or replace function public.leave_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := auth.uid();
  v_task public.tasks;
  v_left int;
begin
  perform public._require_worker();
  v_task := public._lock_task(p_task_id);

  if v_task.status = 'done' then
    raise exception 'You can''t leave a task that is done.' using errcode = '55000';
  end if;
  if not public._is_assignee(p_task_id, v_me) then
    raise exception 'You are not on this task.' using errcode = '55000';
  end if;

  delete from public.task_assignees where task_id = p_task_id and user_id = v_me;
  select count(*) into v_left from public.task_assignees where task_id = p_task_id;

  if v_left = 0 and v_task.status = 'todo' then
    perform public._set_status(p_task_id, 'unassigned');
    insert into public.task_activity (task_id, actor_id, action, from_status, to_status)
    values (p_task_id, v_me, 'left', 'todo', 'unassigned');
  else
    insert into public.task_activity (task_id, actor_id, action, details)
    values (p_task_id, v_me, 'left', jsonb_build_object('status', v_task.status));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_task: assignees move To Do -> In Progress -> Review (one step forward)
-- ---------------------------------------------------------------------------
create or replace function public.move_task(p_task_id uuid, p_to public.task_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := auth.uid();
  v_task public.tasks;
begin
  perform public._require_worker();
  v_task := public._lock_task(p_task_id);

  if not public._is_assignee(p_task_id, v_me) then
    raise exception 'Only people on this task can move it.' using errcode = '42501';
  end if;

  if not (
       (v_task.status = 'todo' and p_to = 'in_progress')
    or (v_task.status = 'in_progress' and p_to = 'review')
  ) then
    raise exception 'A task can only move To Do → In Progress → Review. A manager moves it to Done.'
      using errcode = '55000';
  end if;

  perform public._set_status(p_task_id, p_to);

  insert into public.task_activity (task_id, actor_id, action, from_status, to_status)
  values (p_task_id, v_me, 'moved', v_task.status, p_to);
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_task / reject_task: managers who are NOT on the task
-- ---------------------------------------------------------------------------
create or replace function public._require_reviewer(p_task public.tasks)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'manager' then
    raise exception 'Only managers can approve or reject tasks.' using errcode = '42501';
  end if;
  if public._is_assignee(p_task.id, auth.uid()) then
    raise exception 'You are on this task, so another manager has to review it.'
      using errcode = '42501';
  end if;
  if p_task.status <> 'review' then
    raise exception 'Only tasks in Review can be approved or rejected.' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.approve_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  v_task := public._lock_task(p_task_id);
  perform public._require_reviewer(v_task);

  perform public._set_status(p_task_id, 'done');

  insert into public.task_activity (task_id, actor_id, action, from_status, to_status)
  values (p_task_id, auth.uid(), 'approved', 'review', 'done');
end;
$$;

create or replace function public.reject_task(p_task_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := auth.uid();
  v_task    public.tasks;
  v_note_id uuid;
begin
  v_task := public._lock_task(p_task_id);
  perform public._require_reviewer(v_task);

  if p_note is null or char_length(btrim(p_note)) = 0 then
    raise exception 'Write a note saying what needs to change.' using errcode = '22023';
  end if;

  insert into public.task_notes (task_id, author_id, body, is_rejection)
  values (p_task_id, v_me, btrim(p_note), true)
  returning id into v_note_id;

  perform public._set_status(p_task_id, 'in_progress');

  insert into public.task_activity (task_id, actor_id, action, from_status, to_status, details)
  values (p_task_id, v_me, 'rejected', 'review', 'in_progress', jsonb_build_object('note_id', v_note_id));

  insert into public.notifications (user_id, task_id, type)
  select a.user_id, p_task_id, 'rejected'
  from public.task_assignees a
  where a.task_id = p_task_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_task: managers edit the fields (not status, not assignees)
-- ---------------------------------------------------------------------------
create or replace function public.update_task(
  p_task_id     uuid,
  p_title       text,
  p_description text,
  p_priority    public.task_priority,
  p_due_date    date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task    public.tasks;
  v_title   text := btrim(coalesce(p_title, ''));
  v_desc    text := nullif(btrim(coalesce(p_description, '')), '');
  v_changed text[] := '{}';
begin
  if public.current_user_role() is distinct from 'manager' then
    raise exception 'Only managers can edit tasks.' using errcode = '42501';
  end if;
  if char_length(v_title) = 0 then
    raise exception 'A task needs a title.' using errcode = '22023';
  end if;

  v_task := public._lock_task(p_task_id);

  if v_task.title is distinct from v_title then v_changed := array_append(v_changed, 'title'); end if;
  if v_task.description is distinct from v_desc then v_changed := array_append(v_changed, 'description'); end if;
  if v_task.priority is distinct from p_priority then v_changed := array_append(v_changed, 'priority'); end if;
  if v_task.due_date is distinct from p_due_date then v_changed := array_append(v_changed, 'due date'); end if;

  if cardinality(v_changed) = 0 then
    return;
  end if;

  update public.tasks
  set title = v_title, description = v_desc, priority = p_priority, due_date = p_due_date
  where id = p_task_id;

  insert into public.task_activity (task_id, actor_id, action, details)
  values (p_task_id, auth.uid(), 'edited', jsonb_build_object('fields', to_jsonb(v_changed)));
end;
$$;

-- ---------------------------------------------------------------------------
-- create_task: same as step 4, plus an "assigned" notification for each
-- assignee other than the creator.
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
    public._next_position(v_status),
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

  insert into public.notifications (user_id, task_id, type)
  select a, v_task_id, 'assigned' from unnest(v_assignees) a where a <> v_me;

  return v_task_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------
revoke all on function public._require_worker() from public, anon, authenticated;
revoke all on function public._lock_task(uuid) from public, anon, authenticated;
revoke all on function public._is_assignee(uuid, uuid) from public, anon, authenticated;
revoke all on function public._next_position(public.task_status) from public, anon, authenticated;
revoke all on function public._set_status(uuid, public.task_status) from public, anon, authenticated;
revoke all on function public._require_reviewer(public.tasks) from public, anon, authenticated;

revoke all on function public.grab_task(uuid) from public, anon;
revoke all on function public.join_task(uuid) from public, anon;
revoke all on function public.leave_task(uuid) from public, anon;
revoke all on function public.move_task(uuid, public.task_status) from public, anon;
revoke all on function public.approve_task(uuid) from public, anon;
revoke all on function public.reject_task(uuid, text) from public, anon;
revoke all on function public.update_task(uuid, text, text, public.task_priority, date) from public, anon;
revoke all on function public.create_task(text, text, public.task_priority, date, uuid[]) from public, anon;

grant execute on function public.grab_task(uuid) to authenticated;
grant execute on function public.join_task(uuid) to authenticated;
grant execute on function public.leave_task(uuid) to authenticated;
grant execute on function public.move_task(uuid, public.task_status) to authenticated;
grant execute on function public.approve_task(uuid) to authenticated;
grant execute on function public.reject_task(uuid, text) to authenticated;
grant execute on function public.update_task(uuid, text, text, public.task_priority, date) to authenticated;
grant execute on function public.create_task(text, text, public.task_priority, date, uuid[]) to authenticated;
