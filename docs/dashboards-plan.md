# Dashboards and task registry: brainstorm and build brief

## Brainstorm

**What people asked for:** a *reestr* (registry of all tasks), an overall dashboard for
managers, and a personal dashboard for each user (their own tasks and activity).

**Questions each screen should answer in 5 seconds**

| Who | Question | Answer on screen |
|---|---|---|
| Specialist | What do I do today? | My open tasks grouped: Overdue · Due today · This week · Later · No date |
| Specialist | Did anything happen to my work? | "Needs your attention": newly assigned + sent back from review (unread) |
| Specialist | How am I doing? | Finished this week / 30 days, on-time rate, open now |
| Specialist | What have I done lately? | My recent activity (last 15 actions) |
| Manager | What's waiting for me? | "Waiting for your review" (Review tasks I'm not on) |
| Manager | Is anything on fire? | Overdue tasks (most overdue first), stuck tasks (no activity for 7+ days), oldest unassigned |
| Manager | Is work balanced? | Workload per person: open, in review, overdue, finished (30 days) |
| Manager | Where is work piling up? | Tasks per board column (all steps), as bars |
| Manager / admin | What happened today? | Team activity feed (last 20 actions) |
| Anyone | Find any task, any time | Registry: one table of every task (open or finished) with filters and Excel export |

**Ideas considered and left out (for now)**
- Charts of trends: already in Reports; the dashboard links there instead of duplicating.
- Customisable widgets / drag-to-arrange dashboard: high effort, low value for one team.
- Making the dashboard the start page: keep the Board as home (it's where work happens);
  the dashboard is one click away. Easy to switch later.
- Gamification (streaks, leaderboards): risky for team morale; on-time rate is enough.

**Decisions**
- One **Dashboard** page. Everyone sees **My work**. Managers and the admin also see **Team**
  (tabs; managers land on My work, the admin on Team because the admin has no tasks).
- **Registry** replaces Archive: default shows **open** tasks; switch to Finished or All. Adds
  status/step, due date (red when overdue), created by; filter "Overdue only"; sort by due
  date. `/archive` keeps working (redirects to the Registry's Finished view).
- Everything respects existing permissions (RLS). "Stuck" uses a small read-only database
  function. Dates such as "due today" are worked out in the viewer's own time zone.
- Every number links to the Board or Registry filtered to those tasks where possible.
- English, Russian and Uzbek; light/dark; phone layout.

## Build brief (prompt to myself)

> Build a **Dashboard** page (`/dashboard`) and turn the Archive into a **Registry**
> (`/registry`, with `/archive` redirecting) for the Team Task Board (Next.js 15 App Router,
> Supabase with RLS, Tailwind, EN/RU/UZ dictionaries in `src/i18n`).
>
> 1. **Database** (`supabase/migrations/0015_dashboard.sql`, safe to re-run): a security-definer
>    function `dashboard_last_activity()` returning, for every open task, its last activity
>    time; refuses inactive users. No new tables.
> 2. **Data** (`src/lib/dashboard.ts`, server-only, user session so RLS applies): open tasks with
>    assignees; my finished tasks (30 days) with due dates for on-time rate; my unread
>    notifications; my last 15 activity rows; for managers/admin: last 20 team activity rows,
>    last-activity times, people, columns. Keep it to a handful of queries.
> 3. **UI** (`src/app/(app)/dashboard/`): stat tiles; grouped lists of task rows (number, title,
>    priority dot, due date, step) that open the task on the Board (`/?task=id`); workload table;
>    per-column bars (single hue, value labels, no chart library); activity feeds reusing the
>    activity sentences. Tabs My work / Team. Empty states that say what to do next.
> 4. **Registry**: extend the archive query with scope open/done/all (default open), "overdue
>    only", sort by due date; table gains Status/Step, Due and Created by columns; CSV gains
>    the same. Rename in nav to "Registry"; keep the export route.
> 5. **Nav**: Dashboard (first), Board, My board, Registry, Reports (managers/admin), Users (admin).
> 6. **Quality bar**: lint + typecheck + build clean; test the SQL against a local Postgres with
>    a realistic scenario; render both dashboards with sample data in light/dark and on a phone
>    and fix what looks wrong; no native dialogs; all text translated.
