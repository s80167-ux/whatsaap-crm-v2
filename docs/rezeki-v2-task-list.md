# Rezeki CRM v2 Task List

This task list converts the SaaS blueprint into an implementation roadmap for the current repository. The goal is to migrate from the existing `frontend` + `backend` scaffold into a production-oriented multi-tenant monorepo without breaking the working login and dashboard bootstrap path.

## Phase 0: Foundation and Migration Safety

Status: completed

- [ ] Create target monorepo structure:
  - `apps/frontend`
  - `apps/api`
  - `apps/whatsapp-connector`
  - `packages/shared`
  - `infra/sql`
- [ ] Preserve current working apps while migration happens incrementally.
- [ ] Add root workspace scripts aligned to the target app names.
- [ ] Add shared TypeScript base config and path conventions.
- [ ] Add migration notes that map current files to target destinations.
- [ ] Keep local run instructions valid throughout the migration.

## Phase 1: Database and Tenancy Model

Status: in progress

- [ ] Replace starter schema with SaaS schema in versioned SQL migrations.
- [ ] Create migrations for:
  - [ ] organizations
  - [ ] organization_users
  - [ ] platform_super_admins
  - [ ] role_permissions
  - [ ] organization_user_permissions
  - [ ] subscriptions
  - [ ] usage_daily
  - [ ] whatsapp_accounts
  - [ ] whatsapp_account_sessions
  - [ ] whatsapp_connection_events
  - [ ] raw_channel_events
  - [ ] processed_event_keys
  - [ ] contacts
  - [ ] contact_identities
  - [ ] contact_owners
  - [ ] contact_merge_history
  - [ ] merge_candidates
  - [ ] conversations
  - [ ] conversation_assignments
  - [ ] media_assets
  - [ ] messages
  - [ ] message_status_events
  - [ ] leads
  - [ ] activities
  - [ ] sales_orders
  - [ ] sales_order_items
  - [ ] inbox_thread_summary
  - [ ] contact_summary
  - [ ] dashboard_metrics_daily
- [ ] Add indexes for all hot paths in the prompt.
- [ ] Add seed script for default `role_permissions`.
- [ ] Add starter RLS policies and helper functions.

## Phase 2: Authentication and Authorization

- [ ] Replace custom JWT-first auth with Supabase Auth-backed identity resolution.
- [ ] Build current-organization-user resolver middleware.
- [ ] Add super admin bypass logic.
- [ ] Add permission checker middleware.
- [ ] Add role + permission enforcement for query endpoints.
- [ ] Add role + permission enforcement for command endpoints.
- [ ] Define dashboard visibility rules per role:
  - [ ] super_admin
  - [ ] org_admin
  - [ ] manager
  - [ ] agent
  - [ ] user

## Phase 3: API Server Modularization

- [ ] Restructure API into modules:
  - [ ] auth
  - [ ] organizations
  - [ ] users
  - [ ] permissions
  - [ ] contacts
  - [ ] conversations
  - [ ] messages
  - [ ] activities
  - [ ] leads
  - [ ] sales
  - [ ] whatsapp
  - [ ] dashboard
  - [ ] platform
- [ ] Standardize repository/service/controller/route layering.
- [ ] Add centralized error handling and structured logging conventions.
- [ ] Add request validation via Zod in every module.
- [ ] Add worker entrypoints under `apps/api/src/workers`.

## Phase 4: WhatsApp Connector Service

- [ ] Extract Baileys session management into `apps/whatsapp-connector`.
- [ ] Keep WhatsApp connection state isolated from API CRUD concerns.
- [ ] Add session ownership / heartbeat strategy for one logical connector owner per account.
- [ ] Persist connection events to `whatsapp_connection_events`.
- [ ] Persist session lifecycle to `whatsapp_account_sessions`.
- [ ] Expose controlled internal ingestion handoff into raw event storage.
- [ ] Add reconnect and health-check commands.

## Phase 5: Raw Event Ingestion and Workers

- [ ] Write inbound events to `raw_channel_events` only.
- [ ] Build deterministic `event_key` generation.
- [ ] Add idempotent worker claim/process/retry loop.
- [ ] Add `processed_event_keys` dedup checks.
- [ ] Normalize JID and phone identities safely.
- [ ] Upsert `contact_identities`.
- [ ] Find or create canonical contacts using anchor-quality rules.
- [ ] Find or create conversations using:
  - [ ] organization
  - [ ] channel
  - [ ] whatsapp account
  - [ ] external thread key
- [ ] Insert messages idempotently.
- [ ] Update conversation timestamps and unread counters.
- [ ] Mark events as processed, failed, or ignored.
- [ ] Add reconciliation and replay worker.

## Phase 6: Projection Tables and Query Models

- [ ] Populate `inbox_thread_summary`.
- [ ] Populate `contact_summary`.
- [ ] Populate `dashboard_metrics_daily`.
- [ ] Ensure frontend reads projection/query endpoints instead of raw tables.
- [ ] Add dirty-thread projection refresh strategy after message ingestion.
- [ ] Add repair/rebuild scripts for projections.

## Phase 7: Role-Based Dashboards

- [ ] Implement:
  - [ ] `GET /dashboard/agent`
  - [ ] `GET /dashboard/admin`
  - [ ] `GET /dashboard/super-admin`
- [ ] Implement:
  - [ ] `GET /inbox/threads`
  - [ ] `GET /inbox/threads/:conversationId/messages`
  - [ ] `GET /contacts`
  - [ ] `GET /contacts/:contactId`
  - [ ] `GET /platform/organizations`
  - [ ] `GET /platform/usage`
- [ ] Ensure agent/user dashboards are assignment-scoped.
- [ ] Ensure org admin dashboards are organization-wide.
- [ ] Ensure super admin dashboards are cross-tenant.

## Phase 8: Command Endpoints and Operational Flows

- [ ] Implement:
  - [ ] `POST /contacts`
  - [ ] `PATCH /contacts/:contactId`
  - [ ] `POST /conversations/:conversationId/assign`
  - [ ] `POST /messages/send`
  - [ ] `POST /whatsapp/accounts`
  - [ ] `POST /whatsapp/accounts/:id/reconnect`
  - [ ] `POST /organizations`
  - [ ] `POST /organizations/:id/users`
- [ ] Add outbox/dispatch flow for outgoing messages.
- [ ] Update ack statuses and `message_status_events`.
- [ ] Add admin UI for organization/user/account management.

## Phase 9: Frontend Product Surfaces

- [ ] Move frontend into `apps/frontend`.
- [ ] Replace starter dashboard data flow with role-scoped query endpoints.
- [ ] Build:
  - [ ] agent dashboard
  - [ ] org admin dashboard
  - [ ] super admin dashboard
- [ ] Build inbox from projection endpoints.
- [ ] Build contact detail and ownership UI.
- [ ] Build WhatsApp account health and reconnect UI.
- [ ] Build platform organizations/usage UI for super admin.

## Phase 10: Ops, Deployment, and Hardening

- [ ] Prepare env contracts for:
  - [ ] Vercel frontend
  - [ ] Railway API
  - [ ] Railway connector
  - [ ] Supabase
- [ ] Add usage aggregation jobs.
- [ ] Add audit logging strategy.
- [ ] Add health monitoring and connector diagnostics.
- [ ] Add README deployment guidance for multi-service rollout.
- [ ] Add smoke tests for auth, role scope, inbox query flow, and ingestion idempotency.

## Recommended Immediate Execution Order

1. Foundation and migration safety
2. Database migrations + role seeds
3. Supabase Auth + org user resolution
4. API modularization
5. Raw event ingestion and workers
6. Projection tables
7. Connector extraction
8. Dashboard and admin surfaces
