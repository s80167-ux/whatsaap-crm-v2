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
import { WhatsAppRuntimeRepository } from "../repositories/whatsAppRuntimeRepository.js";
import { RawEventIngestionService } from "../services/rawEventIngestionService.js";
import { detectMessageType, extractTextContent } from "../utils/message.js";
import { jidToPhone } from "../utils/phone.js";

type SocketMap = Map<string, ReturnType<typeof makeWASocket>>;
type SessionRuntimeState = {
  sessionId: string;
  heartbeat: NodeJS.Timeout;
};

export class WhatsAppSessionManager {
  private static instance: WhatsAppSessionManager;

  static getInstance() {
    if (!WhatsAppSessionManager.instance) {
      WhatsAppSessionManager.instance = new WhatsAppSessionManager();
    }

    return WhatsAppSessionManager.instance;
  }

  private readonly sockets: SocketMap = new Map();
  private readonly runtimes = new Map<string, SessionRuntimeState>();
  private readonly disabledAccounts = new Set<string>();
  private readonly accountRepository = new WhatsAppAccountRepository();
  private readonly runtimeRepository = new WhatsAppRuntimeRepository();
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

  async reconnectSession(account: {
    id: string;
    organization_id: string;
    label: string | null;
    connection_status: string;
    account_jid: string | null;
    display_name: string | null;
  }) {
    this.disabledAccounts.delete(account.id);

    await this.cleanupRuntime(account.id, "manual_reconnect");

    await withTransaction((client) => this.accountRepository.updateStatus(client, account.id, "reconnecting"));
    await this.initializeSession(account);
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

    const leaseAcquired = await withTransaction((client) =>
      this.accountRepository.tryAcquireLease(client, {
        accountId: account.id,
        ownerId: env.CONNECTOR_INSTANCE_ID,
        staleBefore: new Date(Date.now() - env.CONNECTOR_LEASE_TTL_MS)
      })
    );

    if (!leaseAcquired) {
      logger.info(
        { accountId: account.id, ownerId: env.CONNECTOR_INSTANCE_ID },
        "Skipping WhatsApp session initialization because another connector owns the lease"
      );
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
      browser: ["WhatsApp CRM v2 Connector", "Chrome", "1.0.0"]
    });

    this.sockets.set(account.id, socket);

    const session = await withTransaction(async (client) => {
      const createdSession = await this.runtimeRepository.createSession(client, {
        whatsappAccountId: account.id,
        metadata: {
          owner_id: env.CONNECTOR_INSTANCE_ID
        }
      });

      await this.runtimeRepository.appendConnectionEvent(client, {
        whatsappAccountId: account.id,
        sessionId: createdSession.id,
        eventType: "session_started",
        severity: "info",
        payload: {
          owner_id: env.CONNECTOR_INSTANCE_ID
        }
      });

      return createdSession;
    });

    const heartbeat = setInterval(() => {
      void this.sendHeartbeat(account.id, session.id);
    }, env.CONNECTOR_HEARTBEAT_INTERVAL_MS);

    this.runtimes.set(account.id, {
      sessionId: session.id,
      heartbeat
    });

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        await withTransaction(async (client) => {
          await this.accountRepository.updateStatus(client, account.id, "qr_required");
          await this.runtimeRepository.touchQrGenerated(client, session.id);
          await this.runtimeRepository.appendConnectionEvent(client, {
            whatsappAccountId: account.id,
            sessionId: session.id,
            eventType: "qr_required",
            severity: "info",
            payload: {
              qr_length: qr.length
            }
          });
        });
        logger.info(
          { accountId: account.id, qrLength: qr.length },
          "WhatsApp QR received; handle it from connector connection.update"
        );
      }

      if (connection === "open") {
        await withTransaction(async (client) => {
          await this.accountRepository.updateStatus(client, account.id, "connected");
          await this.runtimeRepository.touchConnected(client, session.id);
          await this.runtimeRepository.appendConnectionEvent(client, {
            whatsappAccountId: account.id,
            sessionId: session.id,
            eventType: "connected",
            severity: "info"
          });
        });
        logger.info({ accountId: account.id }, "WhatsApp session connected");
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const reason = shouldReconnect ? "connection_closed_reconnecting" : "logged_out";

        await withTransaction(async (client) => {
          await this.accountRepository.updateStatus(client, account.id, "disconnected");
          await this.runtimeRepository.endSession(client, {
            sessionId: session.id,
            reason
          });
          await this.runtimeRepository.appendConnectionEvent(client, {
            whatsappAccountId: account.id,
            sessionId: session.id,
            eventType: "disconnected",
            severity: shouldReconnect ? "warn" : "error",
            payload: {
              status_code: statusCode,
              should_reconnect: shouldReconnect
            }
          });

          if (shouldReconnect) {
            await this.runtimeRepository.incrementReconnectAttempts(client, session.id);
          } else {
            await this.accountRepository.releaseLease(client, {
              accountId: account.id,
              ownerId: env.CONNECTOR_INSTANCE_ID
            });
          }
        });

        this.clearRuntime(account.id);

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
          logger.error({ error, accountId: account.id, messageId: message.key.id }, "Failed to enqueue raw event");
        }
      }
    });
  }

  async sendMessage(accountId: string, recipientJid: string, text: string) {
    const socket = this.getSocket(accountId);

    if (!socket) {
      throw new Error("WhatsApp session is not connected");
    }

    return socket.sendMessage(recipientJid, { text });
  }

  async terminateSession(accountId: string) {
    this.disabledAccounts.add(accountId);
    await this.cleanupRuntime(accountId, "terminated");

    const authDir = path.resolve(path.join(env.BAILEYS_AUTH_DIR, accountId));

    try {
      await fs.rm(authDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ error, accountId, authDir }, "Failed to remove WhatsApp auth directory");
    }
  }

  private clearRuntime(accountId: string) {
    const runtime = this.runtimes.get(accountId);

    if (runtime) {
      clearInterval(runtime.heartbeat);
      this.runtimes.delete(accountId);
    }
  }

  private async sendHeartbeat(accountId: string, sessionId: string) {
    try {
      const touched = await withTransaction((client) =>
        this.accountRepository.heartbeatLease(client, {
          accountId,
          ownerId: env.CONNECTOR_INSTANCE_ID
        })
      );

      if (!touched) {
        logger.warn({ accountId, ownerId: env.CONNECTOR_INSTANCE_ID }, "Connector lease heartbeat was rejected");
        await this.cleanupRuntime(accountId, "lease_lost");
        return;
      }
    } catch (error) {
      logger.warn({ error, accountId, sessionId }, "Failed to send connector lease heartbeat");
    }
  }

  private async cleanupRuntime(accountId: string, reason: string) {
    const runtime = this.runtimes.get(accountId);
    this.clearRuntime(accountId);

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

    await withTransaction(async (client) => {
      if (runtime) {
        await this.runtimeRepository.endSession(client, {
          sessionId: runtime.sessionId,
          reason
        });
        await this.runtimeRepository.appendConnectionEvent(client, {
          whatsappAccountId: accountId,
          sessionId: runtime.sessionId,
          eventType: "session_ended",
          severity: "info",
          payload: {
            reason
          }
        });
      }

      await this.accountRepository.releaseLease(client, {
        accountId,
        ownerId: env.CONNECTOR_INSTANCE_ID
      });
    });
  }
}
