# Deploying with Coolify

Target: the Oracle Cloud VPS (Ubuntu, ARM64) that already runs Coolify.
Result: the app at `https://tasks.yourdomain.com`.

- **Coolify** builds the `Dockerfile` from GitHub, runs the container, and its proxy
  (`coolify-proxy`) handles the domain and HTTPS certificate. Nothing extra to install.
- **Supabase** (database, login, realtime) stays on Supabase cloud.
- **Backups** run from a small cron job on the VPS host (section 4).

---

## 1. DNS (at your domain provider)

Add one record:

| Type | Name    | Value                   | TTL  |
|------|---------|-------------------------|------|
| A    | `tasks` | your VPS public IPv4    | 300  |

If you use Cloudflare, set it to **DNS only** (grey cloud) for the first deploy so the
certificate can be issued. Check from any computer:

```bash
dig +short tasks.yourdomain.com
```

Ports 80/443 are already open (your other Coolify apps use them).

## 2. Create the app in Coolify

1. Open Coolify → **Projects** → pick a project (or create "Tasks") → **+ New** → **Application**.
2. Source:
   - **Private Repository (with GitHub App)** if `Robbie350/tasks` is private. Follow
     Coolify's prompt to create/connect its GitHub App and give it access to the `tasks` repo.
   - **Public Repository** if it's public: paste `https://github.com/Robbie350/tasks`.
3. Branch: `main`.
4. **Build Pack: Dockerfile** (not Nixpacks, not Docker Compose).
5. **Ports Exposes: `3000`**.
6. Continue / Save.

On the app's **Configuration → General** page:

- **Domains:** `https://tasks.yourdomain.com` (include `https://` so Coolify gets a certificate).

## 3. Environment variables

App → **Environment Variables**. Add:

| Name | Value | Build time | Runtime |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → URL | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, `anon` `public` key | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, `service_role` key (needed from step 3) | ❌ | ✅ |

"Build time" is the checkbox Coolify labels **Available at Buildtime** (older versions:
**Build Variable?**). The `NEXT_PUBLIC_*` values must be available at build time because
Next.js bakes them into the browser code. The service-role key is secret: runtime only,
never build time.

Then click **Deploy**. Watch the build log; the first build on the ARM CPU takes a few
minutes. When it finishes, open `https://tasks.yourdomain.com` – the Supabase badge
should say **Connected**.

**Updates:** with the GitHub App source, Coolify redeploys automatically on every push to
`main`. With a public-repo source, click **Redeploy** (or set up the webhook Coolify shows).
If you change a `NEXT_PUBLIC_*` value, redeploy so it's rebuilt.

## 4. Nightly database backup (on the VPS host)

Supabase's free plan has no downloadable backups, so the VPS keeps its own.

Get the connection string: Supabase → **Connect** → **Session pooler** (works over IPv4).
Replace `[YOUR-PASSWORD]` with your database password.

On the VPS:

```bash
git clone https://github.com/Robbie350/tasks.git ~/tasks-repo
```

```bash
nano ~/.tasks-backup.env
```

Put in one line:

```
SUPABASE_DB_URL=postgresql://postgres.xxxx:YOUR-PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres
```

Lock it down and test:

```bash
chmod 600 ~/.tasks-backup.env
```

```bash
~/tasks-repo/deploy/backup.sh
```

It should print `Backup written: /home/ubuntu/tasks-backups/db-....sql.gz`.
Schedule it for 03:15 every night:

```bash
(crontab -l 2>/dev/null; echo "15 3 * * * $HOME/tasks-repo/deploy/backup.sh >> $HOME/tasks-backup.log 2>&1") | crontab -
```

Backups are kept 14 days in `~/tasks-backups`. Occasionally copy one off the VPS (`scp`).
If the repo is private, `git clone` asks for a username and a GitHub personal access
token as the password.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Build fails at `npm run build` | Check the Coolify build log; paste the error |
| Badge says "Not configured" | `NEXT_PUBLIC_*` vars missing or not ticked as build time; fix and redeploy |
| "No available server" / 404 from proxy | Domain not set on the app, or port not `3000` |
| Certificate errors | DNS not pointing at the VPS yet, or Cloudflare proxy (orange cloud) on |
| `pg_dump` connection error | Use the *Session pooler* string, not the direct one (direct is IPv6-only) |
