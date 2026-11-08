-- Phase A: personal preferences (theme, accent colour, language)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

alter table public.profiles
  add column if not exists theme  text not null default 'system',
  add column if not exists accent text not null default 'neutral',
  add column if not exists locale text not null default 'en';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_theme_check') then
    alter table public.profiles add constraint profiles_theme_check
      check (theme in ('light', 'dark', 'system'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_accent_check') then
    alter table public.profiles add constraint profiles_accent_check
      check (accent in ('neutral', 'blue', 'green', 'violet', 'orange', 'rose'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_locale_check') then
    alter table public.profiles add constraint profiles_locale_check
      check (locale in ('en', 'ru', 'uz'));
  end if;
end $$;

-- Users update their OWN name and preferences. Role, email and active status
-- stay admin-only (no column is writable from the browser directly).
create or replace function public.update_my_profile(
  p_full_name text default null,
  p_theme     text default null,
  p_accent    text default null,
  p_locale    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;
  if p_full_name is not null and char_length(btrim(p_full_name)) not between 1 and 100 then
    raise exception 'Enter a name (up to 100 characters).' using errcode = '22023';
  end if;

  update public.profiles
  set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
      theme     = coalesce(p_theme, theme),
      accent    = coalesce(p_accent, accent),
      locale    = coalesce(p_locale, locale)
  where id = auth.uid();
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;
