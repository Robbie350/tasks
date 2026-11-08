-- Step 3: let the server (secret / service-role key) manage profiles.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- "Automatically expose new tables" is off in this project, so even the
-- service role needs explicit grants. The service role bypasses RLS and is only
-- used by server code after it has checked that the caller is an admin.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;
