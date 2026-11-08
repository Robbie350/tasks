-- Step 7: live updates and notification read state
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Mark notifications as read. Only ever touches the caller's own rows.
--   mark_notifications_read()                 -> all of mine
--   mark_notifications_read(p_ids => '{...}') -> these ones
--   mark_notifications_read(p_task_id => id)  -> all of mine for this task
-- ---------------------------------------------------------------------------
create or replace function public.mark_notifications_read(
  p_ids     uuid[] default null,
  p_task_id uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set is_read = true
  where user_id = auth.uid()
    and public.is_active_user()
    and not is_read
    and (p_ids is null or id = any (p_ids))
    and (p_task_id is null or task_id = p_task_id);
$$;

revoke all on function public.mark_notifications_read(uuid[], uuid) from public, anon;
grant execute on function public.mark_notifications_read(uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes on these tables to signed-in browsers.
-- Supabase applies the same RLS policies, so people only receive rows they
-- are allowed to read (e.g. only their own notifications).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found; skipping (not a Supabase database?)';
    return;
  end if;
  foreach t in array array['tasks', 'task_assignees', 'task_notes', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
