import { withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { AppError } from "../lib/errors.js";
import { WhatsAppAdminRepository } from "../repositories/whatsAppAdminRepository.js";
import type { AuthUser } from "../types/auth.js";
import { isWhatsAppDirectChatJid, jidToPhone } from "../utils/phone.js";
import { ConnectorClient } from "./connectorClient.js";
import { ContactIdentityRepository } from "./../repositories/contactIdentityRepository.js";
import { ContactRepository } from "./../repositories/contactRepository.js";
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
    const uniqueContacts = new Map<string, (typeof connectorResult.contacts)[number]>();

    for (const contact of connectorResult.contacts) {
      const jid = typeof contact.jid === "string" && contact.jid.length > 0
        ? contact.jid
        : typeof contact.lid === "string" && contact.lid.length > 0
          ? contact.lid
          : null;

      if (!jid || !isWhatsAppDirectChatJid(jid)) {
        continue;
      }

      const dedupeKey = contact.jid ?? contact.lid ?? contact.id;
      uniqueContacts.set(dedupeKey, contact);
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
      skipped: 0
    };

    for (const contact of uniqueContacts.values()) {
      const whatsappJid = contact.jid ?? contact.lid ?? null;

      if (!whatsappJid) {
        summary.skipped += 1;
        continue;
      }

      const phoneRaw = jidToPhone(contact.jid ?? null);
      const profileName = contact.verifiedName?.trim() || contact.name?.trim() || null;
      const profilePushName = contact.notify?.trim() || null;
      const profileAvatarUrl = contact.imgUrl?.trim() || null;

      if (!phoneRaw && !profileName && !profilePushName) {
        summary.skipped += 1;
        continue;
      }

      await withTransaction(async (client) => {
        const existingIdentity = await this.contactIdentityRepository.findByJid(
          client,
          account.organization_id,
          account.id,
          whatsappJid
        );
        const existingContact = phoneRaw
          ? await this.contactRepository.findByNormalizedPhone(client, account.organization_id, phoneRaw)
          : null;

        await this.contactService.findOrCreateCanonicalContact(client, {
          organizationId: account.organization_id,
          whatsappAccountId: account.id,
          whatsappJid,
          phoneRaw,
          profileName,
          profilePushName,
          profileAvatarUrl
        });

        if (!existingIdentity && !existingContact) {
          summary.created += 1;
        } else {
          summary.updated += 1;
        }
        summary.imported += 1;
      });
    }

    return {
      accountId: account.id,
      organizationId: account.organization_id,
      importedAt: new Date().toISOString(),
      summary
    };
  }
}
