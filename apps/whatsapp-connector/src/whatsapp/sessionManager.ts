import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WAMessage,
  WAMessageStatus,
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
import { bestPhoneFromWhatsAppMessageKey, jidToPhone } from "../utils/phone.js";

type SocketMap = Map<string, ReturnType<typeof makeWASocket>>;
type SessionRuntimeState = {
  sessionId: string;
  heartbeat: NodeJS.Timeout;
};

type OutboundMediaAttachment = {
  kind: "image" | "video" | "audio" | "document";
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

const HISTORY_SYNC_CLOCK_SKEW_MS = 5 * 60 * 1000;

function isWithinHistorySyncWindow(sentAt: Date, lookbackDays: number | null | undefined) {
  const days = Math.max(0, lookbackDays ?? 7);
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000 - HISTORY_SYNC_CLOCK_SKEW_MS;
  return sentAt.getTime() >= cutoffMs;
}

function mapBaileysStatusToAckStatus(status: number | null | undefined) {
  switch (status) {
    case WAMessageStatus.PENDING:
      return "pending" as const;
    case WAMessageStatus.SERVER_ACK:
      return "server_ack" as const;
    case WAMessageStatus.DELIVERY_ACK:
      return "device_delivered" as const;
    case WAMessageStatus.READ:
      return "read" as const;
    case WAMessageStatus.PLAYED:
      return "played" as const;
    case WAMessageStatus.ERROR:
      return "failed" as const;
    default:
      return null;
  }
}

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
  private readonly initializingAccounts = new Set<string>();
  private readonly accountRepository = new WhatsAppAccountRepository();
  private readonly runtimeRepository = new WhatsAppRuntimeRepository();
  private readonly rawEventIngestionService = new RawEventIngestionService();
  private readonly phoneJidByLid = new Map<string, string>();
  private readonly avatarUrlByJid = new Map<string, string>();

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
    history_sync_lookback_days?: number | null;
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
    history_sync_lookback_days?: number | null;
  }) {
    if (this.disabledAccounts.has(account.id)) {
      return;
    }

    if (this.initializingAccounts.has(account.id)) {
      logger.info({ accountId: account.id }, "Skipping WhatsApp session initialization because it is already in progress");
      return;
    }

    if (this.sockets.has(account.id) || this.runtimes.has(account.id)) {
      logger.info({ accountId: account.id }, "Skipping WhatsApp session initialization because a local runtime already exists");
      return;
    }

    this.initializingAccounts.add(account.id);

    try {
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
        try {
          if (qr) {
            await withTransaction(async (client) => {
              await this.runtimeRepository.touchQrGenerated(client, session.id);
              await this.runtimeRepository.appendConnectionEvent(client, {
                whatsappAccountId: account.id,
                sessionId: session.id,
                eventType: "qr_required",
                severity: "info",
                payload: {
                  qr,
                  qr_length: qr.length
                }
              });
              await this.accountRepository.updateStatus(client, account.id, "qr_required");
            });
            logger.info(
              { accountId: account.id, qrLength: qr.length },
              "WhatsApp QR received; handle it from connector connection.update"
            );
          }

          if (connection === "open") {
            await withTransaction(async (client) => {
              await this.runtimeRepository.touchConnected(client, session.id);
              await this.runtimeRepository.appendConnectionEvent(client, {
                whatsappAccountId: account.id,
                sessionId: session.id,
                eventType: "connected",
                severity: "info"
              });
              await this.accountRepository.updateStatus(client, account.id, "connected");
            });
            logger.info({ accountId: account.id }, "WhatsApp session connected");
          }

          if (connection === "close") {
            const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            const reason = shouldReconnect ? "connection_closed_reconnecting" : "logged_out";

            await withTransaction(async (client) => {
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

              await this.accountRepository.updateStatus(client, account.id, "disconnected");
            });

            this.sockets.delete(account.id);
            this.clearRuntime(account.id);

            logger.warn({ accountId: account.id, statusCode }, "WhatsApp session closed");

            if (shouldReconnect && !this.disabledAccounts.has(account.id)) {
              setTimeout(() => {
                void this.initializeSession(account);
              }, 5_000);
            }
          }
        } catch (error) {
          logger.error({ error, accountId: account.id, connection }, "Failed to handle WhatsApp connection update");
        }
      });

      const handleWhatsAppMessage = async (message: WAMessage) => {
        if (!message.key?.id || !message.key?.remoteJid) {
          return;
        }

        const direction = message.key.fromMe ? "outgoing" : "incoming";
        const sentAt = new Date(Number(message.messageTimestamp) * 1000 || Date.now());

        if (!isWithinHistorySyncWindow(sentAt, account.history_sync_lookback_days)) {
          return;
        }

        const messageKey = message.key as Record<string, unknown>;
        const phoneRaw =
          bestPhoneFromWhatsAppMessageKey(messageKey) ??
          this.lookupPhoneFromLid(message.key.remoteJid) ??
          jidToPhone(message.key.remoteJid);
        const profileAvatarUrl = await this.resolveProfileAvatarUrl(socket, message.key.remoteJid, messageKey);

        try {
          await this.rawEventIngestionService.enqueueMessageEvent({
            organizationId: account.organization_id,
            whatsappAccountId: account.id,
            externalMessageId: message.key.id,
            remoteJid: message.key.remoteJid,
            phoneRaw,
            profileName: message.pushName ?? null,
            profileAvatarUrl,
            textBody: extractTextContent(message),
            messageType: detectMessageType(message),
            direction,
            sentAt,
            rawPayload: message
          });
        } catch (error) {
          logger.error({ error, accountId: account.id, messageId: message.key.id }, "Failed to enqueue raw event");
        }
      };

      socket.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify" && type !== "append") {
          return;
        }

        for (const message of messages) {
          await handleWhatsAppMessage(message);
        }
      });

      socket.ev.on("messaging-history.set", async ({ messages }) => {
        for (const message of messages) {
          await handleWhatsAppMessage(message);
        }
      });

      socket.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
        if (lid && jid) {
          this.phoneJidByLid.set(lid, jid);
        }
      });

      socket.ev.on("messages.update", async (updates) => {
        for (const { key, update } of updates) {
          if (!key?.id || !key?.remoteJid || !key.fromMe) {
            continue;
          }

          const ackStatus = mapBaileysStatusToAckStatus(update.status ?? null);

          if (!ackStatus) {
            continue;
          }

          try {
            await this.rawEventIngestionService.enqueueMessageStatusEvent({
              organizationId: account.organization_id,
              whatsappAccountId: account.id,
              externalMessageId: key.id,
              remoteJid: key.remoteJid,
              ackStatus,
              eventAt: new Date(),
              rawPayload: {
                key,
                update
              }
            });
          } catch (error) {
            logger.error({ error, accountId: account.id, messageId: key.id, ackStatus }, "Failed to enqueue raw status event");
          }
        }
      });
    } finally {
      this.initializingAccounts.delete(account.id);
    }
  }

  async sendMessage(accountId: string, recipientJid: string, text: string | null, attachment: OutboundMediaAttachment | null) {
    const socket = this.getSocket(accountId);

    if (!socket) {
      throw new Error("WhatsApp session is not connected");
    }

    if (!text && !attachment) {
      throw new Error("Message text or attachment is required");
    }

    if (!attachment) {
      return socket.sendMessage(recipientJid, { text: text ?? "" });
    }

    const mediaBuffer = Buffer.from(attachment.dataBase64, "base64");

    switch (attachment.kind) {
      case "image":
        return socket.sendMessage(recipientJid, {
          image: mediaBuffer,
          caption: text ?? undefined,
          mimetype: attachment.mimeType,
          fileName: attachment.fileName
        });
      case "video":
        return socket.sendMessage(recipientJid, {
          video: mediaBuffer,
          caption: text ?? undefined,
          mimetype: attachment.mimeType,
          fileName: attachment.fileName
        });
      case "audio":
        return socket.sendMessage(recipientJid, {
          audio: mediaBuffer,
          mimetype: attachment.mimeType,
          ptt: false
        });
      case "document":
        return socket.sendMessage(recipientJid, {
          document: mediaBuffer,
          mimetype: attachment.mimeType,
          fileName: attachment.fileName,
          caption: text ?? undefined
        });
      default:
        throw new Error(`Unsupported attachment kind: ${String(attachment.kind)}`);
    }
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

  private lookupPhoneFromLid(jid: string | null | undefined) {
    if (!jid?.includes("@lid")) {
      return null;
    }

    return jidToPhone(this.phoneJidByLid.get(jid));
  }

  private async resolveProfileAvatarUrl(socket: ReturnType<typeof makeWASocket>, jid: string, key: Record<string, unknown>) {
    const candidates = [
      key.senderPn,
      key.participantPn,
      key.participant,
      this.phoneJidByLid.get(jid),
      jid
    ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

    for (const candidate of candidates) {
      const cached = this.avatarUrlByJid.get(candidate);

      if (cached) {
        return cached;
      }

      try {
        const avatarUrl = await socket.profilePictureUrl(candidate, "image", 1_500);

        if (avatarUrl) {
          this.avatarUrlByJid.set(candidate, avatarUrl);
          this.avatarUrlByJid.set(jid, avatarUrl);
          return avatarUrl;
        }
      } catch (error) {
        logger.debug({ error, jid: candidate }, "Unable to fetch WhatsApp profile picture");
      }
    }

    return null;
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
