import { pool } from "../config/database.js";
import { WhatsAppAccountRepository } from "../repositories/whatsAppAccountRepository.js";
import { WhatsAppSessionManager } from "../whatsapp/sessionManager.js";

export class ConnectorCommandService {
  constructor(
    private readonly accountRepository = new WhatsAppAccountRepository(),
    private readonly sessionManager = WhatsAppSessionManager.getInstance()
  ) {}

  async initializeAll() {
    await this.sessionManager.initializeAll();
  }

  async initializeAccount(accountId: string) {
    const account = await this.getAccount(accountId);
    await this.sessionManager.initializeSession(account);
    return account;
  }

  async reconnectAccount(accountId: string) {
    const account = await this.getAccount(accountId);
    await this.sessionManager.reconnectSession(account);
    return account;
  }

  async terminateAccount(accountId: string) {
    await this.sessionManager.terminateSession(accountId);
    return { accountId };
  }

  async sendMessage(input: {
    accountId: string;
    recipientJid: string;
    text?: string | null;
    attachment?: {
      kind: "image" | "video" | "audio" | "document";
      fileName: string;
      mimeType: string;
      dataBase64: string;
    } | null;
  }) {
    return this.sessionManager.sendMessage(input.accountId, input.recipientJid, input.text ?? null, input.attachment ?? null);
  }

  private async getAccount(accountId: string) {
    const client = await pool.connect();
    try {
      const account = await this.accountRepository.findById(client, accountId);

      if (!account) {
        throw new Error("WhatsApp account not found");
      }

      return account;
    } finally {
      client.release();
    }
  }
}
