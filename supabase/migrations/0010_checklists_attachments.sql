-- Phase E: checklists and file attachments on team tasks
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

-- New activity types for attachments.
alter table public.task_activity drop constraint if exists task_activity_action_check;
alter table public.task_activity add constraint task_activity_action_check check (action in (
  'created', 'assigned', 'grabbed', 'joined', 'left',
  'moved', 'approved', 'rejected', 'edited', 'attached', 'detached'));

-- ---------------------------------------------------------------------------
-- Checklist: [{ "id": "...", "text": "...", "done": false }, ...]
-- Editable by managers and by people assigned to the task (not when Done).
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_checklist_is_array') then
    alter table public.tasks add constraint tasks_checklist_is_array check (jsonb_typeof(checklist) = 'array');
  end if;
end $$;

create or replace function public.set_task_checklist(p_task_id uuid, p_checklist jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_role  public.user_role := public._require_worker();
  v_task  public.tasks;
  v_clean jsonb;
begin
  v_task := public._lock_task(p_task_id);

  if v_role <> 'manager' and not public._is_assignee(p_task_id, v_me) then
    raise exception 'Only managers and people on this task can change its checklist.' using errcode = '42501';
  end if;
  if v_task.status = 'done' then
    raise exception 'This task is already done.' using errcode = '55000';
  end if;
  if p_checklist is null or jsonb_typeof(p_checklist) <> 'array' or jsonb_array_length(p_checklist) > 50 then
    raise exception 'A checklist can have up to 50 items.' using errcode = '22023';
  end if;

  -- Keep only well-formed items: id, trimmed text (1-300 chars), done flag.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', left(coalesce(i ->> 'id', gen_random_uuid()::text), 64),
           'text', left(btrim(i ->> 'text'), 300),
           'done', coalesce((i ->> 'done')::boolean, false))), '[]'::jsonb)
  into v_clean
  from jsonb_array_elements(p_checklist) i
  where jsonb_typeof(i) = 'object' and char_length(btrim(coalesce(i ->> 'text', ''))) > 0;

  if v_clean = v_task.checklist then
    return;
  end if;

  update public.tasks set checklist = v_clean where id = p_task_id;

  -- One log entry per person per 10 minutes, not one per tick.
  if not exists (
    select 1 from public.task_activity
    where task_id = p_task_id and actor_id = v_me and action = 'edited'
      and details -> 'fields' ? 'checklist' and created_at > now() - interval '10 minutes'
  ) then
    insert into public.task_activity (task_id, actor_id, action, details)
    values (p_task_id, v_me, 'edited', jsonb_build_object('fields', jsonb_build_array('checklist')));
  end if;
end;
$$;

revoke all on function public.set_task_checklist(uuid, jsonb) from public, anon;
grant execute on function public.set_task_checklist(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Attachments. The files live in a PRIVATE storage bucket; browsers never
-- access it directly. The server checks permission with these functions,
-- then uploads / signs download links / deletes with the secret key.
-- ---------------------------------------------------------------------------
create table if not exists public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  uploaded_by  uuid not null references public.profiles (id),
  file_name    text not null check (char_length(file_name) between 1 and 200),
  path         text not null unique,
  size_bytes   bigint not null check (size_bytes >= 0),
  mime_type    text,
  created_at   timestamptz not null default now()
);
create index if not exists task_attachments_task_idx on public.task_attachments (task_id, created_at);

alter table public.task_attachments enable row level security;
revoke all on public.task_attachments from anon, authenticated;
grant select on public.task_attachments to authenticated;
grant select, insert, update, delete on public.task_attachments to service_role;

drop policy if exists "Active users can view attachments" on public.task_attachments;
create policy "Active users can view attachments" on public.task_attachments
  for select to authenticated using (public.is_active_user());

-- Called BEFORE uploading: may this user attach to this task?
create or replace function public.can_attach(p_task_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.task_status;
begin
  perform public._require_worker();
  select status into v_status from public.tasks where id = p_task_id;
  if not found then
    raise exception 'That task no longer exists.' using errcode = 'P0002';
  end if;
  if v_status = 'done' then
    raise exception 'This task is already done.' using errcode = '55000';
  end if;
  return true;
end;
$$;

create or replace function public.add_attachment(
  p_task_id uuid, p_path text, p_file_name text, p_size bigint, p_mime text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.can_attach(p_task_id);
  if p_path is null or split_part(p_path, '/', 1) <> p_task_id::text then
    raise exception 'Invalid file path.' using errcode = '22023';
  end if;

  insert into public.task_attachments (task_id, uploaded_by, file_name, path, size_bytes, mime_type)
  values (p_task_id, auth.uid(), left(btrim(p_file_name), 200), p_path, greatest(p_size, 0), left(p_mime, 200))
  returning id into v_id;

  insert into public.task_activity (task_id, actor_id, action, details)
  values (p_task_id, auth.uid(), 'attached', jsonb_build_object('file', left(btrim(p_file_name), 200)));
  return v_id;
end;
$$;

-- Uploader or any manager may remove. Returns the storage path to delete.
create or replace function public.remove_attachment(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public._require_worker();
  v_att  public.task_attachments;
begin
  select * into v_att from public.task_attachments where id = p_id for update;
  if not found then
    raise exception 'That file no longer exists.' using errcode = 'P0002';
  end if;
  if v_att.uploaded_by <> auth.uid() and v_role <> 'manager' then
    raise exception 'Only the person who uploaded a file, or a manager, can remove it.' using errcode = '42501';
  end if;

  delete from public.task_attachments where id = p_id;

  insert into public.task_activity (task_id, actor_id, action, details)
  values (v_att.task_id, auth.uid(), 'detached', jsonb_build_object('file', v_att.file_name));
  return v_att.path;
end;
$$;

revoke all on function public.can_attach(uuid) from public, anon;
revoke all on function public.add_attachment(uuid, text, text, bigint, text) from public, anon;
revoke all on function public.remove_attachment(uuid) from public, anon;
grant execute on function public.can_attach(uuid) to authenticated;
grant execute on function public.add_attachment(uuid, text, text, bigint, text) to authenticated;
grant execute on function public.remove_attachment(uuid) to authenticated;

-- Private bucket, 25 MB per file. No storage policies: only the server's
-- secret key can read or write it.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('task-files', 'task-files', false, 26214400)
    on conflict (id) do update set public = false, file_size_limit = 26214400;
  else
    raise notice 'storage schema not found; skipping bucket (not a Supabase database?)';
  end if;
end $$;

-- Live updates when files are added or removed.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_attachments') then
    alter publication supabase_realtime add table public.task_attachments;
  end if;
end $$;
