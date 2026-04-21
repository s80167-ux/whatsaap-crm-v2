import type { Message } from "../types/api";

type RawMessageNode = Record<string, unknown>;

export interface MessagePresentation {
  label: string | null;
  title: string;
  caption: string | null;
  details: string[];
  isMedia: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function getRawMessageNode(contentJson: unknown): RawMessageNode | null {
  const root = asRecord(contentJson);
  if (!root) {
    return null;
  }

  const message = asRecord(root.message);
  if (message) {
    return message;
  }

  const rawPayload = asRecord(root.rawPayload);
  const rawMessage = rawPayload ? asRecord(rawPayload.message) : null;
  if (rawMessage) {
    return rawMessage;
  }

  return null;
}

function getOutboundMediaNode(contentJson: unknown) {
  const root = asRecord(contentJson);
  if (!root) {
    return null;
  }

  return asRecord(root.outboundMedia);
}

function getNodeByKey(node: RawMessageNode | null, key: string) {
  return node ? asRecord(node[key]) : null;
}

function buildFallbackPresentation(message: Message): MessagePresentation {
  const label = message.message_type !== "text" ? message.message_type.toUpperCase() : null;
  return {
    label,
    title: message.content_text ?? (message.message_type === "text" ? "Message" : `${message.message_type} message`),
    caption: message.content_text,
    details: [],
    isMedia: message.message_type !== "text"
  };
}

export function getMessagePresentation(message: Message): MessagePresentation {
  const rawMessage = getRawMessageNode(message.content_json);
  const outboundMedia = getOutboundMediaNode(message.content_json);

  switch (message.message_type) {
    case "text":
      return {
        label: null,
        title: message.content_text ?? "Message",
        caption: null,
        details: [],
        isMedia: false
      };
    case "image": {
      const node = getNodeByKey(rawMessage, "imageMessage");
      return {
        label: "Image",
        title: message.content_text ?? asString(outboundMedia?.fileName) ?? "Photo received",
        caption: message.content_text,
        details: [
          asString(node?.mimetype) ?? asString(outboundMedia?.mimeType),
          formatFileSize(asNumber(node?.fileLength) ?? asNumber(outboundMedia?.fileSizeBytes))
        ].filter(Boolean) as string[],
        isMedia: true
      };
    }
    case "video": {
      const node = getNodeByKey(rawMessage, "videoMessage");
      const seconds = asNumber(node?.seconds);
      return {
        label: "Video",
        title: message.content_text ?? asString(outboundMedia?.fileName) ?? "Video received",
        caption: message.content_text,
        details: [
          asString(node?.mimetype) ?? asString(outboundMedia?.mimeType),
          formatFileSize(asNumber(node?.fileLength) ?? asNumber(outboundMedia?.fileSizeBytes)),
          seconds ? `${Math.round(seconds)} sec` : null
        ].filter(Boolean) as string[],
        isMedia: true
      };
    }
    case "audio": {
      const node = getNodeByKey(rawMessage, "audioMessage") ?? getNodeByKey(rawMessage, "pttMessage");
      const seconds = asNumber(node?.seconds);
      return {
        label: "Audio",
        title: asString(outboundMedia?.fileName) ?? "Audio message",
        caption: message.content_text,
        details: [
          asString(node?.mimetype) ?? asString(outboundMedia?.mimeType),
          formatFileSize(asNumber(node?.fileLength) ?? asNumber(outboundMedia?.fileSizeBytes)),
          seconds ? `${Math.round(seconds)} sec` : null
        ].filter(Boolean) as string[],
        isMedia: true
      };
    }
    case "document": {
      const node = getNodeByKey(rawMessage, "documentMessage");
      return {
        label: "Document",
        title: asString(node?.fileName) ?? asString(outboundMedia?.fileName) ?? "Document received",
        caption: message.content_text,
        details: [
          asString(node?.mimetype) ?? asString(outboundMedia?.mimeType),
          formatFileSize(asNumber(node?.fileLength) ?? asNumber(outboundMedia?.fileSizeBytes))
        ].filter(Boolean) as string[],
        isMedia: true
      };
    }
    case "sticker":
      return {
        label: "Sticker",
        title: "Sticker",
        caption: message.content_text,
        details: [],
        isMedia: true
      };
    case "location": {
      const node = getNodeByKey(rawMessage, "locationMessage");
      const latitude = asNumber(node?.degreesLatitude);
      const longitude = asNumber(node?.degreesLongitude);
      return {
        label: "Location",
        title: asString(node?.name) ?? "Shared location",
        caption: asString(node?.address),
        details: [
          latitude !== null && longitude !== null ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : null
        ].filter(Boolean) as string[],
        isMedia: true
      };
    }
    case "contact": {
      const node = getNodeByKey(rawMessage, "contactMessage");
      const contactsArray = rawMessage ? (rawMessage.contactsArrayMessage as { contacts?: Array<Record<string, unknown>> } | undefined) : undefined;
      const firstContact = contactsArray?.contacts?.[0] ?? null;
      return {
        label: "Contact",
        title: asString(node?.displayName) ?? asString(firstContact?.displayName) ?? "Shared contact",
        caption: null,
        details: [asString(node?.vcard), asString(firstContact?.vcard)].filter(Boolean).slice(0, 1) as string[],
        isMedia: true
      };
    }
    case "reaction": {
      const node = getNodeByKey(rawMessage, "reactionMessage");
      return {
        label: "Reaction",
        title: asString(node?.text) ?? "Reaction",
        caption: null,
        details: [],
        isMedia: true
      };
    }
    default:
      return buildFallbackPresentation(message);
  }
}

export function getConversationPreview(preview: string | null, messageType?: string | null) {
  if (preview && preview.trim().length > 0) {
    return preview;
  }

  switch (messageType) {
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "document":
      return "Document";
    case "sticker":
      return "Sticker";
    case "location":
      return "Location";
    case "contact":
      return "Contact";
    case "reaction":
      return "Reaction";
    case "system":
      return "System update";
    default:
      return "No messages yet";
  }
}
