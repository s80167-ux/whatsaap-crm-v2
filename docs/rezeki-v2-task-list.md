# Rezeki CRM v2 Task List

This task list converts the SaaS blueprint into an implementation roadmap for the current repository. The goal is to migrate from the existing `frontend` + `backend` scaffold into a production-oriented multi-tenant monorepo without breaking the working login and dashboard bootstrap path.

## Phase 0: Foundation and Migration Safety

Status: completed

- [x] Create target monorepo structure:
  - `apps/frontend`
  - `apps/api`
  - `apps/whatsapp-connector`
  - `packages/shared`
  - `infra/sql`
- [x] Preserve current working apps while migration happens incrementally.
- [x] Add root workspace scripts aligned to the target app names.
- [ ] Add shared TypeScript base config and path conventions.
- [x] Add migration notes that map current files to target destinations.
- [x] Keep local run instructions valid throughout the migration.

## Phase 1: Database and Tenancy Model

Status: completed

- [x] Replace starter schema with SaaS schema in versioned SQL migrations.
- [x] Create migrations for:
  - [x] organizations
  - [x] organization_users
  - [x] platform_super_admins
  - [x] role_permissions
  - [x] organization_user_permissions
  - [x] subscriptions
  - [x] usage_daily
  - [x] whatsapp_accounts
  - [x] whatsapp_account_sessions
  - [x] whatsapp_connection_events
  - [x] raw_channel_events
  - [x] processed_event_keys
  - [x] contacts
  - [x] contact_identities
  - [x] contact_owners
  - [x] contact_merge_history
  - [x] merge_candidates
  - [x] conversations
  - [x] conversation_assignments
  - [x] media_assets
  - [x] messages
  - [x] message_status_events
  - [x] leads
  - [x] activities
  - [x] sales_orders
  - [x] sales_order_items
  - [x] inbox_thread_summary
  - [x] contact_summary
  - [x] dashboard_metrics_daily
- [x] Add indexes for all hot paths in the prompt.
- [x] Add seed script for default `role_permissions`.
- [x] Add starter RLS policies and helper functions.
- [x] Add legacy-compatibility migrations for CRM v1 tables that still coexist during rollout:
  - [x] WhatsApp accounts compatibility backfill (`006_whatsapp_accounts_legacy_compat.sql`)

## Phase 2: Authentication and Authorization

Status: completed

- [x] Replace custom JWT-first auth with Supabase Auth-backed identity resolution.
- [x] Build current-organization-user resolver middleware.
- [x] Add super admin bypass logic.
- [x] Add permission checker middleware.
- [x] Add role + permission enforcement for query endpoints.
- [x] Add role + permission enforcement for command endpoints.
- [x] Define dashboard visibility rules per role:
  - [x] super_admin
  - [x] org_admin
  - [x] manager
  - [x] agent
  - [x] user

## Phase 3: API Server Modularization

Status: completed

- [ ] Restructure API into modules:
  - [x] auth
  - [x] organizations
  - [x] users
  - [x] permissions
  - [x] contacts
  - [x] conversations
  - [x] messages
  - [x] activities
  - [x] leads
  - [x] sales
  - [x] whatsapp
  - [x] dashboard
  - [x] platform
- [x] Standardize repository/service/controller/route layering.
- [x] Add centralized error handling and structured logging conventions.
- [x] Add request validation via Zod in every module.
- [x] Add worker entrypoints under `apps/api/src/workers`.

## Phase 4: WhatsApp Connector Service

Status: completed

- [x] Extract Baileys session management into `apps/whatsapp-connector`.
- [x] Keep WhatsApp connection state isolated from API CRUD concerns.
- [x] Add session ownership / heartbeat strategy for one logical connector owner per account.
- [x] Persist connection events to `whatsapp_connection_events`.
- [x] Persist session lifecycle to `whatsapp_account_sessions`.
- [x] Expose controlled internal ingestion handoff into raw event storage.
- [x] Add reconnect and health-check commands.

## Phase 5: Raw Event Ingestion and Workers

Status: in progress

- [x] Write inbound events to `raw_channel_events` only.
- [x] Build deterministic `event_key` generation.
- [x] Add idempotent worker claim/process/retry loop.
- [x] Add `processed_event_keys` dedup checks.
- [x] Normalize JID and phone identities safely.
- [x] Upsert `contact_identities`.
- [x] Find or create canonical contacts using anchor-quality rules.
- [x] Find or create conversations using:
  - [x] organization
  - [x] channel
  - [x] whatsapp account
  - [x] external thread key
- [x] Insert messages idempotently.
- [x] Update conversation timestamps and unread counters.
- [x] Mark events as processed, failed, or ignored.
- [x] Add reconciliation and replay worker.

## Phase 6: Projection Tables and Query Models

Status: completed

- [x] Populate `inbox_thread_summary`.
- [x] Populate `contact_summary`.
- [x] Populate `dashboard_metrics_daily`.
- [x] Ensure frontend reads projection/query endpoints instead of raw tables.
- [x] Add dirty-thread projection refresh strategy after message ingestion.
- [x] Add repair/rebuild scripts for projections.

## Phase 7: Role-Based Dashboards

Status: in progress

- [ ] Implement:
  - [x] `GET /dashboard/agent`
  - [x] `GET /dashboard/admin`
  - [x] `GET /dashboard/super-admin`
- [ ] Implement:
  - [x] `GET /inbox/threads`
  - [x] `GET /inbox/threads/:conversationId/messages`
  - [x] `GET /contacts`
  - [x] `GET /contacts/:contactId`
  - [x] `GET /platform/organizations`
  - [x] `GET /platform/usage`
- [x] Ensure agent/user dashboards are assignment-scoped.
- [x] Ensure org admin dashboards are organization-wide.
- [x] Ensure super admin dashboards are cross-tenant.

## Phase 8: Command Endpoints and Operational Flows

Status: in progress

- [ ] Implement:
  - [x] `POST /contacts`
  - [x] `PATCH /contacts/:contactId`
  - [x] `POST /conversations/:conversationId/assign`
  - [x] `POST /messages/send`
  - [x] `POST /whatsapp/accounts`
  - [x] `POST /whatsapp/accounts/:id/reconnect`
  - [x] `POST /organizations`
  - [x] `POST /organizations/:id/users`
- [x] Add first-pass assignment actions for contacts and conversations in the active frontend surfaces.
- [x] Add outbox/dispatch flow for outgoing messages.
- [x] Update ack statuses and `message_status_events`.
- [x] Add admin UI for organization/user/account management.

## Phase 9: Frontend Product Surfaces

Status: in progress

- [x] Move frontend into `apps/frontend`.
- [x] Replace starter dashboard data flow with role-scoped query endpoints.
- [ ] Build:
  - [x] agent dashboard
  - [x] org admin dashboard
  - [x] super admin dashboard
- [x] Build inbox from projection endpoints.
- [x] Build contact detail and ownership UI.
- [x] Build WhatsApp account health and reconnect UI.
- [x] Build platform organizations/usage UI for super admin.

## Phase 10: Ops, Deployment, and Hardening

Status: in progress

- [ ] Prepare env contracts for:
  - [x] Vercel frontend
  - [x] Railway API
  - [x] Railway connector
  - [x] Supabase
- [x] Add usage aggregation jobs.
- [x] Add audit logging strategy.
- [x] Add health monitoring and connector diagnostics.
- [x] Add README deployment guidance for multi-service rollout.
- [x] Add smoke tests for auth, role scope, inbox query flow, and ingestion idempotency.
- [x] Verify local runtime stack with active processes:
  - [x] API healthy on `:4000`
  - [x] Connector healthy on `:4010`
  - [x] Raw event worker running
  - [x] Message outbox worker running
  - [x] Super-admin login verified against live Supabase Auth
  - [x] `GET /platform/organizations` verified against legacy-compatible organizations schema

## Current Execution Status

- Current phase: Phase 10, Ops, Deployment, and Hardening
- Current completed step: local runtime verification for API, connector, workers, auth, and platform organization queries
- Next highest-impact step: connect at least one live WhatsApp account and run an end-to-end inbound/outbound message verification through `raw_channel_events`, projections, and the outbox dispatcher

## Recommended Immediate Execution Order

1. Foundation and migration safety
2. Database migrations + role seeds
3. Supabase Auth + org user resolution
4. API modularization
5. Raw event ingestion and workers
6. Projection tables
7. Connector extraction
8. Dashboard and admin surfaces
