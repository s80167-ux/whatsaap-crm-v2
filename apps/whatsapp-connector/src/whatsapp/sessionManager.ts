import {
  type Contact,
  downloadMediaMessage,
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
import { detectMessageType, extractInboundMediaAttachment, extractTextContent } from "../utils/message.js";
import {
  bestPhoneFromWhatsAppMessageKey,
  extractAllWhatsAppJidCandidates,
  isWhatsAppDirectChatJid,
  jidToPhone,
  normalizeWhatsAppJid
} from "../utils/phone.js";

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

type ContactSnapshot = Pick<Contact, "id" | "jid" | "lid" | "name" | "notify" | "verifiedName" | "imgUrl">;
export type StoredContactSnapshot = {
  id: string;
  jid: string | null | undefined;
  lid: string | null | undefined;
  name: string | null | undefined;
  notify: string | null | undefined;
  verifiedName: string | null | undefined;
  imgUrl: string | null | undefined;
};
type ContactSyncWaiter = {
  resolve: (contacts: StoredContactSnapshot[]) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};
type ConnectionWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

const HISTORY_SYNC_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_HISTORY_SYNC_LOOKBACK_DAYS = 7;
const SEND_RECONNECT_TIMEOUT_MS = 20_000;

async function downloadInboundMedia(socket: ReturnType<typeof makeWASocket>, message: WAMessage) {
  const attachment = extractInboundMediaAttachment(message);

  if (!attachment) {
    return null;
  }

  const buffer = await downloadMediaMessage(message, "buffer", {}, {
    logger,
    reuploadRequest: socket.updateMediaMessage
  });

  return {
    ...attachment,
    dataBase64: buffer.toString("base64"),
    fileSizeBytes: attachment.fileSizeBytes > 0 ? attachment.fileSizeBytes : buffer.length
  };
}

function isWithinHistorySyncWindow(sentAt: Date, lookbackDays: number | null | undefined) {
  if (lookbackDays === -1) {
    return true;
  }

  const days = Math.max(0, lookbackDays ?? DEFAULT_HISTORY_SYNC_LOOKBACK_DAYS);
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

function isLocalDatabaseUrl(databaseUrl: string) {
  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function shouldBlockSessionMutationInThisEnvironment() {
  return env.NODE_ENV !== "production" && !env.ALLOW_NON_PRODUCTION_REMOTE_CONNECTOR && !isLocalDatabaseUrl(env.DATABASE_URL);
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
  private readonly connectedAccounts = new Set<string>();
  private readonly reconnectFailureCounts = new Map<string, number>();
  private readonly accountRepository = new WhatsAppAccountRepository();
  private readonly runtimeRepository = new WhatsAppRuntimeRepository();
  private readonly rawEventIngestionService = new RawEventIngestionService();
  private readonly phoneJidByLid = new Map<string, string>();
  private readonly avatarUrlByJid = new Map<string, string>();
  private readonly contactByJid = new Map<string, ContactSnapshot>();
  private readonly contactSyncWaiters = new Map<string, ContactSyncWaiter[]>();
  private readonly connectionWaiters = new Map<string, ConnectionWaiter[]>();

  getSocket(accountId: string) {
    return this.sockets.get(accountId);
  }

  isConnected(accountId: string) {
    const socket = this.getSocket(accountId);
    const socketUserId = (socket as { user?: { id?: string } } | undefined)?.user?.id;

    return Boolean(socket && socketUserId && this.connectedAccounts.has(accountId));
  }

  listStoredContacts(accountId: string): StoredContactSnapshot[] {
    const contacts = new Map<string, StoredContactSnapshot>();

    for (const [key, snapshot] of this.contactByJid.entries()) {
      if (!key.startsWith(`${accountId}::`)) {
        continue;
      }

      const dedupeKey = snapshot.jid ?? snapshot.lid ?? snapshot.id ?? key;

      if (!contacts.has(dedupeKey)) {
        contacts.set(dedupeKey, {
          id: snapshot.id,
          jid: snapshot.jid,
          lid: snapshot.lid,
          name: snapshot.name,
          notify: snapshot.notify,
          verifiedName: snapshot.verifiedName,
          imgUrl: snapshot.imgUrl
        });
      }
    }

    return Array.from(contacts.values());
  }

  async syncContacts(account: {
    id: string;
    organization_id: string;
    label: string | null;
    connection_status: string;
    account_jid: string | null;
    display_name: string | null;
    history_sync_lookback_days?: number | null;
  }) {
    const existingContacts = this.listStoredContacts(account.id);
    const hasLiveSession = this.connectedAccounts.has(account.id) && this.sockets.has(account.id);

    if (!hasLiveSession) {
      throw new Error("WhatsApp account must be connected before syncing contacts");
    }

    if (existingContacts.length > 0) {
      return existingContacts;
    }

    return this.waitForContacts(account.id, 15_000);
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
    if (shouldBlockSessionMutationInThisEnvironment()) {
      logger.error(
        {
          accountId: account.id,
          nodeEnv: env.NODE_ENV,
          connectorInstanceId: env.CONNECTOR_INSTANCE_ID
        },
        "Refusing to reconnect WhatsApp session from a non-production connector pointed at a remote database"
      );
      return;
    }

    this.disabledAccounts.delete(account.id);
    this.connectedAccounts.delete(account.id);
    this.reconnectFailureCounts.delete(account.id);

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
    if (shouldBlockSessionMutationInThisEnvironment()) {
      logger.error(
        {
          accountId: account.id,
          nodeEnv: env.NODE_ENV,
          connectorInstanceId: env.CONNECTOR_INSTANCE_ID
        },
        "Refusing to initialize WhatsApp session from a non-production connector pointed at a remote database"
      );
      return;
    }

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
        setTimeout(() => {
          void this.initializeSession(account);
        }, env.CONNECTOR_LEASE_TTL_MS + 1_000);
        return;
      }

      const authDir = path.resolve(path.join(env.BAILEYS_AUTH_DIR, account.id));
      await fs.mkdir(authDir, { recursive: true });
      const credsPath = path.join(authDir, "creds.json");
      const hasExistingCreds = await fs
        .access(credsPath)
        .then(() => true)
        .catch(() => false);

      logger.info(
        { accountId: account.id, authDir, hasExistingCreds },
        "Initializing WhatsApp auth state"
      );

      if (!hasExistingCreds) {
        logger.warn(
          { accountId: account.id, authDir, credsPath },
          "WhatsApp auth credentials were not found before socket startup; Baileys will require QR pairing"
        );
      }

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();

      const socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: ["WhatsApp CRM v2 Connector", "Chrome", "1.0.0"],
        syncFullHistory: true
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
            this.connectedAccounts.add(account.id);
            this.reconnectFailureCounts.delete(account.id);
            this.flushConnectionWaiters(account.id);

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
            const activeRuntime = this.runtimes.get(account.id);

            if (activeRuntime?.sessionId !== session.id) {
              logger.info(
                { accountId: account.id, sessionId: session.id, activeSessionId: activeRuntime?.sessionId ?? null },
                "Ignoring stale WhatsApp session close event"
              );
              return;
            }

            let closePersistenceFailed = false;
            const hadConnected = this.connectedAccounts.delete(account.id);
            const consecutiveReconnectFailures = hadConnected
              ? 0
              : (this.reconnectFailureCounts.get(account.id) ?? 0) + 1;
            const autoReconnectSuppressed =
              shouldReconnect &&
              !hadConnected &&
              consecutiveReconnectFailures >= env.CONNECTOR_MAX_CONSECUTIVE_RECONNECT_FAILURES;

            if (hadConnected) {
              this.reconnectFailureCounts.delete(account.id);
            } else {
              this.reconnectFailureCounts.set(account.id, consecutiveReconnectFailures);
            }

            if (autoReconnectSuppressed) {
              this.disabledAccounts.add(account.id);
              this.rejectConnectionWaiters(account.id, new Error("WhatsApp reconnect was suppressed after repeated failures"));
            }

            this.sockets.delete(account.id);
            this.clearRuntime(account.id);

            try {
              await withTransaction(async (client) => {
                await this.runtimeRepository.closeSession(client, {
                  sessionId: session.id,
                  reason,
                  incrementReconnectAttempt: shouldReconnect
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

                if (!shouldReconnect) {
                  await this.accountRepository.releaseLease(client, {
                    accountId: account.id,
                    ownerId: env.CONNECTOR_INSTANCE_ID
                  });
                }
                if (autoReconnectSuppressed) {
                  await this.runtimeRepository.appendConnectionEvent(client, {
                    whatsappAccountId: account.id,
                    sessionId: session.id,
                    eventType: "reconnect_suppressed",
                    severity: "warn",
                    payload: {
                      status_code: statusCode,
                      consecutive_failures: consecutiveReconnectFailures,
                      max_consecutive_failures: env.CONNECTOR_MAX_CONSECUTIVE_RECONNECT_FAILURES
                    }
                  });
                  await this.accountRepository.releaseLease(client, {
                    accountId: account.id,
                    ownerId: env.CONNECTOR_INSTANCE_ID
                  });
                }

                await this.accountRepository.updateStatus(client, account.id, "disconnected");
              });
            } catch (error) {
              closePersistenceFailed = true;
              logger.error(
                { error, accountId: account.id, sessionId: session.id, shouldReconnect, statusCode },
                "Failed to persist WhatsApp session close state"
              );
            }

            logger.warn(
              {
                accountId: account.id,
                statusCode,
                shouldReconnect,
                closePersistenceFailed,
                hadConnected,
                consecutiveReconnectFailures,
                autoReconnectSuppressed
              },
              "WhatsApp session closed"
            );

            if (shouldReconnect && !autoReconnectSuppressed && !this.disabledAccounts.has(account.id)) {
              setTimeout(() => {
                void this.initializeSession(account);
              }, 5_000);
            } else {
              this.rejectConnectionWaiters(account.id, new Error("WhatsApp session is not connected"));
            }
          }
        } catch (error) {
          logger.error({ error, accountId: account.id, connection }, "Failed to handle WhatsApp connection update");
        }
      });

      socket.ev.on("contacts.upsert", (contacts) => {
        logger.info({ count: contacts.length, sample: contacts.slice(0, 3) }, "contacts.upsert event received");
        this.storeContactSnapshots(account.id, contacts);
      });

      socket.ev.on("contacts.update", (contacts) => {
        logger.info({ count: contacts.length, sample: contacts.slice(0, 3) }, "contacts.update event received");
        this.storeContactSnapshots(account.id, contacts);
      });

      const handleWhatsAppMessage = async (message: WAMessage) => {
        if (!message.key?.id || !message.key?.remoteJid) {
          return;
        }

        if (!isWhatsAppDirectChatJid(message.key.remoteJid)) {
          logger.debug({ accountId: account.id, remoteJid: message.key.remoteJid }, "Skipping unsupported WhatsApp chat target");
          return;
        }

        const direction = message.key.fromMe ? "outgoing" : "incoming";
        const sentAt = new Date(Number(message.messageTimestamp) * 1000 || Date.now());

        if (!isWithinHistorySyncWindow(sentAt, account.history_sync_lookback_days)) {
          logger.debug(
            { accountId: account.id, messageId: message.key.id, sentAt, lookbackDays: account.history_sync_lookback_days },
            "Skipping WhatsApp history message outside configured lookback window"
          );
          return;
        }

        const messageKey = message.key as Record<string, unknown>;
        const phoneRaw =
          bestPhoneFromWhatsAppMessageKey(messageKey) ??
          this.lookupPhoneFromLid(account.id, message.key.remoteJid) ??
          jidToPhone(message.key.remoteJid);
        const profileName = this.resolveCanonicalProfileName(account.id, message);
        const profilePushName = this.resolvePushProfileName(account.id, message);
        const profileAvatarUrl = await this.resolveProfileAvatarUrl(account.id, socket, message.key.remoteJid, messageKey);
        const mediaAttachment =
          direction === "incoming"
            ? await downloadInboundMedia(socket, message).catch((error) => {
                logger.warn({ error, accountId: account.id, messageId: message.key.id }, "Failed to download inbound media");
                return null;
              })
            : null;

        try {
          await this.rawEventIngestionService.enqueueMessageEvent({
            organizationId: account.organization_id,
            whatsappAccountId: account.id,
            externalMessageId: message.key.id,
            remoteJid: message.key.remoteJid,
            phoneRaw,
            profileName,
            profilePushName,
            profileAvatarUrl,
            textBody: extractTextContent(message),
            messageType: detectMessageType(message),
            direction,
            sentAt,
            rawPayload: message,
            mediaAttachment
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

      socket.ev.on("messaging-history.set", async ({ messages, contacts }) => {
        logger.info(
          { messageCount: messages.length, contactCount: contacts.length, sample: messages.slice(0, 3) },
          "messaging-history.set event received"
        );
        if (contacts.length > 0) {
          this.storeContactSnapshots(account.id, contacts);
        }
        for (const message of messages) {
          await handleWhatsAppMessage(message);
        }
      });

      socket.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
        const normalizedLid = normalizeWhatsAppJid(lid);
        const normalizedJid = normalizeWhatsAppJid(jid);

        if (normalizedLid && normalizedJid) {
          this.phoneJidByLid.set(this.scopedContactKey(account.id, normalizedLid), normalizedJid);
        }
      });

      socket.ev.on("messages.update", async (updates) => {
        for (const { key, update } of updates) {
          if (!key?.id || !key?.remoteJid || !key.fromMe) {
            continue;
          }

          if (!isWhatsAppDirectChatJid(key.remoteJid)) {
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
    if (!text && !attachment) {
      throw new Error("Message text or attachment is required");
    }

    const socket = await this.ensureConnectedForSend(accountId);
    const socketUserId = (socket as { user?: { id?: string } }).user?.id;

    if (!socketUserId) {
      throw new Error("WhatsApp session is not fully connected. Please reconnect this WhatsApp account before sending.");
    }

    let result: unknown;

    try {
      if (!attachment) {
        result = await socket.sendMessage(recipientJid, { text: text ?? "" });
      } else {
        const mediaBuffer = Buffer.from(attachment.dataBase64, "base64");

        switch (attachment.kind) {
          case "image":
            result = await socket.sendMessage(recipientJid, {
              image: mediaBuffer,
              caption: text ?? undefined,
              mimetype: attachment.mimeType,
              fileName: attachment.fileName
            });
            break;
          case "video":
            result = await socket.sendMessage(recipientJid, {
              video: mediaBuffer,
              caption: text ?? undefined,
              mimetype: attachment.mimeType,
              fileName: attachment.fileName
            });
            break;
          case "audio":
            result = await socket.sendMessage(recipientJid, {
              audio: mediaBuffer,
              mimetype: attachment.mimeType,
              ptt: false
            });
            break;
          case "document":
            result = await socket.sendMessage(recipientJid, {
              document: mediaBuffer,
              mimetype: attachment.mimeType,
              fileName: attachment.fileName,
              caption: text ?? undefined
            });
            break;
          default:
            throw new Error(`Unsupported attachment kind: ${String(attachment.kind)}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Baileys send error";
      throw new Error(`WhatsApp send failed: ${message}`);
    }

    if (!result || typeof result !== "object") {
      throw new Error("WhatsApp send failed: empty Baileys response");
    }

    return result;
  }

  async terminateSession(accountId: string) {
    if (shouldBlockSessionMutationInThisEnvironment()) {
      logger.error(
        {
          accountId,
          nodeEnv: env.NODE_ENV,
          connectorInstanceId: env.CONNECTOR_INSTANCE_ID
        },
        "Refusing to terminate WhatsApp session from a non-production connector pointed at a remote database"
      );
      return;
    }

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

    this.connectedAccounts.delete(accountId);
  }

  private scopedContactKey(accountId: string, key: string) {
    return `${accountId}::${key}`;
  }

  private waitForContacts(accountId: string, timeoutMs: number) {
    const existing = this.listStoredContacts(accountId);
    if (existing.length > 0) {
      return Promise.resolve(existing);
    }

    return new Promise<StoredContactSnapshot[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiters = this.contactSyncWaiters.get(accountId) ?? [];
        this.contactSyncWaiters.set(
          accountId,
          waiters.filter((waiter) => waiter.timeout !== timeout)
        );
        reject(new Error("WhatsApp did not return any contacts before the sync timed out"));
      }, timeoutMs);

      const waiter: ContactSyncWaiter = { resolve, reject, timeout };
      const waiters = this.contactSyncWaiters.get(accountId) ?? [];
      waiters.push(waiter);
      this.contactSyncWaiters.set(accountId, waiters);
    });
  }

  private waitForConnection(accountId: string, timeoutMs: number) {
    if (this.isConnected(accountId)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiters = this.connectionWaiters.get(accountId) ?? [];
        this.connectionWaiters.set(
          accountId,
          waiters.filter((waiter) => waiter.timeout !== timeout)
        );
        reject(new Error("WhatsApp session did not reconnect before the send timeout"));
      }, timeoutMs);

      const waiter: ConnectionWaiter = { resolve, reject, timeout };
      const waiters = this.connectionWaiters.get(accountId) ?? [];
      waiters.push(waiter);
      this.connectionWaiters.set(accountId, waiters);
    });
  }

  private flushConnectionWaiters(accountId: string) {
    const waiters = this.connectionWaiters.get(accountId);
    if (!waiters?.length) {
      return;
    }

    this.connectionWaiters.delete(accountId);
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve();
    }
  }

  private rejectConnectionWaiters(accountId: string, error: Error) {
    const waiters = this.connectionWaiters.get(accountId);
    if (!waiters?.length) {
      return;
    }

    this.connectionWaiters.delete(accountId);
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }

  private async ensureConnectedForSend(accountId: string) {
    const existingSocket = this.getSocket(accountId);

    if (existingSocket && this.isConnected(accountId)) {
      return existingSocket;
    }

    logger.warn({ accountId }, "WhatsApp send requested while session is not connected; reconnecting before send");

    const account = await withTransaction((client) => this.accountRepository.findById(client, accountId));

    if (!account) {
      throw new Error("WhatsApp account not found");
    }

    await withTransaction((client) => this.accountRepository.updateStatus(client, accountId, "reconnecting"));
    await this.reconnectSession(account);

    try {
      await this.waitForConnection(accountId, SEND_RECONNECT_TIMEOUT_MS);
    } catch (error) {
      await withTransaction((client) => this.accountRepository.updateStatus(client, accountId, "reconnecting"));
      throw error;
    }

    const socket = this.getSocket(accountId);

    if (!socket || !this.isConnected(accountId)) {
      throw new Error("WhatsApp session is not connected");
    }

    return socket;
  }

  private flushContactSyncWaiters(accountId: string) {
    const waiters = this.contactSyncWaiters.get(accountId);
    if (!waiters?.length) {
      return;
    }

    const contacts = this.listStoredContacts(accountId);
    if (contacts.length === 0) {
      return;
    }

    this.contactSyncWaiters.delete(accountId);
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve(contacts);
    }
  }

  private lookupPhoneFromLid(accountId: string, jid: string | null | undefined) {
    const normalizedJid = normalizeWhatsAppJid(jid);

    if (!normalizedJid?.endsWith("@lid")) {
      return null;
    }

    return jidToPhone(this.phoneJidByLid.get(this.scopedContactKey(accountId, normalizedJid)));
  }

  private storeContactSnapshots(accountId: string, contacts: Array<Partial<Contact>>) {
    for (const contact of contacts) {
      const ids = [
        ...new Set(
          [contact.id, contact.jid, contact.lid].flatMap((value) => {
            if (typeof value !== "string" || value.length === 0) {
              return [];
            }

            const normalizedJid = normalizeWhatsAppJid(value);
            return normalizedJid && normalizedJid !== value ? [value, normalizedJid] : [value];
          })
        )
      ];

      if (ids.length === 0) {
        continue;
      }

      const snapshot: ContactSnapshot = {
        id: contact.id ?? ids[0],
        jid: contact.jid,
        lid: contact.lid,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
        imgUrl: contact.imgUrl
      };

      for (const id of ids) {
        const scopedId = this.scopedContactKey(accountId, id);
        const existing = this.contactByJid.get(scopedId);
        this.contactByJid.set(scopedId, {
          ...existing,
          ...snapshot,
          id: snapshot.id ?? existing?.id ?? id
        });
      }

      const normalizedLid = normalizeWhatsAppJid(contact.lid);
      const normalizedJid = normalizeWhatsAppJid(contact.jid);

      if (normalizedLid && normalizedJid) {
        this.phoneJidByLid.set(this.scopedContactKey(accountId, normalizedLid), normalizedJid);
      }

      if (typeof contact.imgUrl === "string" && contact.imgUrl.length > 0 && contact.imgUrl !== "changed") {
        for (const id of ids) {
          this.avatarUrlByJid.set(this.scopedContactKey(accountId, id), contact.imgUrl);
        }
      }
    }

    this.flushContactSyncWaiters(accountId);
  }

  private getStoredContactSnapshot(accountId: string, jid: string, key: Record<string, unknown>) {
    const normalizedJid = normalizeWhatsAppJid(jid);
    const mappedPhoneJid = normalizedJid ? this.phoneJidByLid.get(this.scopedContactKey(accountId, normalizedJid)) : null;
    const candidates = [
      jid,
      normalizedJid,
      mappedPhoneJid,
      key.remoteJid,
      key.senderPn,
      key.participantPn,
      key.participant,
      key.remoteJidAlt,
      key.participantAlt,
      ...extractAllWhatsAppJidCandidates({ key })
    ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeWhatsAppJid(candidate) ?? candidate;
      const snapshot = this.contactByJid.get(this.scopedContactKey(accountId, normalizedCandidate));

      if (snapshot) {
        return snapshot;
      }
    }

    return null;
  }

  private resolveCanonicalProfileName(accountId: string, message: WAMessage) {
    if (!message.key?.remoteJid) {
      return null;
    }

    const key = message.key as Record<string, unknown>;
    const snapshot = this.getStoredContactSnapshot(accountId, message.key.remoteJid, key);
    const directVerifiedName = typeof message.verifiedBizName === "string" ? message.verifiedBizName.trim() : "";
    const cachedVerifiedName = typeof snapshot?.verifiedName === "string" ? snapshot.verifiedName.trim() : "";

    return directVerifiedName || cachedVerifiedName || null;
  }

  private resolvePushProfileName(accountId: string, message: WAMessage) {
    if (!message.key?.remoteJid || message.key.fromMe) {
      return null;
    }

    const key = message.key as Record<string, unknown>;
    const snapshot = this.getStoredContactSnapshot(accountId, message.key.remoteJid, key);
    const pushName = typeof message.pushName === "string" ? message.pushName.trim() : "";
    const notifyName = typeof snapshot?.notify === "string" ? snapshot.notify.trim() : "";

    return pushName || notifyName || null;
  }

  private async resolveProfileAvatarUrl(accountId: string, socket: ReturnType<typeof makeWASocket>, jid: string, key: Record<string, unknown>) {
    const normalizedJid = normalizeWhatsAppJid(jid);
    const mappedPhoneJid = normalizedJid ? this.phoneJidByLid.get(this.scopedContactKey(accountId, normalizedJid)) : null;
    const candidates = [
      jid,
      normalizedJid,
      mappedPhoneJid,
      key.senderPn,
      key.participantPn,
      key.participant,
      key.remoteJid,
      key.remoteJidAlt,
      key.participantAlt,
      ...extractAllWhatsAppJidCandidates({ key })
    ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeWhatsAppJid(candidate) ?? candidate;
      const scopedCandidate = this.scopedContactKey(accountId, normalizedCandidate);
      const cached = this.avatarUrlByJid.get(scopedCandidate);

      if (cached) {
        return cached;
      }

      try {
        const avatarUrl = await socket.profilePictureUrl(candidate, "image", 1_500);

        if (avatarUrl) {
          this.avatarUrlByJid.set(scopedCandidate, avatarUrl);
          this.avatarUrlByJid.set(this.scopedContactKey(accountId, normalizedJid ?? jid), avatarUrl);
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
        await this.runtimeRepository.closeSession(client, {
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
