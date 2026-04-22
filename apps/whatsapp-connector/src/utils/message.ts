export function extractTextContent(payload: any): string | null {
  if (!payload?.message) {
    return null;
  }

  const message = payload.message;

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
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
  if (!payload?.message) {
    return "system";
  }

  const message = payload.message;
  const matchedType = MESSAGE_TYPE_PRIORITY.find((messageType) => Boolean(message?.[messageType]));

  if (matchedType) {
    return normalizeMessageType(matchedType);
  }

  const [messageType] = Object.keys(message);
  return normalizeMessageType(messageType);
}
