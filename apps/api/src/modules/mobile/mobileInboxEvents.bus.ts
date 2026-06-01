import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { pool, query } from "../../config/database.js";
import { logger } from "../../config/logger.js";

export type MobileInboxUpdateType =
  | "conversation_created"
  | "conversation_updated"
  | "message_created"
  | "message_updated";

export interface MobileInboxUpdateEvent {
  type: MobileInboxUpdateType;
  conversationId: string;
  organizationId: string;
  timestamp: string;
}

type MobileInboxUpdateInput = Omit<MobileInboxUpdateEvent, "timestamp"> & {
  timestamp?: string;
};

const emitter = new EventEmitter();
emitter.setMaxListeners(0);
const channelName = "mobile_inbox_events";
const sourceId = crypto.randomUUID();
let listenerStarted = false;

export function emitMobileInboxUpdate(input: MobileInboxUpdateInput) {
  const event: MobileInboxUpdateEvent = {
    ...input,
    timestamp: input.timestamp ?? new Date().toISOString()
  };

  emitter.emit("inbox_update", event);
  void query("select pg_notify($1, $2)", [
    channelName,
    JSON.stringify({
      sourceId,
      event
    })
  ]).catch((error) => {
    logger.warn({ err: error, organizationId: event.organizationId }, "Failed to publish mobile inbox event notification");
  });
}

export function onMobileInboxUpdate(listener: (event: MobileInboxUpdateEvent) => void) {
  emitter.on("inbox_update", listener);
  return () => {
    emitter.off("inbox_update", listener);
  };
}

export async function startMobileInboxEventListener() {
  if (listenerStarted) {
    return;
  }

  listenerStarted = true;

  const connect = async () => {
    const client = await pool.connect();
    let released = false;

    const release = () => {
      if (released) {
        return;
      }

      released = true;
      client.release();
    };

    client.on("notification", (message) => {
      if (message.channel !== channelName || !message.payload) {
        return;
      }

      try {
        const parsed = JSON.parse(message.payload) as {
          sourceId?: string;
          event?: MobileInboxUpdateEvent;
        };

        if (parsed.sourceId === sourceId || !parsed.event) {
          return;
        }

        emitter.emit("inbox_update", parsed.event);
      } catch (error) {
        logger.warn({ err: error }, "Failed to parse mobile inbox event notification");
      }
    });

    client.on("error", (error) => {
      logger.error({ err: error }, "Mobile inbox event listener database connection failed");
      release();
      listenerStarted = false;
      setTimeout(() => {
        void startMobileInboxEventListener();
      }, 5000);
    });

    await client.query(`listen ${channelName}`);
    logger.info({ channel: channelName }, "Mobile inbox event listener started");
  };

  try {
    await connect();
  } catch (error) {
    listenerStarted = false;
    logger.error({ err: error }, "Failed to start mobile inbox event listener");
    setTimeout(() => {
      void startMobileInboxEventListener();
    }, 5000);
  }
}
