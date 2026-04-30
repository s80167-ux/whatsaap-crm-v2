# WhatsApp CRM v2 Architecture

## Goals

- One canonical contact per real person inside an organization
- Multiple WhatsApp identities can resolve to the same canonical contact
- Stable conversation ordering based on persisted last message metadata
- Idempotent ingestion to survive reconnects and event replays
- Strong tenant isolation through `organization_id` scoping

## Event Ingestion Flow

```text
Baileys Event
  -> apps/whatsapp-connector receives message.upsert
  -> apps/whatsapp-connector receives messages.update for outbound ack progression
  -> connector writes raw_channel_events
  -> backend raw event worker claims pending events
  -> ContactService anchors canonical contacts + identities
  -> ConversationService resolves one thread per contact/account
  -> MessageRepository.insertIfAbsent() stores the message idempotently
  -> MessageStatusSyncService applies ack/status updates idempotently
  -> ProjectionService refreshes inbox/contact/dashboard summaries
  -> API clients receive database changes via Supabase Realtime
```

## Connector Ownership

- `apps/whatsapp-connector` uses a lease on `whatsapp_accounts` to ensure one logical connector instance owns a WhatsApp account at a time.
- Lease ownership is tracked via:
  - `connector_owner_id`
  - `connector_claimed_at`
  - `connector_heartbeat_at`
- Active lifecycle state is persisted through:
  - `whatsapp_account_sessions`
  - `whatsapp_connection_events`
- If a connector stops heartbeating and the lease becomes stale, another connector instance can safely acquire ownership.

## Deduplication Rules

- Canonical dedup key: `organization_id + normalized_phone`
- If two inbound identities share the same normalized phone, they resolve to the same contact
- `contact_identities` can store multiple rows for the same person across different WhatsApp accounts
- Contact anchoring rule: a non-empty existing contact name must not be replaced by a blank incoming value
- Conversation uniqueness: one conversation per `organization_id + whatsapp_account_id + contact_id`

## Backend Modules

- `repositories/`: SQL access only
- `services/`: domain logic, transactions, normalization, deduplication
- `controllers/`: HTTP request orchestration
- `routes/`: API declarations
- `apps/whatsapp-connector`: Baileys session lifecycle and event bridging over internal HTTP commands

## Realtime Strategy

- Subscribe to `public.conversations` filtered by organization
- Subscribe to `public.messages` filtered by conversation ids currently in view
- New message insert:
  - conversation list updates from `conversations`
  - open chat panel appends from `messages`
- Backend remains the source of truth; realtime only reflects committed database writes

## Local Run

### Backend env

See [backend/.env.example](../backend/.env.example).

Important:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are required for auth + admin operations
- The backend accepts legacy env aliases `VITE_SUPABASE_URL` and `VITE_SUPABASE_SERVICE_ROLE_KEY` so existing local setups do not break immediately
- For a clean production setup, prefer the canonical names `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `BAILEYS_AUTH_DIR` should point at persistent storage in any non-ephemeral environment

### Frontend env

See [frontend/.env.example](../frontend/.env.example).

## Auth and Roles

- Login endpoint: `POST /api/auth/login`
- Profile endpoint: `GET /api/auth/me`
- Protected API routes require a Supabase access token as Bearer auth
- Organization-scoped routes derive tenant context from the authenticated user, not from a mutable client header
- Suggested permissions:
  - `super_admin`: cross-tenant oversight and provisioning
  - `org_admin`: organization management and account configuration
  - `manager`: team-wide operational visibility inside the organization
  - `agent`: inbox and outbound messaging
  - `user`: basic CRM access

## Deployment Notes

### Vercel

- Deploy `frontend` as the Vite app
- Set `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Railway

- Deploy `backend`
- Deploy `apps/whatsapp-connector`
- Mount a persistent volume to `/data`
- Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on the backend
- Set `DATABASE_URL`, `BAILEYS_AUTH_DIR`, and `CONNECTOR_INTERNAL_SECRET` on the connector
- Set `CONNECTOR_INSTANCE_ID` uniquely per connector service or replica group
- Point `CONNECTOR_BASE_URL` on the backend at the connector's private Railway URL

Recommended connector values:

```env
BAILEYS_AUTH_DIR=/data/baileys_auth
CONNECTOR_INSTANCE_ID=connector-railway-1
```

Do not use a relative `BAILEYS_AUTH_DIR` such as `./data/baileys_auth` on Railway, because container restarts can force WhatsApp re-registration and QR rescans if auth files are not stored on the mounted volume.

### Supabase

- Apply the versioned SQL files in `infra/sql/migrations` in order
- Treat `database/schema.sql` as a legacy starter schema, not the source of truth for migrated environments
- Enable Realtime on `conversations` and `messages`
- Use a service role key on the backend only

## Scaling Notes

- Run multiple backend instances behind a queue or sticky session strategy for WhatsApp workers if needed
- Keep a single logical owner per WhatsApp session to avoid double-consuming events
- Add `pg_notify` or a jobs table later for outbound retries if delivery guarantees need to increase

## Smoke Test Checklist

1. Create `super_admin`, then log in successfully through the frontend.
2. Create an organization and an `org_admin`.
3. Create a WhatsApp account and confirm the account card appears in Setup.
4. Trigger `Reconnect account` and confirm status/timestamps refresh.
5. Open Inbox, assign a contact to yourself, then assign a conversation to yourself.
6. Send an outbound message and confirm:
   - a new outbound bubble appears
   - the outbox row reaches `dispatched`
   - `messages.ack_status` reaches at least `server_ack`
   - conversation ordering stays stable
7. Send an inbound WhatsApp message from a real device and confirm:
   - the `raw_channel_events` row is created and processed
   - the contact, conversation, message, and projection rows refresh correctly
8. Open the recipient chat on a real device and confirm whether WhatsApp emits later delivery/read receipts:
   - `message_status_events` appends any receipt events that arrive
   - `messages.ack_status` advances beyond `server_ack` when WhatsApp sends them
   - `read_at` populates once the message is actually read
9. Log in as an assigned-scope user and confirm only owned/assigned records are visible.

## Deferred Next Phase

- Media support is intentionally deferred to the next phase.
- Current state:
  - inbound media types are classified, stored as message metadata, and rendered as media-aware inbox bubbles
  - outbound media send supports one attachment per message through the queue and connector flow
  - current transport uses JSON/base64 with a practical 4 MB attachment limit
  - file preview and download are not yet available because storage-backed media persistence is still pending
- Planned next-phase work:
  - persist media assets to storage
  - link `media_assets` to `messages`
  - add actual preview and download support for stored media
