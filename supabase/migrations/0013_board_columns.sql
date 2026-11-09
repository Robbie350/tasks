-- Board columns: the admin can add steps inside a stage
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- The five stages (unassigned, todo, in_progress, review, done) still drive
-- every rule. Each stage has one built-in column (renamable, never deleted);
-- the admin can add extra steps to To Do, In Progress and Review. A task's
-- column always belongs to its stage (a trigger keeps them consistent).
--
-- Moving:
--   * assignees move a To Do / In Progress task one step forward; it leaves a
--     stage only from that stage's last step
--   * managers who are not on the task move it through the Review steps and
--     approve it to Done only from the last Review step
--   * reject works from any Review step (back to the first In Progress step)

create table if not exists public.board_columns (
  id          uuid primary key default gen_random_uuid(),
  stage       public.task_status not null,
  title       text check (title is null or char_length(btrim(title)) between 1 and 40),
  position    double precision not null default 0,
  is_builtin  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Exactly one built-in column per stage.
create unique index if not exists board_columns_one_builtin on public.board_columns (stage) where is_builtin;
create index if not exists board_columns_stage_pos on public.board_columns (stage, position);

insert into public.board_columns (stage, title, position, is_builtin)
select s, null, 0, true
from unnest(array['unassigned', 'todo', 'in_progress', 'review', 'done']::public.task_status[]) s
on conflict do nothing;

alter table public.board_columns enable row level security;
revoke all on public.board_columns from anon, authenticated;
grant select on public.board_columns to authenticated;
grant select, insert, update, delete on public.board_columns to service_role;

drop policy if exists "Active users can view columns" on public.board_columns;
create policy "Active users can view columns" on public.board_columns
  for select to authenticated using (public.is_active_user());

-- ---------------------------------------------------------------------------
-- Tasks remember their column; a trigger keeps it inside the task's stage.
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists column_id uuid references public.board_columns (id);

create or replace function public._first_column(p_stage public.task_status)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.board_columns where stage = p_stage order by position, created_at limit 1;
$$;

create or replace function public._last_column(p_stage public.task_status)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.board_columns where stage = p_stage order by position desc, created_at desc limit 1;
$$;

create or replace function public.tasks_keep_column()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.column_id is null
     or (select stage from public.board_columns where id = new.column_id) is distinct from new.status then
    new.column_id := public._first_column(new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_keep_column on public.tasks;
create trigger tasks_keep_column
  before insert or update of status, column_id on public.tasks
  for each row execute function public.tasks_keep_column();

-- Existing tasks go to their stage's first column.
update public.tasks t set column_id = public._first_column(t.status)
where t.column_id is null
   or (select stage from public.board_columns c where c.id = t.column_id) is distinct from t.status;

revoke all on function public._first_column(public.task_status) from public, anon, authenticated;
revoke all on function public._last_column(public.task_status) from public, anon, authenticated;
revoke all on function public.tasks_keep_column() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stage moves now only leave from the stage's last step.
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

  if v_task.column_id is distinct from public._last_column(v_task.status) then
    raise exception 'Finish the steps in this stage first.' using errcode = '55000';
  end if;

  perform public._set_status(p_task_id, p_to);

  insert into public.task_activity (task_id, actor_id, action, from_status, to_status)
  values (p_task_id, v_me, 'moved', v_task.status, p_to);
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

  if v_task.column_id is distinct from public._last_column('review') then
    raise exception 'Finish the steps in this stage first.' using errcode = '55000';
  end if;

  perform public._set_status(p_task_id, 'done');

  insert into public.task_activity (task_id, actor_id, action, from_status, to_status)
  values (p_task_id, auth.uid(), 'approved', 'review', 'done');
end;
$$;

-- One step forward inside the same stage.
create or replace function public.move_task_step(p_task_id uuid, p_column_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  v_task   public.tasks;
  v_target public.board_columns;
  v_next   uuid;
begin
  v_task := public._lock_task(p_task_id);
  select * into v_target from public.board_columns where id = p_column_id;
  if not found then
    raise exception 'That column no longer exists.' using errcode = 'P0002';
  end if;

  if v_task.status = 'review' then
    perform public._require_reviewer(v_task);
  elsif v_task.status in ('todo', 'in_progress') then
    perform public._require_worker();
    if not public._is_assignee(p_task_id, v_me) then
      raise exception 'Only people on this task can move it.' using errcode = '42501';
    end if;
  else
    raise exception 'A task can only move to the next step.' using errcode = '55000';
  end if;

  select c.id into v_next
  from public.board_columns c, public.board_columns cur
  where cur.id = v_task.column_id
    and c.stage = v_task.status
    and (c.position, c.created_at) > (cur.position, cur.created_at)
  order by c.position, c.created_at
  limit 1;

  if v_target.stage <> v_task.status or v_next is distinct from p_column_id then
    raise exception 'A task can only move to the next step.' using errcode = '55000';
  end if;

  update public.tasks set column_id = p_column_id where id = p_task_id;

  insert into public.task_activity (task_id, actor_id, action, from_status, to_status, details)
  values (p_task_id, v_me, 'moved', v_task.status, v_task.status,
          jsonb_build_object('column', coalesce(v_target.title, v_target.stage::text)));
end;
$$;

revoke all on function public.move_task_step(uuid, uuid) from public, anon;
grant execute on function public.move_task_step(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: manage the board's columns
-- ---------------------------------------------------------------------------
create or replace function public._require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Only the admin can change the board''s columns.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public._require_admin() from public, anon, authenticated;

-- Adds a step right after p_after (a column in the same stage).
create or replace function public.add_board_column(p_after uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_after public.board_columns;
  v_next  double precision;
  v_id    uuid;
begin
  perform public._require_admin();
  select * into v_after from public.board_columns where id = p_after;
  if not found then
    raise exception 'That column no longer exists.' using errcode = 'P0002';
  end if;
  if v_after.stage not in ('todo', 'in_progress', 'review') then
    raise exception 'New steps can only be added to To Do, In Progress or Review.' using errcode = '22023';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 40 then
    raise exception 'A column name can have up to 40 characters.' using errcode = '22023';
  end if;

  select min(position) into v_next from public.board_columns
  where stage = v_after.stage and position > v_after.position;

  insert into public.board_columns (stage, title, position)
  values (v_after.stage, btrim(p_title), coalesce((v_after.position + v_next) / 2, v_after.position + 1))
  returning id into v_id;
  return v_id;
end;
$$;

-- Rename; null or empty resets a built-in column to its default name.
create or replace function public.rename_board_column(p_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col public.board_columns;
begin
  perform public._require_admin();
  select * into v_col from public.board_columns where id = p_id;
  if not found then
    raise exception 'That column no longer exists.' using errcode = 'P0002';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null and not v_col.is_builtin then
    raise exception 'A column name can have up to 40 characters.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) > 40 then
    raise exception 'A column name can have up to 40 characters.' using errcode = '22023';
  end if;
  update public.board_columns set title = nullif(btrim(coalesce(p_title, '')), '') where id = p_id;
end;
$$;

-- Swap with the neighbour on the left (-1) or right (+1) within the stage.
create or replace function public.move_board_column(p_id uuid, p_dir int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col public.board_columns;
  v_nb  public.board_columns;
begin
  perform public._require_admin();
  select * into v_col from public.board_columns where id = p_id;
  if not found then
    raise exception 'That column no longer exists.' using errcode = 'P0002';
  end if;
  if p_dir < 0 then
    select * into v_nb from public.board_columns
    where stage = v_col.stage and (position, created_at) < (v_col.position, v_col.created_at)
    order by position desc, created_at desc limit 1;
  else
    select * into v_nb from public.board_columns
    where stage = v_col.stage and (position, created_at) > (v_col.position, v_col.created_at)
    order by position, created_at limit 1;
  end if;
  if v_nb.id is null then
    return;
  end if;
  update public.board_columns set position = v_nb.position where id = v_col.id;
  update public.board_columns set position = v_col.position where id = v_nb.id;
  -- break ties so the order is stable
  if v_nb.position = v_col.position then
    update public.board_columns set position = position + (case when p_dir < 0 then -0.5 else 0.5 end) where id = v_col.id;
  end if;
end;
$$;

-- Delete an added step; its tasks move to the previous step in the stage
-- (or the next one if it was first).
create or replace function public.delete_board_column(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col    public.board_columns;
  v_target uuid;
begin
  perform public._require_admin();
  select * into v_col from public.board_columns where id = p_id for update;
  if not found then
    raise exception 'That column no longer exists.' using errcode = 'P0002';
  end if;
  if v_col.is_builtin then
    raise exception 'Built-in columns can''t be deleted.' using errcode = '42501';
  end if;

  select id into v_target from public.board_columns
  where stage = v_col.stage and id <> v_col.id and (position, created_at) < (v_col.position, v_col.created_at)
  order by position desc, created_at desc limit 1;
  if v_target is null then
    select id into v_target from public.board_columns
    where stage = v_col.stage and id <> v_col.id
    order by position, created_at limit 1;
  end if;

  update public.tasks set column_id = v_target where column_id = v_col.id;
  delete from public.board_columns where id = v_col.id;
end;
$$;

revoke all on function public.add_board_column(uuid, text) from public, anon;
revoke all on function public.rename_board_column(uuid, text) from public, anon;
revoke all on function public.move_board_column(uuid, int) from public, anon;
revoke all on function public.delete_board_column(uuid) from public, anon;
grant execute on function public.add_board_column(uuid, text) to authenticated;
grant execute on function public.rename_board_column(uuid, text) to authenticated;
grant execute on function public.move_board_column(uuid, int) to authenticated;
grant execute on function public.delete_board_column(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reports: time per STAGE, so moving between steps of the same stage doesn't
-- split a stay.
-- ---------------------------------------------------------------------------
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
    where e.to_status is not null and e.from_status is distinct from e.to_status
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

-- Live updates when the admin changes columns.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board_columns') then
    alter publication supabase_realtime add table public.board_columns;
  end if;
end $$;
