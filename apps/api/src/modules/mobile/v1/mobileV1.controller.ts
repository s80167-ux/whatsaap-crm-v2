import type { Request, Response } from "express";
import { z } from "zod";
import type { ContactRecord } from "../../../types/domain.js";
import { logger } from "../../../config/logger.js";
import { getRequestAuditContext } from "../../../lib/requestAudit.js";
import { AppError } from "../../../lib/errors.js";
import { AuditLogService } from "../../../services/auditLogService.js";
import { AuthService } from "../../../services/authService.js";
import { LeadService } from "../../../services/leadService.js";
import { QueryService, type ActivityRangeFilter } from "../../../services/queryService.js";
import { SendMessageService } from "../../../services/sendMessageService.js";
import { onMobileInboxUpdate, type MobileInboxUpdateEvent } from "../mobileInboxEvents.bus.js";
import {
  toMobileContactDto,
  toMobileConversationDto,
  toMobileLeadDto,
  toMobileMeDto,
  toMobileMessageDto
} from "./mobileV1.dto.js";

const authService = new AuthService();
const queryService = new QueryService();
const leadService = new LeadService();
const sendMessageService = new SendMessageService();
const auditLogService = new AuditLogService();
const HEARTBEAT_INTERVAL_MS = 25_000;

const contactParamsSchema = z.object({
  contactId: z.string().uuid()
});

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const historyRangeQuerySchema = z
  .object({
    days: z.coerce.number().int().positive().max(365).optional(),
    months: z.coerce.number().int().positive().max(24).optional()
  })
  .refine((input) => !(input.days && input.months), {
    message: "Choose either days or months, not both"
  });

const messagePaginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).optional(),
    before_sent_at: z.string().datetime({ offset: true }).optional(),
    before_id: z.string().uuid().optional()
  })
  .refine((input) => Boolean(input.before_sent_at) === Boolean(input.before_id), {
    message: "before_sent_at and before_id must be provided together"
  });

const attachmentSchema = z.object({
  kind: z.enum(["image", "video", "audio", "document"]),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  dataBase64: z.string().min(1),
  fileSizeBytes: z.number().int().positive().max(4 * 1024 * 1024)
});

const sendSchema = z
  .object({
    whatsappAccountId: z.string().uuid(),
    conversationId: z.string().uuid(),
    quickReplyTemplateId: z.string().uuid().optional().nullable(),
    replyToMessageId: z.string().uuid().optional().nullable(),
    organizationId: z.string().uuid().optional().nullable(),
    organization_id: z.string().uuid().optional().nullable(),
    text: z.string().trim().max(4000).optional(),
    attachment: attachmentSchema.optional().nullable()
  })
  .refine((input) => Boolean(input.text?.trim()) || Boolean(input.attachment), {
    message: "Message text or one attachment is required",
    path: ["text"]
  });

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function resolveReadOrganizationId(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId =
    request.auth?.role === "super_admin"
      ? organization_id ?? request.auth.organizationId ?? ""
      : request.auth?.organizationId ?? organization_id ?? "";

  if (!organizationId && request.auth?.role === "super_admin") {
    return null;
  }

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return organizationId;
}

function resolveActivityRange(request: Request): ActivityRangeFilter | undefined {
  const { days, months } = historyRangeQuerySchema.parse(request.query);

  if (!days && !months) {
    return undefined;
  }

  const since = new Date();
  if (days) {
    since.setUTCDate(since.getUTCDate() - days);
  } else if (months) {
    since.setUTCMonth(since.getUTCMonth() - months);
  }

  return { since: since.toISOString() };
}

function isMergedContact(contact: ContactRecord | { is_merged: boolean }): contact is { is_merged: boolean } {
  return "is_merged" in contact && contact.is_merged;
}

function writeSse(response: Response, eventName: string, data: unknown) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function buildRefetchEvent(event: MobileInboxUpdateEvent | null, organizationId: string) {
  return {
    type: "refetch_required",
    conversationId: event?.conversationId ?? null,
    organizationId,
    timestamp: new Date().toISOString(),
    shouldRefetch: true,
    conversationPatch: null,
    messagePatch: null
  };
}

async function buildMobileV1InboxEvent(auth: NonNullable<Request["auth"]>, event: MobileInboxUpdateEvent) {
  const conversations = await queryService.listConversations(auth, event.organizationId, {
    channel: "all"
  });
  const conversation = conversations.find((item) => item.id === event.conversationId);

  if (!conversation) {
    return buildRefetchEvent(event, event.organizationId);
  }

  const messages = event.type.startsWith("message_")
    ? await queryService.listMessages(auth, event.organizationId, event.conversationId)
    : [];
  const latestMessage = messages.at(-1) ?? null;

  return {
    type: event.type,
    conversationId: event.conversationId,
    organizationId: event.organizationId,
    timestamp: event.timestamp,
    shouldRefetch: false,
    conversationPatch: toMobileConversationDto(conversation),
    messagePatch: latestMessage ? toMobileMessageDto(latestMessage) : null
  };
}

export async function getMobileV1Me(request: Request, response: Response) {
  const auth = requireAuth(request);
  const profile = await authService.getProfile(auth);
  return response.json({ data: toMobileMeDto(profile) });
}

export function getMobileV1InboxEvents(request: Request, response: Response) {
  const auth = requireAuth(request);

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
    "Mobile v1 inbox SSE client connected"
  );

  const sendHeartbeat = () => {
    writeSse(response, "ping", {
      organizationId,
      timestamp: new Date().toISOString()
    });
  };

  const removeListener = onMobileInboxUpdate((event: MobileInboxUpdateEvent) => {
    if (event.organizationId !== organizationId) {
      return;
    }

    void buildMobileV1InboxEvent(auth, event)
      .then((payload) => {
        writeSse(response, "inbox_update", payload);
      })
      .catch((error) => {
        logger.warn(
          { err: error, organizationId, conversationId: event.conversationId },
          "Failed to build mobile v1 inbox SSE patch"
        );
        writeSse(response, "inbox_update", buildRefetchEvent(event, organizationId));
      });
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
      "Mobile v1 inbox SSE client disconnected"
    );
  });
}

export async function getMobileV1Inbox(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const conversations = await queryService.listConversations(auth, organizationId, {
    activityRange: resolveActivityRange(request),
    channel: "all"
  });

  return response.json({ data: conversations.map(toMobileConversationDto) });
}

export async function getMobileV1InboxMessages(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const { conversationId } = conversationParamsSchema.parse(request.params);
  const { limit, before_sent_at, before_id } = messagePaginationQuerySchema.parse(request.query);
  const activityRange = resolveActivityRange(request);

  if (limit) {
    const page = await queryService.listMessagesPage(auth, organizationId, conversationId, {
      activityRange,
      limit,
      before:
        before_sent_at && before_id
          ? {
              sentAt: before_sent_at,
              id: before_id
            }
          : null
    });

    return response.json({
      data: page.messages.map(toMobileMessageDto),
      pagination: page.pagination
    });
  }

  const messages = await queryService.listMessages(auth, organizationId, conversationId, activityRange);
  return response.json({ data: messages.map(toMobileMessageDto) });
}

export async function getMobileV1Contacts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const contacts = await queryService.listContacts(auth, organizationId, resolveActivityRange(request));
  return response.json({ data: contacts.map(toMobileContactDto) });
}

export async function getMobileV1Contact(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const { contactId } = contactParamsSchema.parse(request.params);
  const contact = await queryService.getContact(auth, organizationId, contactId);

  if (!contact) {
    throw new AppError("Contact not found", 404, "contact_not_found");
  }

  if (isMergedContact(contact)) {
    throw new AppError("Contact has been merged", 409, "contact_merged");
  }

  return response.json({ data: toMobileContactDto(contact) });
}

export async function getMobileV1Leads(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const leads = await leadService.list(auth, organizationId);
  return response.json({ data: leads.map(toMobileLeadDto) });
}

export async function sendMobileV1Message(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = sendSchema.parse(request.body);
  const organizationId = auth.organizationId ?? input.organizationId ?? input.organization_id ?? "";

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const message = await sendMessageService.send({
    whatsappAccountId: input.whatsappAccountId,
    conversationId: input.conversationId,
    quickReplyTemplateId: input.quickReplyTemplateId,
    replyToMessageId: input.replyToMessageId,
    text: input.text,
    attachment: input.attachment,
    authUser: auth,
    organizationId,
    organizationUserId: auth.organizationUserId ?? null
  });

  await auditLogService.record(auth, {
    organizationId,
    action: "message.sent",
    entityType: "message",
    entityId: message.id,
    metadata: {
      conversation_id: input.conversationId,
      whatsapp_account_id: input.whatsappAccountId,
      quick_reply_template_id: input.quickReplyTemplateId ?? null,
      reply_to_message_id: input.replyToMessageId ?? null,
      external_message_id: message.external_message_id,
      message_type: input.attachment?.kind ?? "text",
      attachment_file_name: input.attachment?.fileName ?? null,
      mobile_api_version: "v1"
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: toMobileMessageDto(message) });
}
