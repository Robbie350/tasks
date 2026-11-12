# Database setup (Supabase)

SQL scripts live in `migrations/` and are run **in order**, by hand, in the
Supabase dashboard: **SQL Editor → New query → paste the whole file → Run**.
Each script is safe to run again.

| File | Step | What it creates |
|---|---|---|
| `0001_profiles.sql` | 2 | `profiles` table, roles, auto-profile trigger, security rules |
| `0002_admin_access.sql` | 3 | lets the server's secret key manage profiles (admin screen) |
| `0003_tasks.sql` | 4 | `tasks`, `task_assignees`, `task_activity`, `create_task()` |
| `0004_task_flow.sql` | 5 | `task_notes`, `notifications`, grab / join / leave / move / approve / reject / update functions |
| `0005_notes.sql` | 6 | `add_note`, `edit_note`, `delete_note` (authors only; rejection notes are locked) |
| `0006_realtime_notifications.sql` | 7 | `mark_notifications_read`, turns on Realtime for the board tables |
| `0007_preferences.sql` | A | theme / accent / language on profiles, `update_my_profile()` |
| `0008_personal_board.sql` | C | personal columns, cards, labels, settings (owner-only RLS) |
| `0009_archive_and_labels.sql` | D | `done_at` for archiving, team labels (`task_labels`, `set_task_labels()`) |
| `0010_checklists_attachments.sql` | E | task checklists, `task_attachments`, private `task-files` storage bucket (25 MB per file) |
| `0011_reports_avatars.sql` | F | report functions (managers + admin), `set_my_avatar()`, public `avatars` bucket (2 MB) |
| `0012_telegram.sql` | G | Telegram links, one-time link codes, notification sending queue |
| `0013_board_columns.sql` | — | admin-managed steps inside To Do / In Progress / Review (`board_columns`) |
| `0014_task_numbers.sql` | — | permanent task numbers (#1, #2, …), existing tasks numbered by creation order |
| `0016_delete_task.sql` | — | `delete_task()`: the admin deletes a task with its notes, history and files |
| `0015_dashboard.sql` | — | `dashboard_last_activity()` for the dashboard's "no activity for 7+ days" list |

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
