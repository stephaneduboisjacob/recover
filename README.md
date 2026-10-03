# RECOVER

RECOVER finds revenue that a business has already earned but has not collected. It connects customer and payment records, ranks follow-up opportunities, drafts approval-gated messages, and attributes confirmed payments.

## Architecture

```mermaid
flowchart LR
  Browser[React + Vite dashboard and site] -->|HTTPS| Nginx[Nginx]
  Nginx -->|/api and /webhooks| API[Fastify API]
  Nginx -->|static files| Web[Built React assets]
  API --> PG[(PostgreSQL 18)]
  API --> Redis[(Redis / BullMQ)]
  Redis --> Worker[Detection and workflow worker]
  Worker --> PG
  Worker --> Providers[CRM · Stripe · Shopify · accounting]
  API --> Providers
  Providers -->|signed webhooks| Nginx
```

The monorepo uses npm workspaces. Prisma owns the tenant-aware schema and migrations. `packages/integrations` contains the shared adapter contracts, OAuth setup, credential encryption, demo adapters, and initial provider adapters. BullMQ jobs retry with exponential backoff. Outbound actions are recorded with payload hashes and actor attribution.

## Local development

Requirements: Node.js 24, npm 11, Docker Compose, and PostgreSQL 18. For a fully containerized local database and mail sink:

```bash
docker compose --profile dev up -d postgres redis mailhog
npm install
cp .env.example .env
```

Set `DATABASE_URL=postgresql://recover_app:recover-local-only@127.0.0.1:5433/recover_dev?schema=public`, `REDIS_URL=redis://127.0.0.1:6381`, `WEB_ORIGIN=http://localhost:5173`, `COOKIE_SECURE=false`, and `SMTP_HOST=127.0.0.1` / `SMTP_PORT=1025` in the local `.env`. Then run:

```bash
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open `http://localhost:5173`. Mailhog is at `http://127.0.0.1:8025`. The seeded demo login is `demo@recover.test` with password `RecoverDemo!2026Pass`. Demo contacts use `.test` domains and the demo payment flow never captures a real payment.

The dashboard demo headline is data-driven from the seeded workspace; if the demo data is not loaded, the public API falls back to $84,219 found and $17,430 recovered.

## Tests and builds

```bash
npm test
npm run test:smoke
npm run build
```

Vitest covers the six detection categories and mocked CRM, phone, commerce, invoicing, email, and payment adapter behavior. Playwright smoke coverage opens the landing page and dashboard. Provider test credentials are required for real network integration checks.

## Connectors

Configure each OAuth application's callback URL as `https://recover.btcpay.exchange/api/integrations/oauth/callback` (or the equivalent local callback). The workspace integrations screen starts OAuth for HubSpot, Salesforce, Pipedrive, Google/Gmail, Microsoft/Outlook, Shopify, QuickBooks, Xero, and Stripe Connect. Tokens are encrypted with AES-256-GCM using `SESSION_SECRET` before writing to PostgreSQL. The worker refreshes expiring OAuth tokens where the provider supports refresh tokens and marks failed connections for reauthorization.

Twilio uses a workspace credential form for Account SID, Auth Token, and sending number. Point inbound SMS to `/api/webhooks/twilio/sms` and incoming call status to `/api/webhooks/twilio/voice`; configure the status callback as `/api/webhooks/twilio/voice-status`. Twilio signatures are checked against the matching connected workspace credential. Stripe Connect sends payment events to `/api/webhooks/stripe`; RECOVER billing events use the platform secret and meter name. BTCPay invoices use a workspace store URL, store ID, and API key, with signed events posted to `/api/webhooks/btcpay`. Configure email replies to `/api/webhooks/email/inbound` with the `X-RECOVER-Webhook-Secret` header.

Shopify, Stripe, HubSpot, Salesforce, Pipedrive, QuickBooks and Xero source adapters normalize recoverable records into `Entity` rows. Detection runs every 15 minutes for connected workspaces and can be retried safely. The first release includes working provider calls for Stripe, Shopify, HubSpot, Pipedrive, Salesforce, QuickBooks, Xero, Gmail, Outlook, SMTP, Twilio and BTCPay. Remaining CRM and telephony event types can use the same adapter contract.

## Billing

Starter, Growth, and Scale map to `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, and `STRIPE_PRICE_SCALE`. `POST /api/billing/checkout` opens Stripe Checkout for the base subscription. RECOVER records a default 15% attribution fee when a payment is confirmed. It stores an idempotent `UsageRecord` and reports the fee through Stripe Billing meter events when the workspace has an active RECOVER Stripe customer subscription. Set the corresponding meter event name in `STRIPE_METER_EVENT_NAME`.

Stripe test keys can be used in a staging deployment. Stripe Connect is used for a business's payment links; the platform secret is reserved for RECOVER's own subscription and usage billing. BTCPay is available as the alternative customer payment-link provider.

## Compliance and tenant security

- Workspaces and memberships scope all application reads and writes. Owner/admin actions govern integration setup, consent changes, approvals and billing.
- Email, SMS, and voice sends require a recorded opt-in for that channel. Consent is checked again at send time; quiet hours are checked when the message is drafted and sent. SMS STOP/UNSUBSCRIBE and email unsubscribe replies create opt-out records.
- Email sending requires a configured physical postal address and includes an unsubscribe instruction. SMS includes STOP instructions. Provider replies are classified as interested, not interested, paid, question, or other.
- Invoice and subscription follow-up requires a customer jurisdiction and human approval. No workflow step escalates to collections automatically.
- Every outbound message, payment link, approval, opt-out, workflow action and confirmed recovery has an audit event with timestamp, actor, payload hash and jurisdiction where relevant.
- Workspace OAuth credentials are encrypted at rest. Session cookies are HttpOnly, SameSite=Lax, Secure in production. PostgreSQL and Redis bind to loopback in deployment.
- Review TCPA, CAN-SPAM, GDPR, CCPA, quiet-hour, consent and retention requirements with counsel in each operating jurisdiction. RECOVER's controls support compliance work and do not replace legal advice.

## Environment variables

`.env.example` lists OAuth client IDs/secrets, Stripe, Twilio, BTCPay, SMTP, email webhook, session/encryption secret, optional LLM, and observability settings. Do not commit `.env` or provider tokens. Production uses `/home/sven/.config/recover/.env` with mode `0600`.

## Production deployment and runbook

The production host uses the already-installed PostgreSQL 18 service. It has a dedicated `recover_app` login and separate `recover_prod` and `recover_dev` databases. The API and worker run as the `sven` account with a protected environment file. RECOVER Redis runs in its own Docker container on `127.0.0.1:6381`; the existing host Redis on port 6379 is a different service and is left untouched.

The deployment sequence is:

1. `npm ci`, `npx prisma migrate deploy`, and `npm run db:seed`.
2. `npm run build`.
3. Enable `deploy/systemd/recover-api.service` and `deploy/systemd/recover-worker.service`.
4. Copy `apps/web/dist` into `/var/www/recover.btcpay.exchange` and enable `deploy/nginx/recover.btcpay.exchange`.
5. Run `nginx -t`, reload Nginx, issue the certificate with Certbot, then run `certbot renew --dry-run`.
6. Verify `/healthz`, `/metrics`, HTTPS, the redirect, and the dashboard in headless Chrome.

For deployment operations and rollback checks, see [RUNBOOK.md](RUNBOOK.md).
