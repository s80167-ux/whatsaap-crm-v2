# Rezeki CRM v2 Migration Map

This document maps the current working scaffold into the target architecture from the SaaS blueprint.

## Current State

- `apps/frontend/`: active Vite React app with login, dashboard shell, setup page, inbox, contacts, platform diagnostics, and role-scoped dashboards
- `apps/api/`: active Express API with Supabase Auth, SaaS schema integration, projection-backed queries, workers, outbox dispatch, and ack/status ingestion
- `apps/whatsapp-connector/`: active Baileys connector service with runtime persistence, lease ownership, outbound dispatch, and outbound status event capture
- `frontend/`: legacy compatibility copy of the old frontend root
- `backend/`: legacy compatibility copy of the old backend root
- `database/schema.sql`: starter schema for current app model

## Target State

- `apps/frontend`: production UI
- `apps/api`: API server
- `apps/whatsapp-connector`: dedicated connector service
- `packages/shared`: shared types/contracts/utils
- `infra/sql`: versioned SQL migrations and seed files

## Current to Target Mapping

### Frontend

- `frontend/src/api/*` -> `apps/frontend/src/api/*`
- `frontend/src/components/*` -> `apps/frontend/src/components/*`
- `frontend/src/hooks/*` -> `apps/frontend/src/hooks/*`
- `frontend/src/layouts/*` -> `apps/frontend/src/layouts/*`
- `frontend/src/pages/*` -> `apps/frontend/src/pages/*`
- `frontend/src/types/*` -> `apps/frontend/src/types/*`

### Backend API

- `backend/src/config/*` -> `apps/api/src/config/*`
- `backend/src/middleware/*` -> `apps/api/src/middleware/*`
- `backend/src/controllers/*` -> split into module-local controllers under `apps/api/src/modules/*`
- `backend/src/repositories/*` -> module-local repositories under `apps/api/src/modules/*`
- `backend/src/services/*` -> module-local services under `apps/api/src/modules/*`
- `backend/src/routes/*` -> module-local routes under `apps/api/src/modules/*`
- `backend/src/scripts/*` -> `apps/api/src/scripts/*`

### WhatsApp Connector

- `backend/src/whatsapp/sessionManager.ts` -> `apps/whatsapp-connector/src/sessionManager.ts`
- message ingestion handoff logic -> internal connector event publisher / API internal endpoint

### Shared

- `backend/src/types/*` + `frontend/src/types/*` -> selected contracts move into `packages/shared/src/*`
- common validation enums and role/permission constants -> `packages/shared/src/auth/*`
- shared API DTOs -> `packages/shared/src/contracts/*`

### SQL

- `database/schema.sql` -> split into ordered migration files under `infra/sql/migrations`
- permission seeds and default data -> `infra/sql/seeds`

## Migration Rule

The repository now runs from `apps/*`. The existing `frontend/` and `backend/` folders are retained as non-workspace legacy copies until cleanup is explicitly approved. During this phase, no destructive moves are performed.

## Known Deferred Work

- Storage-backed media preview and download still need a dedicated persistence pass on top of the new outbound/inbound media flow.
- Sales has now moved beyond placeholder state, but deeper workflows remain deferred:
  - sales order detail and item lines
  - lead-to-order conversion
  - dashboard-level pipeline and revenue widgets
