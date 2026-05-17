import { withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { AppError } from "../lib/errors.js";
import { WhatsAppAdminRepository } from "../repositories/whatsAppAdminRepository.js";
import type { AuthUser } from "../types/auth.js";
import { isWeakDisplayName, normalizeDisplayName } from "../utils/contactIdentity.js";
import {
  getWhatsAppJidType,
  isWhatsAppDirectChatJid,
  jidToPhone,
  normalizePhoneNumber,
  normalizeWhatsAppJid
} from "../utils/phone.js";
import { ConnectorClient } from "./connectorClient.js";
import { ContactIdentityRepository } from "./../repositories/contactIdentityRepository.js";
import { ContactRepository } from "./../repositories/contactRepository.js";
import { ContactRepairProposalService } from "./contactRepairProposalService.js";
import { ContactService } from "./contactService.js";
import { WhatsAppSyncJobService } from "./whatsAppSyncJobService.js";

type SyncJobType = "contacts_sync" | "history_backfill" | "full_sync";

function canManageWhatsAppAccount(authUser: AuthUser, account: { organization_id: string; created_by?: string | null }) {
  if (authUser.role === "super_admin") {
    return true;
  }

  if (account.organization_id !== authUser.organizationId) {
    return false;
  }

  if (authUser.role === "org_admin") {
    return true;
  }

  return Boolean(authUser.organizationUserId && account.created_by === authUser.organizationUserId);
}

type ConnectorContact = Awaited<ReturnType<ConnectorClient["syncAccountContacts"]>>["contacts"][number];

type PreparedBackfillContact = {
  source: ConnectorContact;
  selectedJid: string;
  selectedJidType: ReturnType<typeof getWhatsAppJidType>;
  phoneRaw: string | null;
  normalizedPhone: string | null;
  phoneJid: string | null;
  lidJid: string | null;
  profileName: string | null;
  profilePushName: string | null;
  profileAvatarUrl: string | null;
  score: number;
};

function bestNonWeakName(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeDisplayName(value);

    if (normalized && !isWeakDisplayName(normalized)) {
      return normalized;
    }
  }

  return null;
}

function prepareBackfillContact(contact: ConnectorContact): PreparedBackfillContact | null {
  const normalizedJid = normalizeWhatsAppJid(contact.jid);
  const normalizedLid = normalizeWhatsAppJid(contact.lid);
  const jidType = getWhatsAppJidType(normalizedJid);
  const lidType = getWhatsAppJidType(normalizedLid);
  const phoneJid = jidType === "phone" ? normalizedJid : null;
  const lidJid = lidType === "lid" ? normalizedLid : null;
  const selectedJid = phoneJid ?? lidJid;

  if (!selectedJid || !isWhatsAppDirectChatJid(selectedJid)) {
    return null;
  }

  const phoneRaw = jidToPhone(phoneJid) ?? jidToPhone(normalizedJid) ?? null;
  const normalizedPhone = normalizePhoneNumber(phoneRaw);
  const profileName = bestNonWeakName(contact.verifiedName, contact.name, contact.notify);
  const profilePushName = bestNonWeakName(contact.notify);
  const profileAvatarUrl = normalizeDisplayName(contact.imgUrl);

  if (!normalizedPhone && getWhatsAppJidType(selectedJid) === "lid" && !profileName && !profilePushName && !profileAvatarUrl) {
    return null;
  }

  const score =
    (normalizedPhone ? 100 : 0) +
    (phoneJid ? 30 : 0) +
    (contact.verifiedName && !isWeakDisplayName(contact.verifiedName) ? 25 : 0) +
    (profileName ? 20 : 0) +
    (profileAvatarUrl ? 10 : 0) -
    (!normalizedPhone && lidJid ? 30 : 0);

  return {
    source: contact,
    selectedJid,
    selectedJidType: getWhatsAppJidType(selectedJid),
    phoneRaw,
    normalizedPhone,
    phoneJid,
    lidJid,
    profileName,
    profilePushName,
    profileAvatarUrl,
    score
  };
}

function backfillDedupeKey(contact: PreparedBackfillContact) {
  return (
    contact.normalizedPhone ??
    contact.phoneJid ??
    contact.lidJid ??
    (typeof contact.source.id === "string" && contact.source.id.length > 0 ? `connector:${contact.source.id}` : contact.selectedJid)
  );
}

function isBetterBackfillContact(candidate: PreparedBackfillContact, existing: PreparedBackfillContact) {
  if (candidate.normalizedPhone && !existing.normalizedPhone) return true;
  if (!candidate.normalizedPhone && existing.normalizedPhone) return false;
  if (candidate.phoneJid && !existing.phoneJid) return true;
  if (!candidate.phoneJid && existing.phoneJid) return false;
  return candidate.score > existing.score;
}

export class AdminBackfillService {
  constructor(
    private readonly whatsappRepository = new WhatsAppAdminRepository(),
    private readonly connectorClient = new ConnectorClient(),
    private readonly syncJobService = new WhatsAppSyncJobService(),
    private readonly contactService = new ContactService(),
    private readonly contactRepository = new ContactRepository(),
    private readonly contactIdentityRepository = new ContactIdentityRepository()
  ) {}

  async backfillWhatsAppAccount(
    authUser: AuthUser,
    accountId: string,
    lookbackDays: number,
    jobType: SyncJobType = "history_backfill"
  ) {
    const account = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      const updatedAccount = await this.whatsappRepository.update(client, accountId, {
        organizationId: existingAccount.organization_id,
        name: existingAccount.label ?? existingAccount.display_name ?? "WhatsApp Account",
        phoneNumber: existingAccount.account_phone_e164,
        historySyncLookbackDays: lookbackDays
      });

      if (!updatedAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      return updatedAccount;
    });

    const syncJob = await this.syncJobService.createJob({
      authUser,
      organizationId: account.organization_id,
      whatsappAccountId: account.id,
      jobType,
      lookbackDays
    });

    void this.connectorClient.reconnectAccount(account.id).catch((error) => {
      logger.warn({ error, accountId: account.id, syncJobId: syncJob.id }, "WhatsApp sync lookback was saved, but connector reconnect failed");
    });

    return {
      account,
      lookbackDays,
      reconnectRequested: true,
      syncJob
    };
  }

  async syncWhatsAppContacts(authUser: AuthUser, accountId: string) {
    const account = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return existingAccount;
    });

    const connectorResult = await this.connectorClient.syncAccountContacts(account.id);
    const uniqueContacts = new Map<string, PreparedBackfillContact>();
    let skippedWeakEmpty = 0;
    let dedupedWithinBatch = 0;

    for (const contact of connectorResult.contacts) {
      const preparedContact = prepareBackfillContact(contact);

      if (!preparedContact) {
        skippedWeakEmpty += 1;
        continue;
      }

      const dedupeKey = backfillDedupeKey(preparedContact);
      const existing = uniqueContacts.get(dedupeKey);

      if (existing) {
        dedupedWithinBatch += 1;
      }

      if (!existing || isBetterBackfillContact(preparedContact, existing)) {
        uniqueContacts.set(dedupeKey, preparedContact);
      }
    }

    if (connectorResult.contacts.length === 0) {
      throw new AppError(
        "WhatsApp returned no contacts after refresh. Keep the device connected and try again.",
        409,
        "whatsapp_contacts_empty"
      );
    }

    const summary = {
      requested: connectorResult.contacts.length,
      eligible: uniqueContacts.size,
      imported: 0,
      created: 0,
      updated: 0,
      skipped: skippedWeakEmpty,
      weakImported: 0,
      provisionalCreated: 0,
      needsPhone: 0,
      skippedWeakEmpty,
      dedupedWithinBatch,
      repairProposalsCreated: 0,
      linkedByPhone: 0,
      linkedByJid: 0,
      linkedByLid: 0
    };

    for (const contact of uniqueContacts.values()) {
      await withTransaction(async (client) => {
        const existingIdentity = await this.contactIdentityRepository.findByJid(
          client,
          account.organization_id,
          account.id,
          contact.selectedJid
        );
        const existingContact = contact.normalizedPhone
          ? await this.contactRepository.findByNormalizedPhone(client, account.organization_id, contact.normalizedPhone)
          : null;

        const resolved = await this.contactService.findOrCreateCanonicalContact(client, {
          organizationId: account.organization_id,
          whatsappAccountId: account.id,
          whatsappJid: contact.selectedJid,
          phoneRaw: contact.phoneRaw,
          profileName: contact.profileName,
          profilePushName: contact.profilePushName,
          profileAvatarUrl: contact.profileAvatarUrl
        });

        if (!existingIdentity && !existingContact) {
          summary.created += 1;
        } else {
          summary.updated += 1;
        }

        if (existingContact) {
          summary.linkedByPhone += 1;
        } else if (existingIdentity && getWhatsAppJidType(existingIdentity.wa_jid) === "lid") {
          summary.linkedByLid += 1;
        } else if (existingIdentity) {
          summary.linkedByJid += 1;
        }

        if (resolved.identity.identity_quality === "weak" || resolved.identity.identity_quality === "lid_only") {
          summary.weakImported += 1;
        }

        if (resolved.contact.identity_status === "provisional") {
          summary.provisionalCreated += 1;
        }

        if (resolved.contact.identity_status === "needs_phone" || !resolved.contact.primary_phone_normalized) {
          summary.needsPhone += 1;
        }

        const weakProposal = await ContactRepairProposalService.detectWeakIdentityForContact(client, {
          organizationId: account.organization_id,
          contactId: resolved.contact.id
        });

        if (weakProposal.created) {
          summary.repairProposalsCreated += 1;
        }

        summary.imported += 1;
      });
    }

    const duplicateRepairSummary = await ContactRepairProposalService.detectBackfillDuplicateRepairProposals({
      organizationId: account.organization_id,
      whatsappAccountId: account.id
    });
    summary.repairProposalsCreated += duplicateRepairSummary.created;

    return {
      accountId: account.id,
      organizationId: account.organization_id,
      importedAt: new Date().toISOString(),
      summary,
      duplicateRepairSummary
    };
  }
}
