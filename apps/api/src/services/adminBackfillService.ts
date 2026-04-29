import { withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { AppError } from "../lib/errors.js";
import { WhatsAppAdminRepository } from "../repositories/whatsAppAdminRepository.js";
import type { AuthUser } from "../types/auth.js";
import { ConnectorClient } from "./connectorClient.js";
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
    private readonly syncJobService = new WhatsAppSyncJobService()
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
}
