-- Task numbers (#1, #2, ...) for finding tasks, especially old ones
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

create sequence if not exists public.task_number_seq;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'number'
  ) then
    alter table public.tasks add column number bigint;

    -- Existing tasks are numbered in the order they were created.
    update public.tasks t set number = n.rn
    from (select id, row_number() over (order by created_at, id) as rn from public.tasks) n
    where n.id = t.id;

    perform setval('public.task_number_seq', coalesce((select max(number) from public.tasks), 0) + 1, false);
  end if;
end $$;

alter table public.tasks alter column number set default nextval('public.task_number_seq');
update public.tasks set number = nextval('public.task_number_seq') where number is null;
alter table public.tasks alter column number set not null;
create unique index if not exists tasks_number_key on public.tasks (number);

-- Faster archive queries.
create index if not exists tasks_status_done_at_idx on public.tasks (status, done_at desc);
