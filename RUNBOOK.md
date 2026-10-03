# RECOVER production runbook

## Deploy

Run from `/home/sven/recover` as `sven` unless a command uses `sudo`:

```bash
npm ci
npx prisma migrate deploy
npm run db:seed
npm run build
docker compose up -d redis
```

Copy the static site and systemd units, then enable the app services:

```bash
sudo install -d -o www-data -g www-data -m 755 /var/www/recover.btcpay.exchange
sudo rsync -a --delete apps/web/dist/ /var/www/recover.btcpay.exchange/
sudo install -m 644 deploy/systemd/recover-api.service /etc/systemd/system/recover-api.service
sudo install -m 644 deploy/systemd/recover-worker.service /etc/systemd/system/recover-worker.service
sudo install -m 644 deploy/systemd/recover-web.service /etc/systemd/system/recover-web.service
sudo systemctl daemon-reload
sudo systemctl enable --now recover-api recover-worker recover-web
```

The production environment file is `/home/sven/.config/recover/.env`, owned by `sven` with mode `0600`. Do not copy `.env.example` over it. PostgreSQL credentials are scoped to the `recover_app` role and `recover_prod` database. Redis is the RECOVER Docker container bound to `127.0.0.1:6381`.

## Nginx and TLS

The first install uses `deploy/nginx/recover.btcpay.exchange` as an HTTP-only ACME bootstrap vhost. Enable only the new site:

```bash
sudo install -m 644 deploy/nginx/recover.btcpay.exchange /etc/nginx/sites-available/recover.btcpay.exchange
sudo ln -s /etc/nginx/sites-available/recover.btcpay.exchange /etc/nginx/sites-enabled/recover.btcpay.exchange
sudo nginx -t
sudo systemctl reload nginx
```

Issue the certificate using the administrator email supplied for this deployment:

```bash
sudo certbot --nginx -d recover.btcpay.exchange --non-interactive --agree-tos -m ADMIN_EMAIL --redirect
```

Then install `deploy/nginx/recover.btcpay.exchange.ssl` over the vhost, test and reload:

```bash
sudo install -m 644 deploy/nginx/recover.btcpay.exchange.ssl /etc/nginx/sites-available/recover.btcpay.exchange
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status certbot.timer --no-pager
sudo certbot renew --dry-run
```

The vhost serves the Vite build from `/var/www/recover.btcpay.exchange`, proxies `/api/`, `/webhooks/`, `/healthz`, and `/metrics` to loopback port 3201, and forwards WebSocket upgrade headers. It applies HSTS, CSP, frame, MIME, referrer and permissions headers. The `recover-web.service` is a readiness check; Nginx serves the static files directly.

## Verify

```bash
curl -I http://recover.btcpay.exchange/
curl -I https://recover.btcpay.exchange/
curl -fsS https://recover.btcpay.exchange/healthz
curl -fsS https://recover.btcpay.exchange/api/demo
openssl s_client -connect recover.btcpay.exchange:443 -servername recover.btcpay.exchange </dev/null
sudo nginx -t
sudo ufw status numbered
```

Use headless Chrome or Playwright for the dashboard screenshot. Confirm the output in `test-results/dashboard.png`.

## Health and recovery

- `systemctl status recover-api recover-worker recover-web` checks service state.
- `journalctl -u recover-api -u recover-worker -f` follows structured service logs.
- `/healthz` verifies API and database connectivity; `/metrics` exposes Prometheus metrics.
- Worker scans run every 15 minutes. Failed jobs retry up to five times with exponential delay. Requeue a workspace scan by adding `scan-workspace` to BullMQ with its workspace ID.
- Stripe, Twilio, BTCPay and email hooks use stored event IDs or idempotency keys. Replayed events do not create duplicate recoveries.
- Do not mark an opportunity recovered until payment is confirmed. Confirmed payments create an idempotent usage record; Stripe meter submission uses the same idempotency identifier.
- For rollback, restore the previous static build and code revision, then `systemctl restart recover-api recover-worker`. Do not roll back a database schema by dropping tables; restore from the host's PostgreSQL backup procedure.

## Operational boundaries

RECOVER uses the host PostgreSQL service, does not bind its API outside loopback, and runs its Redis container on loopback. UFW allows inbound 80/443 and no longer allows inbound 5432. Keep those network rules and the existing Nginx sites intact. Never paste secrets into command output or commit `.env` files.
