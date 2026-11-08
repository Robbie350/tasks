-- Step 6: notes thread
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- Rules:
--   add     any active manager or specialist (not the admin)
--   edit    the author only; rejection notes can't be edited
--   delete  the author only; rejection notes can't be deleted
-- Notes are read through the existing "Active users can view notes" policy.

create or replace function public.add_note(p_task_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public._require_worker();
  if p_body is null or char_length(btrim(p_body)) = 0 then
    raise exception 'A note can''t be empty.' using errcode = '22023';
  end if;
  if char_length(btrim(p_body)) > 5000 then
    raise exception 'Keep notes under 5000 characters.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tasks where id = p_task_id) then
    raise exception 'That task no longer exists.' using errcode = 'P0002';
  end if;

  insert into public.task_notes (task_id, author_id, body)
  values (p_task_id, auth.uid(), btrim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

-- The caller's own, non-rejection note, locked for change.
create or replace function public._own_note(p_note_id uuid)
returns public.task_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.task_notes;
begin
  perform public._require_worker();
  select * into v_note from public.task_notes where id = p_note_id for update;
  if not found then
    raise exception 'That note no longer exists.' using errcode = 'P0002';
  end if;
  if v_note.author_id <> auth.uid() then
    raise exception 'You can only change your own notes.' using errcode = '42501';
  end if;
  if v_note.is_rejection then
    raise exception 'Rejection notes are part of the review record and can''t be changed.'
      using errcode = '42501';
  end if;
  return v_note;
end;
$$;

create or replace function public.edit_note(p_note_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._own_note(p_note_id);
  if p_body is null or char_length(btrim(p_body)) = 0 then
    raise exception 'A note can''t be empty.' using errcode = '22023';
  end if;
  if char_length(btrim(p_body)) > 5000 then
    raise exception 'Keep notes under 5000 characters.' using errcode = '22023';
  end if;
  update public.task_notes set body = btrim(p_body) where id = p_note_id;
end;
$$;

create or replace function public.delete_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._own_note(p_note_id);
  delete from public.task_notes where id = p_note_id;
end;
$$;

revoke all on function public._own_note(uuid) from public, anon, authenticated;
revoke all on function public.add_note(uuid, text) from public, anon;
revoke all on function public.edit_note(uuid, text) from public, anon;
revoke all on function public.delete_note(uuid) from public, anon;
grant execute on function public.add_note(uuid, text) to authenticated;
grant execute on function public.edit_note(uuid, text) to authenticated;
grant execute on function public.delete_note(uuid) to authenticated;
