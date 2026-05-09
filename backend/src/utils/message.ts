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

export function detectMessageType(payload: any): string {
  const message = unwrapMessage(payload?.message);

  if (!message) {
    return "unknown";
  }

  const [messageType] = Object.keys(message);
  return messageType ?? "unknown";
}
