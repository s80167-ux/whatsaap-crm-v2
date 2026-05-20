import type { PoolClient } from "pg";
import { getWhatsAppJidType } from "../utils/phone.js";
import { calculateContactQualityScore, normalizeWhatsAppIdentity, pickBestRecoveryName } from "../utils/whatsappIdentity.js";
import { ContactEnrichmentCacheService } from "./contactEnrichmentCacheService.js";
import { ContactRecoveryAuditService } from "./contactRecoveryAuditService.js";

type SnapshotCandidate = {
  organizationId: string;
  whatsappAccountId: string;
  rawJid: string;
  pushName?: string | null;
  verifiedName?: string | null;
  notifyName?: string | null;
  profilePicUrl?: string | null;
  source?: string | null;
  syncType?: string | null;
  rawPayload?: unknown;
};

type HistorySyncPayload = {
  organizationId: string;
  whatsappAccountId: string;
  chats?: unknown[];
  contacts?: unknown[];
  messages?: unknown[];
  syncType?: string | null;
};

function recordValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function messageSenderJid(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as Record<string, unknown>;
  const key = message.key && typeof message.key === "object" ? (message.key as Record<string, unknown>) : {};
  const remoteJid = recordValue(key, "remoteJid");
  const participant = recordValue(key, "participant", "participantPn", "senderPn", "participantAlt");

  if (remoteJid && getWhatsAppJidType(remoteJid) === "group") {
    return participant;
  }

  return participant ?? remoteJid;
}

export class WhatsAppContactSnapshotService {
  constructor(
    private readonly cacheService = new ContactEnrichmentCacheService(),
    private readonly auditService = new ContactRecoveryAuditService()
  ) {}

  async saveContactSnapshot(client: PoolClient, candidate: SnapshotCandidate) {
    const identity = normalizeWhatsAppIdentity(candidate.rawJid);

    if (!identity.isValidCustomerIdentity) {
      return { saved: false, cacheUpdated: false, score: 0 };
    }

    const score = calculateContactQualityScore({
      rawJid: candidate.rawJid,
      normalizedJid: identity.normalizedJid,
      lid: identity.lid,
      phoneNumber: identity.phoneNumber,
      pushName: candidate.pushName,
      verifiedName: candidate.verifiedName,
      notifyName: candidate.notifyName,
      profilePicUrl: candidate.profilePicUrl,
      source: candidate.source ?? "baileys_snapshot"
    });

    const snapshot = await client.query(
      `
        insert into wa_contact_snapshots (
          organization_id,
          whatsapp_account_id,
          raw_jid,
          normalized_jid,
          lid,
          phone_number,
          push_name,
          verified_name,
          notify_name,
          profile_pic_url,
          source,
          sync_type,
          raw_payload
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        returning *
      `,
      [
        candidate.organizationId,
        candidate.whatsappAccountId,
        candidate.rawJid,
        identity.normalizedJid,
        identity.lid,
        identity.phoneNumber,
        pickBestRecoveryName(candidate.pushName),
        pickBestRecoveryName(candidate.verifiedName),
        pickBestRecoveryName(candidate.notifyName),
        candidate.profilePicUrl ?? null,
        candidate.source ?? "baileys_snapshot",
        candidate.syncType ?? null,
        JSON.stringify(candidate.rawPayload ?? null)
      ]
    );

    await this.auditService.record(client, {
      organizationId: candidate.organizationId,
      whatsappAccountId: candidate.whatsappAccountId,
      action: "snapshot_saved",
      source: candidate.source ?? "baileys_snapshot",
      confidenceScore: score,
      afterData: snapshot.rows[0] ?? null,
      rawPayload: candidate.rawPayload
    });

    const cacheResult = await this.cacheService.updateLastKnownGood(client, {
      organizationId: candidate.organizationId,
      whatsappAccountId: candidate.whatsappAccountId,
      rawJid: candidate.rawJid,
      normalizedJid: identity.normalizedJid,
      lid: identity.lid,
      phoneNumber: identity.phoneNumber,
      displayName: candidate.verifiedName ?? candidate.pushName ?? candidate.notifyName ?? null,
      pushName: candidate.pushName ?? null,
      verifiedName: candidate.verifiedName ?? null,
      notifyName: candidate.notifyName ?? null,
      profilePicUrl: candidate.profilePicUrl ?? null,
      source: candidate.source ?? "baileys_snapshot",
      rawPayload: candidate.rawPayload
    });

    return { saved: true, cacheUpdated: cacheResult.updated, score };
  }

  async saveSnapshotsFromHistorySync(client: PoolClient, payload: HistorySyncPayload) {
    const candidates = new Map<string, SnapshotCandidate>();
    const addCandidate = (candidate: SnapshotCandidate) => {
      const identity = normalizeWhatsAppIdentity(candidate.rawJid);
      if (!identity.isValidCustomerIdentity || !identity.normalizedJid) return;
      const existing = candidates.get(identity.normalizedJid);
      const score = calculateContactQualityScore({
        rawJid: candidate.rawJid,
        normalizedJid: identity.normalizedJid,
        phoneNumber: identity.phoneNumber,
        lid: identity.lid,
        pushName: candidate.pushName,
        verifiedName: candidate.verifiedName,
        notifyName: candidate.notifyName,
        profilePicUrl: candidate.profilePicUrl,
        source: candidate.source ?? "history_sync"
      });
      const existingScore = existing
        ? calculateContactQualityScore({ rawJid: existing.rawJid, pushName: existing.pushName, verifiedName: existing.verifiedName, notifyName: existing.notifyName, profilePicUrl: existing.profilePicUrl, source: existing.source })
        : -1;
      if (!existing || score > existingScore) {
        candidates.set(identity.normalizedJid, candidate);
      }
    };

    for (const contact of payload.contacts ?? []) {
      if (!contact || typeof contact !== "object") continue;
      const record = contact as Record<string, unknown>;
      const rawJid = recordValue(record, "jid", "id", "lid");
      if (!rawJid) continue;
      addCandidate({
        organizationId: payload.organizationId,
        whatsappAccountId: payload.whatsappAccountId,
        rawJid,
        pushName: recordValue(record, "name"),
        verifiedName: recordValue(record, "verifiedName"),
        notifyName: recordValue(record, "notify"),
        profilePicUrl: recordValue(record, "imgUrl"),
        source: "history_sync",
        syncType: payload.syncType ?? "messaging-history.set",
        rawPayload: contact
      });
    }

    for (const chat of payload.chats ?? []) {
      if (!chat || typeof chat !== "object") continue;
      const record = chat as Record<string, unknown>;
      const rawJid = recordValue(record, "id", "jid");
      if (!rawJid) continue;
      addCandidate({
        organizationId: payload.organizationId,
        whatsappAccountId: payload.whatsappAccountId,
        rawJid,
        pushName: recordValue(record, "name"),
        source: "history_sync",
        syncType: payload.syncType ?? "messaging-history.set",
        rawPayload: chat
      });
    }

    for (const message of payload.messages ?? []) {
      const rawJid = messageSenderJid(message);
      if (!rawJid) continue;
      addCandidate({
        organizationId: payload.organizationId,
        whatsappAccountId: payload.whatsappAccountId,
        rawJid,
        pushName: message && typeof message === "object" ? recordValue(message as Record<string, unknown>, "pushName") : null,
        verifiedName: message && typeof message === "object" ? recordValue(message as Record<string, unknown>, "verifiedBizName") : null,
        source: "history_sync",
        syncType: payload.syncType ?? "messaging-history.set",
        rawPayload: message
      });
    }

    let snapshotsSaved = 0;
    let cacheRecordsUpdated = 0;

    for (const candidate of candidates.values()) {
      const result = await this.saveContactSnapshot(client, candidate);
      if (result.saved) snapshotsSaved += 1;
      if (result.cacheUpdated) cacheRecordsUpdated += 1;
    }

    await this.auditService.record(client, {
      organizationId: payload.organizationId,
      whatsappAccountId: payload.whatsappAccountId,
      action: "history_sync_processed",
      source: "history_sync",
      afterData: {
        contactsReceived: payload.contacts?.length ?? 0,
        chatsReceived: payload.chats?.length ?? 0,
        messagesReceived: payload.messages?.length ?? 0,
        snapshotsSaved,
        cacheRecordsUpdated
      }
    });

    return { snapshotsSaved, cacheRecordsUpdated };
  }

  async findBestSnapshotMatch(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      normalizedJid?: string | null;
      phoneNumber?: string | null;
      lid?: string | null;
    }
  ) {
    const result = await client.query(
      `
        select *,
          case
            when $3::text is not null and normalized_jid = $3 then 400
            when $4::text is not null and phone_number = $4 then 300
            when $5::text is not null and lid = $5 then 200
            else 0
          end + 0 as match_score
        from wa_contact_snapshots
        where organization_id = $1
          and whatsapp_account_id = $2
          and (
            ($3::text is not null and normalized_jid = $3)
            or ($4::text is not null and phone_number = $4)
            or ($5::text is not null and lid = $5)
          )
        order by match_score desc, captured_at desc
        limit 1
      `,
      [input.organizationId, input.whatsappAccountId, input.normalizedJid ?? null, input.phoneNumber ?? null, input.lid ?? null]
    );

    return result.rows[0] ?? null;
  }
}
