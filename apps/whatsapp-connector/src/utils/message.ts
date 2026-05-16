type MessageNode = Record<string, any>;

export type InboundMediaAttachment = {
  kind: "image" | "video" | "audio" | "document";
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
};

function unwrapMessage(message: MessageNode | null | undefined, depth = 0): MessageNode | null {
  if (!message || depth > 8) {
    return null;
  }

  const wrapped =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.documentWithCaptionMessage?.message ||
    message.editedMessage?.message ||
    message.protocolMessage?.editedMessage?.message;

  return wrapped ? unwrapMessage(wrapped, depth + 1) : message;
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
}

export function extractTextContent(payload: any): string | null {
  const message = unwrapMessage(payload?.message);

  if (!message) {
    return null;
  }

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    message.reactionMessage?.text ||
    null
  );
}

const MESSAGE_TYPE_PRIORITY = [
  "conversation",
  "extendedTextMessage",
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "pttMessage",
  "documentMessage",
  "stickerMessage",
  "locationMessage",
  "contactMessage",
  "contactsArrayMessage",
  "reactionMessage",
  "protocolMessage"
] as const;

export function normalizeMessageType(messageType: string | null | undefined): string {
  switch (messageType) {
    case "conversation":
    case "extendedTextMessage":
      return "text";
    case "imageMessage":
      return "image";
    case "videoMessage":
      return "video";
    case "audioMessage":
    case "pttMessage":
      return "audio";
    case "documentMessage":
      return "document";
    case "stickerMessage":
      return "sticker";
    case "locationMessage":
      return "location";
    case "contactMessage":
    case "contactsArrayMessage":
      return "contact";
    case "reactionMessage":
      return "reaction";
    case "protocolMessage":
    case "unknown":
    case null:
    case undefined:
      return "system";
    default:
      return "system";
  }
}

export function detectMessageType(payload: any): string {
  const message = unwrapMessage(payload?.message);

  if (!message) {
    return "system";
  }

  const matchedType = MESSAGE_TYPE_PRIORITY.find((messageType) => Boolean(message?.[messageType]));

  if (matchedType) {
    return normalizeMessageType(matchedType);
  }

  const [messageType] = Object.keys(message);
  return normalizeMessageType(messageType);
}

export function extractInboundMediaAttachment(payload: any): InboundMediaAttachment | null {
  const message = unwrapMessage(payload?.message);

  if (!message) {
    return null;
  }

  const image = message.imageMessage;
  if (image) {
    return {
      kind: "image",
      fileName: image.fileName || image.caption || "image",
      mimeType: image.mimetype || "image/jpeg",
      fileSizeBytes: asPositiveNumber(image.fileLength) ?? 0
    };
  }

  const video = message.videoMessage;
  if (video) {
    return {
      kind: "video",
      fileName: video.fileName || video.caption || "video",
      mimeType: video.mimetype || "video/mp4",
      fileSizeBytes: asPositiveNumber(video.fileLength) ?? 0
    };
  }

  const audio = message.audioMessage || message.pttMessage;
  if (audio) {
    return {
      kind: "audio",
      fileName: audio.fileName || "audio",
      mimeType: audio.mimetype || "audio/ogg",
      fileSizeBytes: asPositiveNumber(audio.fileLength) ?? 0
    };
  }

  const document = message.documentMessage;
  if (document) {
    return {
      kind: "document",
      fileName: document.fileName || document.caption || "document",
      mimeType: document.mimetype || "application/octet-stream",
      fileSizeBytes: asPositiveNumber(document.fileLength) ?? 0
    };
  }

  return null;
}
