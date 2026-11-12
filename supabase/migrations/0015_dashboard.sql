-- Dashboard: when did each open task last see any activity? (for "stuck" tasks)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

create or replace function public.dashboard_last_activity()
returns table (task_id uuid, last_activity_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;
  return query
  select t.id, greatest(t.updated_at, coalesce(max(a.created_at), t.created_at), coalesce(max(n.created_at), t.created_at))
  from public.tasks t
  left join public.task_activity a on a.task_id = t.id
  left join public.task_notes n on n.task_id = t.id
  where t.status <> 'done'
  group by t.id;
end;
$$;

revoke all on function public.dashboard_last_activity() from public, anon;
grant execute on function public.dashboard_last_activity() to authenticated;
