-- Admin can delete a user (not just deactivate)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- What deleting a user does:
--   * their login (auth user) and profile are removed
--   * their personal board, notifications, Telegram link: removed (cascade)
--   * they are taken off every task (a To Do task left with nobody goes back
--     to Unassigned, same rule as leaving)
--   * tasks they created, notes, files and history are KEPT and shown as
--     "Former user" (the reference becomes empty)

-- Helper: replace a foreign key on (table.column) -> target with a new ON DELETE rule.
create or replace function pg_temp.refk(p_table text, p_column text, p_target text, p_rule text)
returns void language plpgsql as $$
declare
  c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where con.contype = 'f' and con.conrelid = p_table::regclass and a.attname = p_column
  loop
    execute format('alter table %s drop constraint %I', p_table, c);
  end loop;
  execute format('alter table %s add constraint %I foreign key (%I) references %s on delete %s',
                 p_table, replace(p_table, 'public.', '') || '_' || p_column || '_fkey', p_column, p_target, p_rule);
end $$;

-- References that should be KEPT (history), shown as "Former user": nullable + set null.
alter table public.tasks alter column created_by drop not null;
alter table public.task_activity alter column actor_id drop not null;
alter table public.task_notes alter column author_id drop not null;
alter table public.task_attachments alter column uploaded_by drop not null;

do $$ begin
  perform pg_temp.refk('public.tasks', 'created_by', 'public.profiles (id)', 'set null');
  perform pg_temp.refk('public.task_activity', 'actor_id', 'public.profiles (id)', 'set null');
  perform pg_temp.refk('public.task_notes', 'author_id', 'public.profiles (id)', 'set null');
  perform pg_temp.refk('public.task_attachments', 'uploaded_by', 'public.profiles (id)', 'set null');
  perform pg_temp.refk('public.task_assignees', 'assigned_by', 'public.profiles (id)', 'set null');
  perform pg_temp.refk('public.task_labels', 'created_by', 'public.profiles (id)', 'set null');
end $$;

-- References that belong to the person: removed with them.
do $$ begin
  perform pg_temp.refk('public.task_assignees', 'user_id', 'public.profiles (id)', 'cascade');
  perform pg_temp.refk('public.notifications', 'user_id', 'public.profiles (id)', 'cascade');
end $$;

-- Deleting the login removes the profile (and, through the rules above, the rest).
do $$ begin
  perform pg_temp.refk('public.profiles', 'id', 'auth.users (id)', 'cascade');
end $$;

-- Step 1 of deleting a user (admin only): take them off their tasks the
-- normal way, so To Do tasks left with nobody return to Unassigned.
-- The server then deletes the login, which removes everything else.
create or replace function public.prepare_user_delete(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Only an admin can manage users.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You can''t delete your own account.' using errcode = '42501';
  end if;

  for r in
    select t.id, t.status from public.tasks t
    join public.task_assignees a on a.task_id = t.id and a.user_id = p_user_id
    for update of t
  loop
    delete from public.task_assignees where task_id = r.id and user_id = p_user_id;
    if r.status = 'todo' and not exists (select 1 from public.task_assignees where task_id = r.id) then
      perform public._set_status(r.id, 'unassigned');
    end if;
  end loop;
end;
$$;

revoke all on function public.prepare_user_delete(uuid) from public, anon;
grant execute on function public.prepare_user_delete(uuid) to authenticated;
