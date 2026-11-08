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

## Security rules

- The `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be prefixed with `NEXT_PUBLIC_`.
- Public sign-up stays disabled in Supabase (Authentication → Sign In / Providers → Email → turn off "Allow new users to sign up").
- All permissions are enforced by RLS or server functions, never only in the UI.

## Build progress

1. [x] Project setup
2. [x] Auth and roles
3. [x] Admin screen
4. [ ] Board (read-only) + create task
5. [ ] Task flow (grab / join / leave / move / approve / reject)
6. [ ] Task detail panel (notes + activity)
7. [ ] Polish (realtime, filters, overdue, notifications)
