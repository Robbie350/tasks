-- Phase D: archive old Done tasks, and labels on team tasks
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

-- ---------------------------------------------------------------------------
-- When a task reached Done (used to archive old ones from the board)
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists done_at timestamptz;
update public.tasks set done_at = updated_at where status = 'done' and done_at is null;
create index if not exists tasks_done_at_idx on public.tasks (done_at) where status = 'done';

create or replace function public._set_status(p_task_id uuid, p_status public.task_status)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tasks
  set status   = p_status,
      position = public._next_position(p_status),
      done_at  = case when p_status = 'done' then now() else null end
  where id = p_task_id;
$$;
revoke all on function public._set_status(uuid, public.task_status) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Team labels: one shared set, managed by managers
-- ---------------------------------------------------------------------------
create table if not exists public.task_labels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  color       text not null default 'blue'
              check (color in ('gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink')),
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now()
);

alter table public.tasks add column if not exists label_ids uuid[] not null default '{}';

alter table public.task_labels enable row level security;
revoke all on public.task_labels from anon, authenticated;
grant select, insert, update, delete on public.task_labels to authenticated;
grant select, insert, update, delete on public.task_labels to service_role;

drop policy if exists "Active users can view labels" on public.task_labels;
create policy "Active users can view labels" on public.task_labels
  for select to authenticated using (public.is_active_user());

drop policy if exists "Managers manage labels" on public.task_labels;
create policy "Managers manage labels" on public.task_labels
  for all to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

-- Deleting a label removes it from every task.
create or replace function public.task_label_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks set label_ids = array_remove(label_ids, old.id) where old.id = any (label_ids);
  return old;
end;
$$;
revoke all on function public.task_label_deleted() from public, anon, authenticated;

drop trigger if exists task_labels_cleanup on public.task_labels;
create trigger task_labels_cleanup
  after delete on public.task_labels
  for each row execute function public.task_label_deleted();

-- set_task_labels(): managers set a task's labels; logged as an edit.
create or replace function public.set_task_labels(p_task_id uuid, p_label_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_ids  uuid[] := coalesce(
                     (select array_agg(distinct l.id order by l.id)
                      from public.task_labels l where l.id = any (coalesce(p_label_ids, '{}'))),
                     '{}');
begin
  if public.current_user_role() is distinct from 'manager' then
    raise exception 'Only managers can edit tasks.' using errcode = '42501';
  end if;
  v_task := public._lock_task(p_task_id);

  if (select coalesce(array_agg(x order by x), '{}') from unnest(v_task.label_ids) x) = v_ids then
    return;
  end if;

  update public.tasks set label_ids = v_ids where id = p_task_id;

  insert into public.task_activity (task_id, actor_id, action, details)
  values (p_task_id, auth.uid(), 'edited', jsonb_build_object('fields', jsonb_build_array('labels')));
end;
$$;

revoke all on function public.set_task_labels(uuid, uuid[]) from public, anon;
grant execute on function public.set_task_labels(uuid, uuid[]) to authenticated;

-- Live updates for label changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_labels') then
    alter publication supabase_realtime add table public.task_labels;
  end if;
end $$;
