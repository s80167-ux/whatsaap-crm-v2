# WhatsApp CRM v2

Production-ready multi-tenant WhatsApp CRM starter built around a canonical contact model, resilient message ingestion, and Supabase-compatible PostgreSQL.

## Stack

- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL / Supabase
- Realtime: Supabase Realtime
- WhatsApp: Baileys multi-session with persistent auth

## Project Structure

```text
whatsapp-crm-v2/
|- apps/
|  |- api/
|  |- frontend/
|  `- whatsapp-connector/
|- backend/
|  |- src/
|  |  |- config/
|  |  |- controllers/
|  |  |- repositories/
|  |  |- routes/
|  |  |- services/
|  |  |- whatsapp/
|  |  |- app.ts
|  |  `- server.ts
|  |- package.json
|  `- tsconfig.json
|- frontend/
|  |- src/
|  |  |- api/
|  |  |- components/
|  |  |- hooks/
|  |  |- layouts/
|  |  |- pages/
|  |  |- types/
|  |  `- main.tsx
|  |- package.json
|  `- tsconfig.json
|- database/
|  `- schema.sql
|- infra/
|  `- sql/
|- packages/
|  `- shared/
`- docs/
   |- architecture.md
   |- rezeki-v2-migration-map.md
   `- rezeki-v2-task-list.md
```

## Rezeki SaaS Migration

- Execution task list: [docs/rezeki-v2-task-list.md](./docs/rezeki-v2-task-list.md)
- Current-to-target migration map: [docs/rezeki-v2-migration-map.md](./docs/rezeki-v2-migration-map.md)

The working `frontend/` and `backend/` apps remain active while the repository is migrated toward the target SaaS monorepo structure under `apps/`, `packages/`, and `infra/`.
The active app entrypoints now live under `apps/api`, `apps/frontend`, and `apps/whatsapp-connector`. The top-level `backend/` and `frontend/` folders are retained as legacy compatibility copies during the transition.

## Infra SQL

- Versioned SaaS migrations live in [infra/sql/migrations](./infra/sql/migrations)
- Default role permission seeds live in [infra/sql/seeds](./infra/sql/seeds)
- Legacy compatibility backfills live alongside the versioned migrations, including
  [006_whatsapp_accounts_legacy_compat.sql](./infra/sql/migrations/006_whatsapp_accounts_legacy_compat.sql)
  for CRM v1 databases that still carry old `whatsapp_accounts` fields.

## Run

1. Install dependencies: `npm install`
2. Copy env files from the examples in `apps/api/.env.example` and `apps/frontend/.env.example`
   Also copy `apps/whatsapp-connector/.env.example` for the connector service.
3. Apply the versioned SQL migrations in `infra/sql/migrations` in order. Use `database/schema.sql` only for legacy local setups that have not moved to the SaaS schema.
4. If you are upgrading an existing CRM v1 database, apply `006_whatsapp_accounts_legacy_compat.sql` after `005`.
5. Apply `007_whatsapp_connector_runtime.sql` before starting multiple connector instances or enabling connector lease ownership.
6. Apply `009_message_dispatch_outbox.sql` before relying on durable outbound message dispatch.
7. Create an initial platform user:

```bash
npm run create:user -- --email owner@example.com --password StrongPass123 --role super_admin --fullName "Platform Owner"
```

8. Create an organization and then create an `org_admin` under that organization.
9. Start backend: `npm run dev:backend`
10. Start WhatsApp connector: `npm run dev:connector`
11. Start raw event worker: `npm run worker:raw-events`
  In production, `apps/api` now also starts an embedded raw event worker by default, so inbound WhatsApp events still drain if the standalone worker was not started. Set `EMBED_RAW_EVENT_WORKER=false` if you want only the dedicated worker process to handle raw events.
12. Start outbound message worker: `npm run worker:message-outbox`
13. Start frontend: `npm run dev:frontend`
14. If you are migrating existing data, rebuild projection tables once:

```bash
npm run worker:projections:rebuild
```

15. If raw event processing failed or you need a targeted replay:

```bash
npm run worker:raw-events:replay -- --organizationId <org-id> --statuses failed,ignored --limit 100
```

16. Refresh `usage_daily` after connector or message backfills:

```bash
npm run worker:usage-daily -- --days 7
```

## Environment Contracts

### Backend

- `DATABASE_URL`: PostgreSQL / Supabase Postgres connection string
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anon key for user auth flows
- `SUPABASE_SERVICE_ROLE_KEY`: backend-only admin key
- `API_PUBLIC_URL`: public backend origin used for OAuth callbacks, for example `https://api.example.com`. Local development falls back to `http://localhost:<PORT>`.
- `FRONTEND_URL`: allowed frontend origin for CORS
- `COOKIE_SECURE`: set to `true` in production
- `COOKIE_SAME_SITE`: defaults to `lax`; keep this unless your deployment requires a different cookie policy
- `COOKIE_DOMAIN`: set only when cookies must be shared across a parent domain
- `BAILEYS_AUTH_DIR`: persistent auth directory, e.g. `/data/baileys_auth` on Railway
- `CONNECTOR_BASE_URL`: internal URL for the standalone WhatsApp connector
- `CONNECTOR_INTERNAL_SECRET`: shared secret between backend and connector
- `ALLOW_LOCAL_CONNECTOR_SEND`: set to `true` only when a local connector owns a dev WhatsApp session
- `OUTBOUND_DISPATCH_MODE`: `immediate` for local development or `worker_only` for production-grade durable dispatch. Defaults to `worker_only` in production and `immediate` otherwise.
- `RAW_EVENT_WORKER_BATCH_SIZE`: number of raw events claimed per poll
- `RAW_EVENT_WORKER_POLL_INTERVAL_MS`: worker poll interval
- `RAW_EVENT_WORKER_STALE_AFTER_MS`: when a stuck `processing` event is returned to `pending`
- `RAW_EVENT_WORKER_MAX_RETRIES`: cap for automatic retries of failed raw events
- `MESSAGE_OUTBOX_WORKER_BATCH_SIZE`: number of outbound message jobs claimed per poll
- `MESSAGE_OUTBOX_WORKER_POLL_INTERVAL_MS`: outbound worker poll interval
- `MESSAGE_OUTBOX_WORKER_STALE_AFTER_MS`: when a stuck `processing` outbox job is returned to `pending`
- `MESSAGE_OUTBOX_WORKER_MAX_RETRIES`: cap for automatic retries of failed outbound jobs
- `EMAIL_SECRET_KEY`: encryption key for saved email sender SMTP passwords. Use a long random value in production.

### Email Campaign MVP

Email campaign sender setup is SMTP-only for this MVP:

- Custom SMTP: host, port, security mode, username, password or app password, sender name, from email, and optional reply-to.
- Gmail App Password: Gmail address plus an App Password. This maps internally to `smtp.gmail.com`, port `587`, STARTTLS, the Gmail address as username, and the App Password as the SMTP password.

Microsoft Outlook, Microsoft 365, Microsoft OAuth, Microsoft Graph, Azure App Registration, Entra ID, and Graph `Mail.Send` are not part of the MVP email sender flow.

### WhatsApp Connector

- `DATABASE_URL`: PostgreSQL / Supabase Postgres connection string
- `BAILEYS_AUTH_DIR`: persistent auth directory, e.g. `/data/baileys_auth`
- `CONNECTOR_INTERNAL_SECRET`: shared secret that must match the backend
- `CONNECTOR_INSTANCE_ID`: unique logical connector owner id, for example `connector-railway-1`
- `CONNECTOR_LEASE_TTL_MS`: lease staleness window before another connector can take over
- `CONNECTOR_HEARTBEAT_INTERVAL_MS`: lease heartbeat interval

For Railway deployments, do not leave `BAILEYS_AUTH_DIR` on the default relative path such as `./data/baileys_auth`.
Set it inside the persistent volume mount. For example, if Railway mounts the connector volume at `/app/data`, set:

```env
BAILEYS_AUTH_DIR=/app/data/baileys_auth
CONNECTOR_INSTANCE_ID=connector-railway-1
```

Never run a local development connector against the production/shared database unless you are intentionally taking ownership of those WhatsApp sessions. The connector refuses this by default with `ALLOW_NON_PRODUCTION_REMOTE_CONNECTOR=false`.

### Dev WhatsApp Sends

When running the API locally against a shared or production-like database, point `CONNECTOR_BASE_URL` to the connector that owns the WhatsApp sessions, for example the Railway connector. The API blocks sends to `localhost:4010` in development by default so local dev cannot create false pending/failed messages against sessions owned elsewhere.

Use `ALLOW_LOCAL_CONNECTOR_SEND=true` only for connector-specific development with a separate local WhatsApp account/session.

### Frontend

- `VITE_API_BASE_URL`: backend API base URL
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon key

## Hybrid Google Login Setup

Email/password login remains available and continues to use the backend session cookie model. Google login is optional: it authenticates the user through Supabase Google OAuth, then the backend resolves that Supabase user against CRM access tables before issuing the same CRM cookies.

To enable Google in Supabase:

1. Go to the Supabase Dashboard.
2. Open Authentication.
3. Open Providers.
4. Enable the Google provider.
5. Add the Google Client ID.
6. Add the Google Client Secret.
7. Add the callback URL:

```text
Production: https://<api-domain>/api/auth/google/callback
Local: http://localhost:4000/api/auth/google/callback
```

Backend production env should include:

```env
API_PUBLIC_URL=https://<api-domain>
FRONTEND_URL=https://<frontend-domain>
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
```

Set `COOKIE_DOMAIN` only if your deployment requires cross-subdomain cookies.

Google login does not create public signup. Unknown Google accounts are blocked, and CRM access still depends on `platform_super_admins` or an active `organization_users.auth_user_id` mapping with the existing organization, role, status, and permission checks.

## Smoke Test

1. Log in as `super_admin`
2. Create an organization
3. Create an `org_admin`
4. Create or reconnect a WhatsApp account
5. Assign a contact to yourself
6. Assign a conversation to yourself
7. Send a message and confirm the bubble shows queued, then ack status
8. Confirm the new message appears in inbox without manual refresh and that contact/inbox ordering stays stable
9. Verify dashboard and platform pages load for the expected roles

## Current Local Verification

- API verified healthy on `http://localhost:4000/api/health`
- WhatsApp connector verified healthy on `http://localhost:4010/health`
- `worker:raw-events` and `worker:message-outbox` verified running locally
- Super-admin login verified against Supabase Auth
- `GET /platform/organizations` verified against the legacy-compatible `organizations` schema

## Recovery Endpoints

- `GET /admin/raw-events?organization_id=<uuid>&status=failed,ignored&limit=100`
- `POST /admin/raw-events/replay`

## Platform Diagnostics

- `GET /platform/usage`
- `GET /platform/health`
- `GET /platform/audit-logs`

Example payload:

```json
{
  "organizationId": "00000000-0000-0000-0000-000000000000",
  "statuses": ["failed", "ignored"],
  "limit": 100,
  "processNow": true
}
```

Deployment notes are in [docs/architecture.md](./docs/architecture.md).
