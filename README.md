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

## Infra SQL

- Versioned SaaS migrations live in [infra/sql/migrations](./infra/sql/migrations)
- Default role permission seeds live in [infra/sql/seeds](./infra/sql/seeds)

## Run

1. Install dependencies: `npm install`
2. Copy env files from the examples in `backend/.env.example` and `frontend/.env.example`
3. Apply `database/schema.sql` to PostgreSQL or Supabase SQL editor
4. Create an initial user:

```bash
npm run create:user --workspace backend -- --email admin@example.com --password StrongPass123 --role admin --organizationId <organization-uuid> --fullName "Org Admin"
```

5. Start backend: `npm run dev:backend`
6. Start frontend: `npm run dev:frontend`

Deployment notes are in [docs/architecture.md](./docs/architecture.md).
