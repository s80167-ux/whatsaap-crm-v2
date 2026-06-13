export const MESSAGE_OUTBOUND_MEDIA_MAX_BYTES = 50 * 1024;
export const CAMPAIGN_INLINE_MEDIA_MIGRATION_THRESHOLD_BYTES = 100 * 1024;
export const CAMPAIGN_ROW_WARNING_THRESHOLD_BYTES = 500 * 1024;

export type MediaKind = "image" | "video" | "audio" | "document";

export type StoredMediaReference = {
  kind: MediaKind;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  mediaId?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  mediaUrl?: string | null;
  legacyInline?: boolean;
};

export type InlineMediaAttachment = StoredMediaReference & {
  dataBase64: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function estimateBase64Bytes(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) {
    return 0;
  }

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export function parseStoredMediaReference(value: unknown): StoredMediaReference | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const kind = asString(record.kind);
  const fileName = asString(record.fileName);
  const mimeType = asString(record.mimeType);
  const fileSizeBytes = asNumber(record.fileSizeBytes);

  if (!kind || !fileName || !mimeType || !fileSizeBytes) {
    return null;
  }

  if (!["image", "video", "audio", "document"].includes(kind)) {
    return null;
  }

  return {
    kind: kind as MediaKind,
    fileName,
    mimeType,
    fileSizeBytes,
    mediaId: asString(record.mediaId),
    storageBucket: asString(record.storageBucket),
    storagePath: asString(record.storagePath),
    mediaUrl: asString(record.mediaUrl),
    legacyInline: record.legacyInline === true
  };
}

export function parseInlineMediaAttachment(value: unknown): InlineMediaAttachment | null {
  const reference = parseStoredMediaReference(value);
  const record = asRecord(value);
  const dataBase64 = asString(record?.dataBase64);

  if (!reference || !dataBase64) {
    return null;
  }

  return {
    ...reference,
    dataBase64
  };
}

export function isInlineMediaAttachment(value: unknown): value is InlineMediaAttachment {
  return Boolean(parseInlineMediaAttachment(value));
}

export function sanitizeOutboundMediaReference(
  value: StoredMediaReference | InlineMediaAttachment | null | undefined,
  options?: {
    compacted?: boolean;
    originalInlineBytes?: number | null;
  }
) {
  if (!value) {
    return null;
  }

  const reference = parseStoredMediaReference(value);
  if (!reference) {
    return null;
  }

  return {
    kind: reference.kind,
    fileName: reference.fileName,
    mimeType: reference.mimeType,
    fileSizeBytes: reference.fileSizeBytes,
    ...(reference.mediaId ? { mediaId: reference.mediaId } : {}),
    ...(reference.storageBucket ? { storageBucket: reference.storageBucket } : {}),
    ...(reference.storagePath ? { storagePath: reference.storagePath } : {}),
    ...(reference.mediaUrl ? { mediaUrl: reference.mediaUrl } : {}),
    ...(reference.legacyInline ? { legacyInline: true } : {}),
    ...(options?.compacted ? { outboundMediaCompacted: true } : {}),
    ...(typeof options?.originalInlineBytes === "number" && options.originalInlineBytes > 0
      ? { outboundMediaOriginalSize: options.originalInlineBytes }
      : {})
  };
}

export function getOutboundMediaFromContentJson(contentJson: unknown) {
  const root = asRecord(contentJson);
  if (!root) {
    return null;
  }

  return parseStoredMediaReference(root.outboundMedia);
}
