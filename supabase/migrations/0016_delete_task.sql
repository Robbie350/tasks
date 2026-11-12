-- Admin can delete a task permanently
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- Deleting a task also deletes its assignees, notes, activity, notifications
-- and attachment records (foreign keys cascade). Returns the storage paths of
-- its files so the server can remove them from the private bucket.

create or replace function public.delete_task(p_task_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Only the admin can delete tasks.' using errcode = '42501';
  end if;
  perform public._lock_task(p_task_id);

  select coalesce(array_agg(path), '{}') into v_paths
  from public.task_attachments where task_id = p_task_id;

  delete from public.tasks where id = p_task_id;
  return v_paths;
end;
$$;

revoke all on function public.delete_task(uuid) from public, anon;
grant execute on function public.delete_task(uuid) to authenticated;
