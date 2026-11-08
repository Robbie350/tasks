# Deploying to the Oracle VPS

Target: Ubuntu on Oracle Cloud free tier (Ampere A1, ARM64).
Result: the app at `https://tasks.yourdomain.com`, HTTPS handled by Caddy.
Supabase stays on Supabase cloud.

---

## 1. DNS (at your domain provider)

Add one record:

| Type | Name    | Value                   | TTL  |
|------|---------|-------------------------|------|
| A    | `tasks` | your VPS public IPv4    | 300  |

If you use Cloudflare, set the record to **DNS only** (grey cloud) for the first
deploy so Caddy can get its certificate.

Check it from any computer (it should print the VPS IP):

```bash
dig +short tasks.yourdomain.com
```

## 2. Open ports 80 and 443 (Oracle has TWO firewalls)

**a) Oracle Cloud console:** Networking → Virtual cloud networks → your VCN →
Security Lists (or the subnet's Network Security Group) → Add Ingress Rules:

- Source `0.0.0.0/0`, TCP, destination port `80`
- Source `0.0.0.0/0`, TCP, destination port `443`

**b) On the VPS itself:** Oracle's Ubuntu images ship with iptables rules that
block everything except SSH. Insert the rules *before* the final REJECT, then save:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

(Do not run `ufw enable` on top of this; it can lock you out of SSH.)

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in, then check: `docker run --rm hello-world`.

## 4. Get the code onto the VPS

```bash
git clone https://github.com/YOUR-USER/team-task-board.git
cd team-task-board
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in `.env`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase → Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` – same page (secret; stays on the server)
- `DOMAIN=tasks.yourdomain.com`
- `SUPABASE_DB_URL` – Supabase → **Connect** → *Session pooler* string (IPv4), with your DB password

## 5. Start it

```bash
docker compose up -d --build
docker compose logs -f caddy
```

Wait for a line saying the certificate was obtained, then open
`https://tasks.yourdomain.com`. The Supabase badge should say **Connected**.

Updating later:

```bash
git pull && docker compose up -d --build
```

The first build takes a few minutes on the ARM CPU; later builds are faster.

## 6. Nightly database backup

Test it once:

```bash
./deploy/backup.sh
```

Then schedule it (03:15 every night):

```bash
(crontab -l 2>/dev/null; echo "15 3 * * * $HOME/team-task-board/deploy/backup.sh >> $HOME/backup.log 2>&1") | crontab -
```

Backups land in `deploy/backups/` and are kept for 14 days. To keep a copy off
the VPS too, occasionally download one with `scp`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser times out | Step 2 – one of the two firewalls still blocks 80/443 |
| Caddy log: certificate / ACME errors | DNS not pointing at the VPS yet, or Cloudflare proxy on |
| Badge says "Not configured" | `.env` values missing; rebuild with `docker compose up -d --build` (public keys are baked in at build time) |
| `pg_dump` connection error | Use the *Session pooler* string, not the direct one (direct is IPv6-only) |
