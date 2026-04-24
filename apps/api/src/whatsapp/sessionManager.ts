import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from "baileys";
import makeWASocket from "baileys";
import fs from "node:fs/promises";
import path from "node:path";
import { Boom } from "@hapi/boom";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool, withTransaction } from "../config/database.js";
import { WhatsAppAccountRepository } from "../repositories/whatsAppAccountRepository.js";
import { RawEventIngestionService } from "../services/rawEventIngestionService.js";
import { detectMessageType, extractTextContent } from "../utils/message.js";
import { isWhatsAppDirectChatJid, jidToPhone } from "../utils/phone.js";

type SocketMap = Map<string, ReturnType<typeof makeWASocket>>;

export class WhatsAppSessionManager {
  private static instance: WhatsAppSessionManager;

  static getInstance() {
    if (!WhatsAppSessionManager.instance) {
      WhatsAppSessionManager.instance = new WhatsAppSessionManager();
    }

    return WhatsAppSessionManager.instance;
  }

  private readonly sockets: SocketMap = new Map();
  private readonly disabledAccounts = new Set<string>();
  private readonly accountRepository = new WhatsAppAccountRepository();
  private readonly rawEventIngestionService = new RawEventIngestionService();

  getSocket(accountId: string) {
    return this.sockets.get(accountId);
  }

  async initializeAll() {
    const client = await pool.connect();
    try {
      const accounts = await this.accountRepository.listActive(client);
      await Promise.all(accounts.map((account) => this.initializeSession(account)));
    } finally {
      client.release();
    }
  }

  async initializeSession(account: {
    id: string;
    organization_id: string;
    label: string | null;
    connection_status: string;
    account_jid: string | null;
    display_name: string | null;
  }) {
    if (this.disabledAccounts.has(account.id)) {
      return;
    }

    const authDir = path.resolve(path.join(env.BAILEYS_AUTH_DIR, account.id));
    await fs.mkdir(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      browser: ["WhatsApp CRM v2", "Chrome", "1.0.0"]
    });

    this.sockets.set(account.id, socket);

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        await withTransaction((client) => this.accountRepository.updateStatus(client, account.id, "qr_required"));
        logger.info(
          { accountId: account.id, qrLength: qr.length },
          "WhatsApp QR received; handle it from connection.update instead of terminal output"
        );
      }

      if (connection === "open") {
        await withTransaction((client) => this.accountRepository.updateStatus(client, account.id, "connected"));
        logger.info({ accountId: account.id }, "WhatsApp session connected");
      }

      if (connection === "close") {
        await withTransaction((client) => this.accountRepository.updateStatus(client, account.id, "disconnected"));
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.warn({ accountId: account.id, statusCode }, "WhatsApp session closed");

        if (shouldReconnect && !this.disabledAccounts.has(account.id)) {
          setTimeout(() => {
            void this.initializeSession(account);
          }, 5_000);
        }
      }
    });

    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") {
        return;
      }

      for (const message of messages) {
        if (!message.key?.id || !message.key?.remoteJid) {
          continue;
        }

        if (!isWhatsAppDirectChatJid(message.key.remoteJid)) {
          continue;
        }

        const direction = message.key.fromMe ? "outgoing" : "incoming";
        const sentAt = new Date(Number(message.messageTimestamp) * 1000 || Date.now());

        try {
          await this.rawEventIngestionService.enqueueMessageEvent({
            organizationId: account.organization_id,
            whatsappAccountId: account.id,
            externalMessageId: message.key.id,
            remoteJid: message.key.remoteJid,
            phoneRaw: jidToPhone(message.key.remoteJid),
            profileName: message.pushName ?? null,
            textBody: extractTextContent(message),
            messageType: detectMessageType(message),
            direction,
            sentAt,
            rawPayload: message
          });
        } catch (error) {
          logger.error({ error, accountId: account.id, messageId: message.key.id }, "Failed to ingest message");
        }
      }
    });
  }

  async terminateSession(accountId: string) {
    this.disabledAccounts.add(accountId);

    const socket = this.sockets.get(accountId) as
      | {
          end?: (error?: unknown) => void;
          ws?: { close?: () => void };
        }
      | undefined;

    this.sockets.delete(accountId);

    try {
      socket?.end?.();
    } catch (error) {
      logger.warn({ error, accountId }, "Failed to end WhatsApp socket cleanly");
    }

    try {
      socket?.ws?.close?.();
    } catch (error) {
      logger.warn({ error, accountId }, "Failed to close WhatsApp websocket cleanly");
    }

    const authDir = path.resolve(path.join(env.BAILEYS_AUTH_DIR, accountId));

    try {
      await fs.rm(authDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ error, accountId, authDir }, "Failed to remove WhatsApp auth directory");
    }
  }
}
