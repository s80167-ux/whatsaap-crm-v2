type MessageNode = Record<string, any>;

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
