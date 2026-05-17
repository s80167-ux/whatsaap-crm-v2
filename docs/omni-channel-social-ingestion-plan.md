# Omni-Channel Social Ingestion Plan

## Scope

This document describes the future Facebook Messenger and Instagram DM ingestion path after the Phase 2 webhook foundation. Phase 2 stores raw social webhook events only. It does not insert social events into WhatsApp raw event tables, WhatsApp ingestion services, or the live inbox.

## Payload To CRM Contact Mapping

Facebook and Instagram webhook payloads should map external sender profiles into channel-aware CRM identities:

- `channel_type`: `facebook` or `instagram`
- `external_profile_id`: Meta sender or Instagram scoped user ID
- `display_name`: profile name resolved from Graph API when permissions allow it
- `profile_picture_url`: profile picture resolved from Graph API when permissions allow it
- `contact_id`: CRM contact selected by an identity resolver, not by direct WhatsApp identity reuse

The raw webhook payload should first land in `social_raw_events`. A later processor can normalize the event into a social message envelope, resolve the external profile, then attach or create a CRM contact identity.

## Why Not Reuse WhatsApp MessageIngestionService Directly

The existing WhatsApp ingestion path is built around WhatsApp-specific identifiers, event shapes, delivery semantics, and connector assumptions. Facebook Messenger and Instagram DM have different account identifiers, sender identifiers, webhook entry formats, permissions, and reply APIs.

Reusing the WhatsApp ingestion service directly would risk mixing social events into WhatsApp raw event processing, contact identity rules, and inbox projection behavior. Social ingestion should share common lower-level repositories only after the social event has been normalized into a channel-neutral internal model.

## Proposed SocialMessageIngestionService

Add a dedicated `SocialMessageIngestionService` in a later phase:

1. Load pending rows from `social_raw_events`.
2. Deduplicate using `social_processed_event_keys`.
3. Normalize Meta payload entries into internal social message records.
4. Resolve `social_channel_accounts` by `external_account_id`.
5. Resolve or create channel-aware contact identities.
6. Create or update conversation projections for a unified inbox model.
7. Mark raw events as `processed`, `ignored`, or `failed`.

This service should be worker-friendly and should not run inside the webhook request path.

## Proposed Contact Identity Mapping

Future schema should support channel-aware identities similar to:

- `contact_id uuid not null`
- `channel_type text not null check (channel_type in ('whatsapp', 'facebook', 'instagram'))`
- `external_profile_id text not null`
- `display_name text`
- `profile_picture_url text`
- `organization_id uuid not null`
- `social_channel_account_id uuid`

A unique key should prevent duplicate identities for the same organization, channel type, and external profile ID. Cross-channel merge should be a separate reviewed design because matching a WhatsApp phone number to a Facebook or Instagram profile can be ambiguous.

## Proposed Conversation Model Changes

The unified inbox will likely need a channel-neutral conversation key:

- `channel_type`
- `channel_account_id`
- `external_thread_id`
- `external_profile_id`
- `last_message_at`
- `assigned_user_id`
- `status`

If the current conversation model remains WhatsApp-specific in any required fields, add a social conversation table or a generalized conversation source table instead of overloading WhatsApp account columns.

## Phase 3 Recommendation

Phase 3 should introduce social ingestion behind a feature flag or clearly isolated worker. The first unified inbox release should render social threads read-only or in a narrow test scope before enabling replies through Facebook or Instagram APIs.

Recommended Phase 3 order:

1. Implement `SocialMessageIngestionService`.
2. Add channel-aware contact identity storage.
3. Add social conversation projection tables or generalize conversation source fields.
4. Render social threads in a unified inbox tab without reply sending.
5. Add Meta reply sending only after account tokens, permissions, and delivery status handling are reviewed.
