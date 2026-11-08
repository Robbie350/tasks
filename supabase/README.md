# Database setup (Supabase)

SQL scripts live in `migrations/` and are run **in order**, by hand, in the
Supabase dashboard: **SQL Editor → New query → paste the whole file → Run**.
Each script is safe to run again.

| File | Step | What it creates |
|---|---|---|
| `0001_profiles.sql` | 2 | `profiles` table, roles, auto-profile trigger, security rules |
| `0002_admin_access.sql` | 3 | lets the server's secret key manage profiles (admin screen) |

## Creating the first admin (once)

There is no sign-up, so the very first admin is made by hand:

1. Supabase → **Authentication → Users → Add user → Create new user**.
   Enter your email and a strong password, keep **Auto Confirm User** ticked.
2. SQL Editor → run (with your own email and name):

   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Your Name'
   where email = 'you@example.com';
   ```

3. Sign in at `https://tasks.yourdomain.com`. The top right should show your
   name and **Admin**.

From step 3 on, the admin creates everyone else from the app.

## How roles are protected

- A user's role is stored in `profiles.role`. Browsers can **read** profiles but
  can't insert, change or delete any, so nobody can promote themselves.
- New users get their role from `app_metadata`, which only the server can set.
- Deactivated users (`is_active = false`) can't sign in, and the database
  shows them nothing even if an old session is still open.
- Auth users can't be deleted while they have a profile: deactivate instead,
  so their name stays on past notes and activity.
