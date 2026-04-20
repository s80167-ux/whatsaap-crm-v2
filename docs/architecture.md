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
  -> WhatsAppSessionManager receives message.upsert
  -> MessageIngestionService parses sender/recipient and raw payload
  -> normalizePhone() derives a canonical phone string
  -> ContactService.findOrCreateContact() anchors the canonical contact
  -> ContactIdentityRepository.upsert() binds the WhatsApp JID/account to the contact
  -> ConversationService.findOrCreateConversation() resolves one thread per contact/account
  -> MessageRepository.insertIfAbsent() stores the message idempotently
  -> ConversationRepository.bumpLastMessage() updates last_message_at / last_message_id
  -> API clients receive database changes via Supabase Realtime
```

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
- `whatsapp/`: Baileys session lifecycle and event bridging

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

- `JWT_SECRET` is required for API auth
- The backend accepts legacy env aliases `VITE_SUPABASE_URL` and `VITE_SUPABASE_SERVICE_ROLE_KEY` so existing local setups do not break immediately
- For a clean production setup, prefer the canonical names `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### Frontend env

See [frontend/.env.example](../frontend/.env.example).

## Auth and Roles

- Login endpoint: `POST /api/auth/login`
- Profile endpoint: `GET /api/auth/me`
- Protected API routes require a Bearer token
- Organization-scoped routes derive tenant context from the authenticated user, not from a mutable client header
- Suggested permissions:
  - `super_admin`: cross-tenant oversight and provisioning
  - `admin`: organization management and account configuration
  - `agent`: inbox and outbound messaging
  - `user`: basic CRM access

## Deployment Notes

### Vercel

- Deploy `frontend` as the Vite app
- Set `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Railway

- Deploy `backend`
- Mount a persistent volume to `/data`
- Set `BAILEYS_AUTH_DIR=/data/baileys_auth`
- Set `DATABASE_URL` and WhatsApp-related env vars

### Supabase

- Run `database/schema.sql`
- Enable Realtime on `conversations` and `messages`
- Use a service role key on the backend only

## Scaling Notes

- Run multiple backend instances behind a queue or sticky session strategy for WhatsApp workers if needed
- Keep a single logical owner per WhatsApp session to avoid double-consuming events
- Add `pg_notify` or a jobs table later for outbound retries if delivery guarantees need to increase
