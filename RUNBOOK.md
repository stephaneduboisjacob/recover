# Deployment runbook

This is a generic deployment template. Replace example hostnames and paths with values for your environment. The checked-in service and Nginx files are examples, not a record of a live host.

## Prerequisites

- A supported Node.js 24 runtime and npm.
- PostgreSQL, Redis, and a protected environment file outside the repository.
- A domain and TLS termination configured by the operator.

## Deploy outline

1. Create a dedicated service account and install the checkout under a directory such as `/opt/recover`.
2. Configure `DATABASE_URL`, `REDIS_URL`, `PUBLIC_URL`, `WEB_ORIGIN`, `SESSION_SECRET`, encryption keys, and provider credentials in a protected file such as `/etc/recover/recover.env`.
3. Install dependencies from the lockfile, generate the Prisma client, apply migrations with the migration role, and build the workspaces.
4. Start the API and worker on private interfaces. Serve the built web client through Nginx or an equivalent TLS-terminating proxy. Example HTTP and TLS configurations are in `deploy/nginx/`.
5. Set the OAuth callback URLs in each provider console to the deployment's public origin. Use provider sandbox credentials for staging.
6. Verify tenant isolation, consent checks, webhook signatures, audit records, backup restoration, and rollback procedures before enabling real customer workflows.

Never commit `.env`, provider tokens, payment credentials, customer exports, or production logs. Encrypt backups and restrict access to credentials and database dumps. Review local laws and provider requirements before using payment, messaging, or customer-data features.

## Contact

Stephane Jacob <jacobstephane@outlook.com>
