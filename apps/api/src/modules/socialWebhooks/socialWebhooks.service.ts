import crypto from "node:crypto";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../lib/errors.js";

type SocialSource = "facebook" | "instagram";

type MatchedSocialAccount = {
  id: string;
  organization_id: string;
  platform: SocialSource;
};

type ExtractedSocialEvent = {
  source: SocialSource;
  accountExternalId: string;
  eventType: string;
  externalEventId: string | null;
  eventTimestamp: string | null;
  payload: unknown;
};

export class SocialWebhooksService {
  verifyMetaChallenge(input: { mode?: unknown; verifyToken?: unknown; challenge?: unknown }) {
    if (!env.META_WEBHOOK_VERIFY_TOKEN) {
      throw new AppError("Meta webhook verify token is not configured", 503, "meta_verify_token_not_configured");
    }

    if (input.mode !== "subscribe" || input.verifyToken !== env.META_WEBHOOK_VERIFY_TOKEN || typeof input.challenge !== "string") {
      throw new AppError("Meta webhook verification failed", 403, "meta_webhook_verification_failed");
    }

    return input.challenge;
  }

  verifySignature(request: Request) {
    if (!env.META_APP_SECRET) {
      logger.warn("META_APP_SECRET is not configured; skipping Meta webhook signature verification");
      return;
    }

    const signatureHeader = request.header("x-hub-signature-256");

    if (!signatureHeader?.startsWith("sha256=") || !request.rawBody) {
      throw new AppError("Meta webhook signature is required", 403, "meta_signature_required");
    }

    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", env.META_APP_SECRET)
      .update(request.rawBody)
      .digest("hex")}`;

    const actual = Buffer.from(signatureHeader, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");

    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      throw new AppError("Meta webhook signature is invalid", 403, "meta_signature_invalid");
    }
  }

  async storeMetaPayload(payload: unknown) {
    const events = this.extractEvents(payload);
    let storedCount = 0;
    let ignoredCount = 0;

    for (const event of events) {
      const account = await this.findAccount(event.source, event.accountExternalId);

      if (!account) {
        ignoredCount += 1;
        logger.warn(
          {
            source: event.source,
            accountExternalId: event.accountExternalId,
            eventType: event.eventType
          },
          "Social webhook event ignored because no matching social channel account exists"
        );
        continue;
      }

      await withTransaction(async (client) => {
        await client.query(
          `
            insert into social_raw_events (
              organization_id,
              social_channel_account_id,
              source,
              event_type,
              external_event_id,
              event_timestamp,
              payload,
              processing_status
            )
            values ($1, $2, $3, $4, $5, $6, $7::jsonb, 'pending')
          `,
          [
            account.organization_id,
            account.id,
            event.source,
            event.eventType,
            event.externalEventId,
            event.eventTimestamp,
            JSON.stringify(event.payload)
          ]
        );
      });

      storedCount += 1;
    }

    return {
      receivedCount: events.length,
      storedCount,
      ignoredCount
    };
  }

  private extractEvents(payload: unknown): ExtractedSocialEvent[] {
    if (!this.isRecord(payload)) {
      throw new AppError("Invalid Meta webhook payload", 400, "invalid_meta_webhook_payload");
    }

    const source = this.getSource(payload.object);
    const entries = Array.isArray(payload.entry) ? payload.entry : [];

    if (!source || entries.length === 0) {
      throw new AppError("Unsupported Meta webhook payload", 400, "unsupported_meta_webhook_payload");
    }

    return entries.flatMap((entry) => this.extractEntryEvents(source, entry));
  }

  private extractEntryEvents(source: SocialSource, entry: unknown): ExtractedSocialEvent[] {
    if (!this.isRecord(entry)) {
      return [];
    }

    const accountExternalId = typeof entry.id === "string" ? entry.id : null;

    if (!accountExternalId) {
      return [];
    }

    const events: ExtractedSocialEvent[] = [];

    for (const item of this.asArray(entry.messaging)) {
      events.push(this.buildEvent(source, accountExternalId, "messaging", item));
    }

    for (const change of this.asArray(entry.changes)) {
      const changeRecord = this.isRecord(change) ? change : {};
      const field = typeof changeRecord.field === "string" ? changeRecord.field : "change";
      events.push(this.buildEvent(source, accountExternalId, field, change));
    }

    if (events.length === 0) {
      events.push(this.buildEvent(source, accountExternalId, "entry", entry));
    }

    return events;
  }

  private buildEvent(source: SocialSource, accountExternalId: string, eventType: string, payload: unknown): ExtractedSocialEvent {
    const record = this.isRecord(payload) ? payload : {};
    const message = this.isRecord(record.message) ? record.message : null;
    const delivery = this.isRecord(record.delivery) ? record.delivery : null;
    const read = this.isRecord(record.read) ? record.read : null;

    return {
      source,
      accountExternalId,
      eventType,
      externalEventId: this.getString(message?.mid) ?? this.getString(delivery?.mids?.[0]) ?? this.getString(read?.mid),
      eventTimestamp: this.getTimestamp(record.timestamp),
      payload
    };
  }

  private async findAccount(source: SocialSource, externalAccountId: string) {
    const result = await query<MatchedSocialAccount>(
      `
        select id, organization_id, platform
        from social_channel_accounts
        where platform = $1
          and external_account_id = $2
        order by created_at desc
        limit 1
      `,
      [source, externalAccountId]
    );

    return result.rows[0] ?? null;
  }

  private getSource(objectValue: unknown): SocialSource | null {
    if (objectValue === "page") {
      return "facebook";
    }

    if (objectValue === "instagram") {
      return "instagram";
    }

    return null;
  }

  private asArray(value: unknown) {
    return Array.isArray(value) ? value : [];
  }

  private getString(value: unknown) {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private getTimestamp(value: unknown) {
    if (typeof value !== "number" && typeof value !== "string") {
      return null;
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return new Date(numericValue).toISOString();
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
