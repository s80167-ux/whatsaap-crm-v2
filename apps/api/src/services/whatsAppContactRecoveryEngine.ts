import type { PoolClient } from "pg";
import { logger } from "../config/logger.js";
import { withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { ContactIdentityRepository } from "../repositories/contactIdentityRepository.js";
import { WhatsAppAdminRepository } from "../repositories/whatsAppAdminRepository.js";
import type { AuthUser, UserRole } from "../types/auth.js";
import type { ContactRecord } from "../types/domain.js";
import { mergeContactWithoutDowngrade, hasRecoveryMergeChanges } from "../utils/contactRecoveryMerge.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import { calculateContactQualityScore, normalizeWhatsAppIdentity, pickBestRecoveryName } from "../utils/whatsappIdentity.js";
import { ConnectorClient } from "./connectorClient.js";
import { ConnectorIdentityResolverClient, type ConnectorIdentityResolution } from "./connectorIdentityResolverClient.js";
import { ContactEnrichmentCacheService } from "./contactEnrichmentCacheService.js";
import { ContactRecoveryAuditService } from "./contactRecoveryAuditService.js";
import { ContactRepairProposalService } from "./contactRepairProposalService.js";
import { ProfilePictureRecoveryService } from "./profilePictureRecoveryService.js";
import { WhatsAppContactSnapshotService } from "./whatsAppContactSnapshotService.js";

type RecoveryCandidate = {
  source: string;
  confidenceScore: number;
  normalizedJid?: string | null;
  phoneNumber?: string | null;
  lid?: string | null;
  displayName?: string | null;
  profilePicUrl?: string | null;
  rawPayload?: unknown;
};

function canManageAccount(authUser: AuthUser, account: { organization_id: string; created_by?: string | null }) {
  if (authUser.role === "super_admin") return true;
  if (account.organization_id !== authUser.organizationId) return false;
  if (authUser.role === "org_admin") return true;
  return Boolean(authUser.organizationUserId && account.created_by === authUser.organizationUserId);
}

function toE164(phone: string | null | undefined) {
  return normalizePhoneNumber(phone);
}

function candidateFromConnectorResolution(resolution: ConnectorIdentityResolution | null | undefined): RecoveryCandidate | null {
  if (!resolution?.resolved) return null;

  return {
    source: resolution.source ?? "connector_identity_resolver",
    confidenceScore: Number(resolution.confidenceScore ?? 0),
    normalizedJid: resolution.normalizedJid ?? null,
    phoneNumber: resolution.phoneNumber ?? null,
    lid: resolution.lid ?? null,
    displayName: pickBestRecoveryName(resolution.verifiedName, resolution.displayName, resolution.pushName, resolution.notifyName),
    profilePicUrl: resolution.profilePicUrl ?? null,
    rawPayload: resolution
  };
}

export class WhatsAppContactRecoveryEngine {
  constructor(
    private readonly accountRepository = new WhatsAppAdminRepository(),
    private readonly cacheService = new ContactEnrichmentCacheService(),
    private readonly snapshotService = new WhatsAppContactSnapshotService(),
    private readonly profilePictureService = new ProfilePictureRecoveryService(),
    private readonly auditService = new ContactRecoveryAuditService(),
    private readonly identityRepository = new ContactIdentityRepository(),
    private readonly connectorClient = new ConnectorClient(),
    private readonly identityResolverClient = new ConnectorIdentityResolverClient()
  ) {}

  async verifyPhoneOnWhatsApp(input: {
    organizationId: string;
    whatsappAccountId: string;
    phoneNumber: string;
  }) {
    const phoneNumber = normalizePhoneNumber(input.phoneNumber);
    if (!phoneNumber) {
      return { exists: false, confidence: 0 };
    }

    try {
      const result = await this.connectorClient.verifyPhoneOnWhatsApp(input.whatsappAccountId, phoneNumber);
      const identity = normalizeWhatsAppIdentity(result.jid ?? null);
      await withTransaction(async (client) => {
        await this.auditService.record(client, {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          action: "onwhatsapp_verified",
          source: "onWhatsApp",
          confidenceScore: result.exists && identity.normalizedJid ? 90 : 40,
          afterData: result,
          reason: "Verified known CRM phone number with Baileys onWhatsApp"
        });
        if (result.exists && identity.normalizedJid) {
          await this.cacheService.updateLastKnownGood(client, {
            organizationId: input.organizationId,
            whatsappAccountId: input.whatsappAccountId,
            rawJid: result.jid ?? identity.normalizedJid,
            normalizedJid: identity.normalizedJid,
            phoneNumber,
            source: "onWhatsApp",
            rawPayload: result
          });
        }
      });

      return {
        exists: result.exists,
        jid: result.jid ?? undefined,
        normalizedJid: identity.normalizedJid ?? undefined,
        phoneNumber,
        confidence: result.exists && identity.normalizedJid ? 90 : 40
      };
    } catch (error) {
      logger.warn({ error, whatsappAccountId: input.whatsappAccountId }, "onWhatsApp verification failed");
      return { exists: false, phoneNumber, confidence: 0 };
    }
  }

  async recoverFromHistorySync(input: {
    organizationId: string;
    whatsappAccountId: string;
    contactId?: string | null;
    normalizedJid?: string | null;
    phoneNumber?: string | null;
    lid?: string | null;
  }) {
    if (!input.contactId) return { recovered: false };
    return this.recoverIncompleteContact({ ...input, contactId: input.contactId, reason: "history_sync_processed" });
  }

  async recoverIncompleteContact(input: {
    organizationId: string;
    whatsappAccountId: string;
    contactId: string;
    rawJid?: string | null;
    normalizedJid?: string | null;
    phoneNumber?: string | null;
    lid?: string | null;
    reason?: string | null;
    dryRun?: boolean;
  }) {
    return withTransaction(async (client) => {
      const contact = await this.loadContact(client, input.organizationId, input.contactId);
      if (!contact) {
        return { status: "skipped", reason: "contact_not_found" };
      }

      const identity = normalizeWhatsAppIdentity(input.normalizedJid ?? input.rawJid ?? null);
      const normalizedJid = input.normalizedJid ?? identity.normalizedJid;
      const phoneNumber = normalizePhoneNumber(input.phoneNumber) ?? contact.primary_phone_normalized ?? identity.phoneNumber;
      const lid = input.lid ?? identity.lid;

      const cache = await this.cacheService.restoreFromLastKnownGood(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        contactId: input.contactId,
        normalizedJid,
        phoneNumber,
        lid
      });
      const cacheCandidate = cache
        ? {
            source: "last_known_good_cache",
            confidenceScore: Number(cache.confidence_score ?? 0),
            normalizedJid: cache.normalized_jid,
            phoneNumber: cache.phone_number,
            lid: cache.lid,
            displayName: pickBestRecoveryName(cache.best_display_name, cache.best_verified_name, cache.best_push_name, cache.best_notify_name),
            profilePicUrl: cache.best_profile_pic_url,
            rawPayload: cache.raw_payload
          }
        : null;

      const snapshot = !cacheCandidate
        ? await this.snapshotService.findBestSnapshotMatch(client, {
            organizationId: input.organizationId,
            whatsappAccountId: input.whatsappAccountId,
            normalizedJid,
            phoneNumber,
            lid
          })
        : null;
      const snapshotCandidate = snapshot
        ? {
            source: "snapshot",
            confidenceScore: calculateContactQualityScore({
              normalizedJid: snapshot.normalized_jid,
              phoneNumber: snapshot.phone_number,
              lid: snapshot.lid,
              pushName: snapshot.push_name,
              verifiedName: snapshot.verified_name,
              notifyName: snapshot.notify_name,
              profilePicUrl: snapshot.profile_pic_url,
              source: snapshot.source
            }),
            normalizedJid: snapshot.normalized_jid,
            phoneNumber: snapshot.phone_number,
            lid: snapshot.lid,
            displayName: pickBestRecoveryName(snapshot.verified_name, snapshot.push_name, snapshot.notify_name),
            profilePicUrl: snapshot.profile_pic_url,
            rawPayload: snapshot.raw_payload
          }
        : null;

      let candidate: RecoveryCandidate | null = cacheCandidate ?? snapshotCandidate;

      if (!candidate || candidate.confidenceScore < 85) {
        try {
          const connectorResolution = await this.identityResolverClient.resolveContactIdentity({
            accountId: input.whatsappAccountId,
            contactId: input.contactId,
            jid: normalizedJid,
            lid,
            knownPhone: phoneNumber,
            displayName: contact.display_name
          });
          const connectorCandidate = candidateFromConnectorResolution(connectorResolution);
          if (connectorCandidate && (!candidate || connectorCandidate.confidenceScore > candidate.confidenceScore)) {
            candidate = connectorCandidate;
          }
        } catch (error) {
          await this.auditService.record(client, {
            organizationId: input.organizationId,
            whatsappAccountId: input.whatsappAccountId,
            contactId: input.contactId,
            action: "connector_identity_resolver_failed",
            source: "connector_identity_resolver",
            reason: error instanceof Error ? error.message : "Unable to resolve contact identity from connector"
          });
        }
      }

      if (!candidate && phoneNumber && !normalizedJid) {
        const verified = await this.verifyPhoneOnWhatsApp({
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          phoneNumber
        });
        if (verified.exists && verified.normalizedJid) {
          candidate = {
            source: "onWhatsApp",
            confidenceScore: verified.confidence,
            normalizedJid: verified.normalizedJid,
            phoneNumber: verified.phoneNumber ?? phoneNumber,
            lid: null,
            displayName: null,
            profilePicUrl: null,
            rawPayload: verified
          };
        }
      }

      if (!candidate) {
        await this.auditService.record(client, {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          contactId: input.contactId,
          action: "skipped_low_confidence",
          source: "recovery_engine",
          reason: "No cache, snapshot, verified WhatsApp, or connector resolver candidate found"
        });
        return { status: "skipped", reason: "no_candidate" };
      }

      const conflict = await this.findConflict(client, input.organizationId, input.contactId, candidate);
      if (conflict) {
        const proposal = await this.sendToRepairQueue(client, contact, candidate, "skipped_conflict", conflict);
        await this.auditService.record(client, {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          contactId: input.contactId,
          action: "skipped_conflict",
          source: candidate.source,
          confidenceScore: candidate.confidenceScore,
          beforeData: contact,
          afterData: candidate,
          reason: conflict
        });
        return { status: "repair_queue", proposal };
      }

      if (candidate.confidenceScore >= 60 && candidate.confidenceScore < 85) {
        const proposal = await this.sendToRepairQueue(client, contact, candidate, "sent_to_repair_queue", "Medium-confidence recovery needs admin approval");
        await this.auditService.record(client, {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          contactId: input.contactId,
          action: "sent_to_repair_queue",
          source: candidate.source,
          confidenceScore: candidate.confidenceScore,
          beforeData: contact,
          afterData: candidate,
          reason: "Medium-confidence recovery needs admin approval"
        });
        return { status: "repair_queue", proposal };
      }

      if (candidate.confidenceScore < 60) {
        await this.auditService.record(client, {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          contactId: input.contactId,
          action: "skipped_low_confidence",
          source: candidate.source,
          confidenceScore: candidate.confidenceScore,
          beforeData: contact,
          afterData: candidate,
          reason: "Confidence below auto-apply threshold"
        });
        return { status: "skipped", reason: "low_confidence" };
      }

      const merged = mergeContactWithoutDowngrade(contact, {
        displayName: candidate.displayName ?? null,
        phoneNumber: candidate.phoneNumber ?? null,
        profilePicUrl: candidate.profilePicUrl ?? null
      });
      const changed = hasRecoveryMergeChanges(contact, merged);
      let profilePictureJobQueued = false;

      if (!input.dryRun && changed) {
        await client.query(
          `
            update contacts
            set display_name = $3,
                primary_phone_e164 = $4,
                primary_phone_normalized = $5,
                primary_avatar_url = $6,
                company_name = $7,
                identity_status = case
                  when coalesce(identity_status, 'resolved') in ('needs_merge_review', 'needs_phone') then identity_status
                  else 'resolved'
                end,
                updated_at = timezone('utc', now())
            where id = $1
              and organization_id = $2
          `,
          [
            contact.id,
            input.organizationId,
            merged.display_name,
            merged.primary_phone_e164,
            merged.primary_phone_normalized,
            merged.primary_avatar_url,
            merged.company_name
          ]
        );
      }

      if (!input.dryRun && candidate.normalizedJid) {
        await this.identityRepository.upsert(client, {
          organizationId: input.organizationId,
          contactId: input.contactId,
          whatsappAccountId: input.whatsappAccountId,
          whatsappJid: candidate.normalizedJid,
          phoneE164: toE164(candidate.phoneNumber),
          phoneNormalized: normalizePhoneNumber(candidate.phoneNumber),
          profileName: candidate.displayName ?? null,
          profileAvatarUrl: candidate.profilePicUrl ?? null,
          identityQuality: candidate.confidenceScore >= 85 ? "strong" : "normal",
          identityScore: candidate.confidenceScore
        });
      }

      if (!contact.primary_avatar_url && candidate.normalizedJid) {
        const queued = input.dryRun
          ? { queued: true }
          : await this.profilePictureService.queueProfilePictureFetch(client, {
              organizationId: input.organizationId,
              whatsappAccountId: input.whatsappAccountId,
              contactId: input.contactId,
              jid: candidate.normalizedJid
            });
        profilePictureJobQueued = queued.queued;
      }

      await this.auditService.record(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        contactId: input.contactId,
        action: candidate.source === "last_known_good_cache" ? "restored_from_cache" : "restored_from_snapshot",
        source: candidate.source,
        confidenceScore: candidate.confidenceScore,
        beforeData: contact,
        afterData: { ...merged, normalizedJid: candidate.normalizedJid, dryRun: Boolean(input.dryRun) },
        reason: input.reason ?? "Recovered incomplete WhatsApp contact"
      });

      return { status: input.dryRun ? "would_recover" : "recovered", changed, profilePictureJobQueued };
    });
  }

  async scanAndRecoverIncompleteContacts(input: {
    authUser?: AuthUser;
    organizationId: string;
    whatsappAccountId: string;
    limit?: number;
    dryRun?: boolean;
  }) {
    if (input.authUser) {
      const account = await withTransaction((client) => this.accountRepository.findById(client, input.whatsappAccountId));
      if (!account || account.organization_id !== input.organizationId) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }
      if (!canManageAccount(input.authUser, account)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }
    }

    const contacts = await withTransaction(async (client) => {
      const result = await client.query(
        `
          select distinct on (c.id)
            c.id,
            c.organization_id,
            c.display_name,
            c.primary_phone_e164,
            c.primary_phone_normalized,
            c.primary_avatar_url,
            c.company_name,
            ci.wa_jid,
            ci.phone_normalized as identity_phone,
            ci.profile_avatar_url as identity_avatar_url
          from contacts c
          left join contact_identities ci
            on ci.contact_id = c.id
           and ci.organization_id = c.organization_id
           and ci.whatsapp_account_id = $2
           and ci.deleted_at is null
          where c.organization_id = $1
            and c.deleted_at is null
            and coalesce(c.status, 'active') != 'merged'
            and exists (
              select 1
              from conversations conv
              where conv.organization_id = c.organization_id
                and conv.whatsapp_account_id = $2
                and conv.contact_id = c.id
            )
            and (
              nullif(trim(c.display_name), '') is null
              or lower(trim(c.display_name)) in ('unknown', 'unknown contact', 'customer', 'contact', 'undefined', 'null')
              or c.primary_phone_normalized is null
              or c.primary_avatar_url is null
              or ci.wa_jid is null
            )
          order by c.id, ci.last_seen_at desc nulls last
          limit $3
        `,
        [input.organizationId, input.whatsappAccountId, input.limit ?? 50]
      );
      return result.rows;
    });

    const summary = {
      scanned: contacts.length,
      recovered: 0,
      sentToRepairQueue: 0,
      profilePictureJobsQueued: 0,
      skipped: 0,
      errors: 0
    };

    for (const contact of contacts) {
      try {
        const identity = normalizeWhatsAppIdentity(contact.wa_jid);
        const result = await this.recoverIncompleteContact({
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          contactId: contact.id,
          normalizedJid: identity.normalizedJid,
          phoneNumber: contact.primary_phone_normalized ?? contact.identity_phone ?? null,
          lid: identity.lid,
          reason: "manual_scan",
          dryRun: input.dryRun ?? false
        });

        if (result.status === "recovered" || result.status === "would_recover") summary.recovered += 1;
        else if (result.status === "repair_queue") summary.sentToRepairQueue += 1;
        else summary.skipped += 1;
        if ("profilePictureJobQueued" in result && result.profilePictureJobQueued) {
          summary.profilePictureJobsQueued += 1;
        }
      } catch (error) {
        summary.errors += 1;
        logger.warn({ error, contactId: contact.id }, "Contact recovery failed for contact");
      }
    }

    return summary;
  }

  private async loadContact(client: PoolClient, organizationId: string, contactId: string): Promise<ContactRecord | null> {
    const result = await client.query(
      `
        select id, organization_id, display_name, primary_phone_e164, primary_phone_normalized, primary_avatar_url, company_name, email, notes, owner_user_id
        from contacts
        where id = $1
          and organization_id = $2
          and deleted_at is null
        limit 1
      `,
      [contactId, organizationId]
    );
    return result.rows[0] ?? null;
  }

  private async findConflict(client: PoolClient, organizationId: string, contactId: string, candidate: RecoveryCandidate) {
    if (candidate.phoneNumber) {
      const result = await client.query(
        `
          select id
          from contacts
          where organization_id = $1
            and id <> $2
            and primary_phone_normalized = $3
            and deleted_at is null
            and coalesce(status, 'active') != 'merged'
          limit 1
        `,
        [organizationId, contactId, normalizePhoneNumber(candidate.phoneNumber)]
      );
      if (result.rows[0]) return "Recovered phone belongs to another active contact";
    }

    if (candidate.normalizedJid) {
      const result = await client.query(
        `
          select contact_id
          from contact_identities
          where organization_id = $1
            and wa_jid = $2
            and deleted_at is null
            and contact_id <> $3
          limit 1
        `,
        [organizationId, candidate.normalizedJid, contactId]
      );
      if (result.rows[0]) return "Recovered JID belongs to another contact identity";
    }

    return null;
  }

  private async sendToRepairQueue(client: PoolClient, contact: ContactRecord, candidate: RecoveryCandidate, action: string, reason: string) {
    const proposedAction =
      candidate.phoneNumber && !contact.primary_phone_normalized
        ? "restore_phone"
        : candidate.profilePicUrl && !contact.primary_avatar_url
          ? "restore_profile_pic"
          : candidate.normalizedJid
            ? "link_jid"
            : "restore_name";

    return ContactRepairProposalService.createRecoveryProposal(client, {
      organizationId: contact.organization_id,
      contactId: contact.id,
      reason,
      confidenceScore: candidate.confidenceScore,
      proposedAction,
      beforeSnapshot: contact as unknown as Record<string, unknown>,
      proposedAfterSnapshot: candidate as Record<string, unknown>,
      repairPlan: {
        issue_type: "whatsapp_contact_recovery",
        source: candidate.source,
        confidence_score: candidate.confidenceScore,
        current_contact: contact,
        proposed_recovered_data: candidate,
        recommended_action: proposedAction,
        audit_action: action,
        merge_mode: "admin_approval_required"
      }
    });
  }
}
