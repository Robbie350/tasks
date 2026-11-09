# Team Task Board

Internal kanban board: Next.js (App Router) + TypeScript, Tailwind + shadcn/ui,
dnd-kit, Supabase (auth, Postgres, RLS, realtime). Deployed with Coolify on an
Oracle Cloud VPS (Dockerfile build); Supabase stays on Supabase cloud.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev                  # http://localhost:3000
```

The home page shows a Supabase status badge: **Connected** means the URL and key work.

## Deploying

See [deploy/DEPLOY.md](deploy/DEPLOY.md): DNS, Coolify app setup, environment variables, nightly backups.

## Project layout

- `src/app/` – routes (App Router)
- `src/components/ui/` – shadcn/ui components (add more with `npx shadcn@latest add <name>`)
- `src/lib/supabase/client.ts` – browser client (Client Components)
- `src/lib/supabase/server.ts` – server client (Server Components / Actions), `server-only`
- `src/lib/supabase/env.ts` – public env vars only
- `Dockerfile` – production image (Coolify builds this)
- `deploy/` – deployment guide and backup script
- `supabase/` – database scripts and first-admin setup ([supabase/README.md](supabase/README.md))
- `src/middleware.ts` – refreshes the session, sends signed-out visitors to `/login`
- `src/lib/auth.ts` – `requireProfile()` / `requireRole()` for pages and server actions
- `src/lib/supabase/admin.ts` – secret-key client, server-only; used after an admin check
- `src/app/(app)/admin/users/` – user management (admin only)
- `src/i18n/` – translations: `en.ts` is the source; `ru.ts` and `uz.ts` must have the same keys (TypeScript checks this). Server text: `getI18n()`; client text: `useT()`
- `src/lib/rules.ts` – which buttons / drop targets the UI offers (the database enforces the same rules)
- `src/app/(app)/task-actions.ts` – server actions that call the task database functions
- `src/components/board/` – board, cards, drag and drop, task panel
- `src/components/personal/` – personal board (private per user; the browser writes directly, RLS limits everyone to their own rows)
- `src/components/realtime-refresher.tsx` – live updates (Supabase Realtime → refresh)
- `src/components/notification-bell.tsx` – in-app notifications

## Task flow rules (agreed)

These refine the original spec and are what step 5 enforces in the database.

| Action | Who | Result |
|---|---|---|
| Create task | managers | assignees → **To Do**, nobody → **Unassigned** |
| Grab | any specialist or manager | Unassigned → To Do, grabber assigned |
| Join | any specialist or manager | allowed in To Do, In Progress **and Review** |
| Leave | anyone on the task | last person leaves in **To Do** → back to Unassigned; in **In Progress / Review** → task **stays** in its column with nobody on it |
| Move To Do → In Progress → Review | only people **assigned** to the task | |
| Approve (Review → Done) | a manager **not assigned** to the task | |
| Reject (Review → In Progress) | a manager **not assigned** to the task | note required, assignees notified |
| Reopen Done | nobody (v1) | create a new task instead |

Admins manage users only: they can't create, be assigned to, move or approve tasks.

## Security rules

- The `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be prefixed with `NEXT_PUBLIC_`.
- Public sign-up stays disabled in Supabase (Authentication → Sign In / Providers → Email → turn off "Allow new users to sign up").
- All permissions are enforced by RLS or server functions, never only in the UI.

## Build progress

1. [x] Project setup
2. [x] Auth and roles
3. [x] Admin screen
4. [x] Board (read-only) + create task
5. [x] Task flow (grab / join / leave / move / approve / reject)
6. [x] Task detail panel (notes + activity)
7. [x] Polish (realtime, filters, overdue, notifications)

### After v1

- [x] A: My account (name, password) and themes (light / dark / system, accent colour)
- [x] B: Languages (English, Russian, Uzbek)
- [x] C: Personal board
- [x] D: Phone layout, archive Done, search and labels
- [x] E: Checklists and attachments on team tasks
- [x] F: Reports (and profile photos)
- [x] G: Telegram notifications
