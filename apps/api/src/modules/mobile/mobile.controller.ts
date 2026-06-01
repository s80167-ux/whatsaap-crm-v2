import type { Request, Response } from "express";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";
import { onMobileInboxUpdate, type MobileInboxUpdateEvent } from "./mobileInboxEvents.bus.js";

const HEARTBEAT_INTERVAL_MS = 25_000;

function writeSse(response: Response, eventName: string, data: unknown) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function getMobileInboxEvents(request: Request, response: Response) {
  const auth = request.auth;

  if (!auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const organizationId = auth.organizationId;

  response.status(200);
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders?.();

  logger.info(
    {
      organizationId,
      organizationUserId: auth.organizationUserId,
      authUserId: auth.authUserId
    },
    "Mobile inbox SSE client connected"
  );

  const sendHeartbeat = () => {
    writeSse(response, "ping", {
      organizationId,
      timestamp: new Date().toISOString()
    });
    logger.debug({ organizationId }, "Mobile inbox SSE heartbeat sent");
  };

  const removeListener = onMobileInboxUpdate((event: MobileInboxUpdateEvent) => {
    if (event.organizationId !== organizationId) {
      return;
    }

    writeSse(response, "inbox_update", event);
    logger.info(
      {
        organizationId,
        conversationId: event.conversationId,
        type: event.type
      },
      "Mobile inbox SSE event sent"
    );
  });

  sendHeartbeat();
  const heartbeat = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  request.on("close", () => {
    clearInterval(heartbeat);
    removeListener();
    response.end();
    logger.info(
      {
        organizationId,
        organizationUserId: auth.organizationUserId,
        authUserId: auth.authUserId
      },
      "Mobile inbox SSE client disconnected"
    );
  });
}
