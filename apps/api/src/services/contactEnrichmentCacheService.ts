import type { PoolClient } from "pg";
import { calculateContactQualityScore, isUnknownOrEmptyName, normalizeWhatsAppIdentity, pickBestRecoveryName } from "../utils/whatsappIdentity.js";
import { ContactRecoveryAuditService } from "./contactRecoveryAuditService.js";

export type ContactEnrichmentCandidate = {
  organizationId: string;
  whatsappAccountId: string;
  contactId?: string | null;
  rawJid?: string | null;
  normalizedJid?: string | null;
  lid?: string | null;
  phoneNumber?: string | null;
  displayName?: string | null;
  pushName?: string | null;
  verifiedName?: string | null;
  notifyName?: string | null;
  profilePicUrl?: string | null;
  source: string;
  rawPayload?: unknown;
};

export class ContactEnrichmentCacheService {
  constructor(private readonly auditService = new ContactRecoveryAuditService()) {}

  async updateLastKnownGood(client: PoolClient, candidate: ContactEnrichmentCandidate) {
    const identity = normalizeWhatsAppIdentity(candidate.normalizedJid ?? candidate.rawJid ?? null);
    const normalizedJid = candidate.normalizedJid ?? identity.normalizedJid;
    const lid = candidate.lid ?? identity.lid;
    const phoneNumber = candidate.phoneNumber ?? identity.phoneNumber;
    const bestDisplayName = pickBestRecoveryName(candidate.displayName, candidate.verifiedName, candidate.pushName, candidate.notifyName);
    const score = calculateContactQualityScore({
      ...candidate,
      normalizedJid,
      lid,
      phoneNumber,
      displayName: bestDisplayName
    });

    if (!normalizedJid && !phoneNumber && !lid && !candidate.contactId) {
      return { updated: false, score, record: null };
    }

    if (score <= 0 && !bestDisplayName && !candidate.profilePicUrl) {
      return { updated: false, score, record: null };
    }

    const existing = await this.findBestCacheMatch(client, {
      organizationId: candidate.organizationId,
      whatsappAccountId: candidate.whatsappAccountId,
      contactId: candidate.contactId ?? null,
      normalizedJid,
      phoneNumber,
      lid
    });

    if (!existing) {
      const result = await client.query(
        `
          insert into contact_enrichment_cache (
            organization_id,
            whatsapp_account_id,
            contact_id,
            raw_jid,
            normalized_jid,
            lid,
            phone_number,
            best_display_name,
            best_push_name,
            best_verified_name,
            best_notify_name,
            best_profile_pic_url,
            confidence_score,
            source,
            raw_payload
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          returning *
        `,
        [
          candidate.organizationId,
          candidate.whatsappAccountId,
          candidate.contactId ?? null,
          candidate.rawJid ?? identity.rawJid,
          normalizedJid,
          lid,
          phoneNumber,
          bestDisplayName,
          pickBestRecoveryName(candidate.pushName),
          pickBestRecoveryName(candidate.verifiedName),
          pickBestRecoveryName(candidate.notifyName),
          candidate.profilePicUrl ?? null,
          score,
          candidate.source,
          JSON.stringify(candidate.rawPayload ?? null)
        ]
      );

      const record = result.rows[0] ?? null;
      await this.auditService.record(client, {
        organizationId: candidate.organizationId,
        whatsappAccountId: candidate.whatsappAccountId,
        contactId: candidate.contactId ?? null,
        action: "cache_updated",
        source: candidate.source,
        confidenceScore: score,
        afterData: record,
        rawPayload: candidate.rawPayload
      });
      return { updated: true, score, record };
    }

    if (!existing) {
      return { updated: false, score, record: null };
    }

    const fillsMissing =
      (!existing.best_display_name && bestDisplayName) ||
      (!existing.best_push_name && !isUnknownOrEmptyName(candidate.pushName)) ||
      (!existing.best_verified_name && !isUnknownOrEmptyName(candidate.verifiedName)) ||
      (!existing.best_notify_name && !isUnknownOrEmptyName(candidate.notifyName)) ||
      (!existing.best_profile_pic_url && candidate.profilePicUrl) ||
      (!existing.phone_number && phoneNumber) ||
      (!existing.lid && lid) ||
      (!existing.contact_id && candidate.contactId);

    if (score < Number(existing.confidence_score ?? 0) && !fillsMissing) {
      return { updated: false, score, record: existing };
    }

    const result = await client.query(
      `
        update contact_enrichment_cache
        set contact_id = coalesce(contact_id, $2),
            raw_jid = coalesce(nullif(trim($3), ''), raw_jid),
            normalized_jid = coalesce(normalized_jid, $4),
            lid = coalesce(lid, $5),
            phone_number = coalesce(phone_number, $6),
            best_display_name = case
              when nullif(trim($7), '') is null then best_display_name
              when best_display_name is null or lower(trim(best_display_name)) in ('unknown', 'unknown contact', 'undefined', 'null') then $7
              else best_display_name
            end,
            best_push_name = coalesce(nullif(trim($8), ''), best_push_name),
            best_verified_name = coalesce(nullif(trim($9), ''), best_verified_name),
            best_notify_name = coalesce(nullif(trim($10), ''), best_notify_name),
            best_profile_pic_url = coalesce(nullif(trim($11), ''), best_profile_pic_url),
            confidence_score = greatest(confidence_score, $12),
            source = case when $12 >= confidence_score then $13 else source end,
            raw_payload = coalesce($14::jsonb, raw_payload),
            last_good_at = timezone('utc', now())
        where id = $1
        returning *
      `,
      [
        existing.id,
        candidate.contactId ?? null,
        candidate.rawJid ?? identity.rawJid,
        normalizedJid,
        lid,
        phoneNumber,
        bestDisplayName,
        pickBestRecoveryName(candidate.pushName),
        pickBestRecoveryName(candidate.verifiedName),
        pickBestRecoveryName(candidate.notifyName),
        candidate.profilePicUrl ?? null,
        score,
        candidate.source,
        JSON.stringify(candidate.rawPayload ?? null)
      ]
    );

    const record = result.rows[0] ?? null;
    await this.auditService.record(client, {
      organizationId: candidate.organizationId,
      whatsappAccountId: candidate.whatsappAccountId,
      contactId: candidate.contactId ?? existing.contact_id ?? null,
      action: "cache_updated",
      source: candidate.source,
      confidenceScore: score,
      beforeData: existing,
      afterData: record,
      rawPayload: candidate.rawPayload
    });
    return { updated: true, score, record };
  }

  async restoreFromLastKnownGood(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      contactId?: string | null;
      normalizedJid?: string | null;
      phoneNumber?: string | null;
      lid?: string | null;
    }
  ) {
    return this.findBestCacheMatch(client, input);
  }

  async findBestCacheMatch(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      contactId?: string | null;
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
            when $6::uuid is not null and contact_id = $6 then 100
            else 0
          end + confidence_score as match_score
        from contact_enrichment_cache
        where organization_id = $1
          and whatsapp_account_id = $2
          and (
            ($3::text is not null and normalized_jid = $3)
            or ($4::text is not null and phone_number = $4)
            or ($5::text is not null and lid = $5)
            or ($6::uuid is not null and contact_id = $6)
          )
        order by match_score desc, last_good_at desc
        limit 1
      `,
      [
        input.organizationId,
        input.whatsappAccountId,
        input.normalizedJid ?? null,
        input.phoneNumber ?? null,
        input.lid ?? null,
        input.contactId ?? null
      ]
    );

    return result.rows[0] ?? null;
  }
}
