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

export function detectMessageType(payload: any): string {
  if (!payload?.message) {
    return "unknown";
  }

  const [messageType] = Object.keys(payload.message);
  return messageType ?? "unknown";
}
