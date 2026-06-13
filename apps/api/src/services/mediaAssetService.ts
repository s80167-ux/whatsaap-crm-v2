import crypto from "node:crypto";
import { query } from "../config/database.js";
import { logger } from "../config/logger.js";
import { createSupabaseAdminClient } from "../config/supabase.js";
import type { InlineMediaAttachment, StoredMediaReference } from "../lib/mediaAttachments.js";
import { estimateBase64Bytes, parseInlineMediaAttachment, parseStoredMediaReference } from "../lib/mediaAttachments.js";

type MediaAssetRecord = {
  id: string;
  organization_id: string;
  source: string | null;
  mime_type: string | null;
  file_name: string | null;
  file_size: string | number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  sha256: string | null;
};

const DEFAULT_MEDIA_BUCKET = "crm-media";
let ensureBucketPromise: Promise<void> | null = null;

export class MediaAssetService {
  constructor(private readonly bucketName = DEFAULT_MEDIA_BUCKET) {}

  async ensureStoredReference(input: {
    organizationId: string;
    source: string;
    attachment: InlineMediaAttachment | StoredMediaReference;
  }): Promise<StoredMediaReference> {
    const inline = parseInlineMediaAttachment(input.attachment);
    if (!inline) {
      const reference = parseStoredMediaReference(input.attachment);
      if (!reference) {
        throw new Error("Attachment reference is invalid");
      }
      return reference;
    }

    const buffer = Buffer.from(inline.dataBase64, "base64");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const existing = await this.findExistingAsset(input.organizationId, sha256, buffer.length);
    if (existing) {
      return this.toReference(existing, inline.kind, inline.fileName, inline.mimeType, buffer.length);
    }

    await this.ensureBucket();

    const storagePath = buildStoragePath(input.organizationId, input.source, inline.fileName, sha256);
    const supabase = createSupabaseAdminClient();
    const upload = await supabase.storage.from(this.bucketName).upload(storagePath, buffer, {
      contentType: inline.mimeType,
      upsert: false
    });

    if (upload.error && !String(upload.error.message ?? "").toLowerCase().includes("already exists")) {
      throw new Error(`Unable to upload media asset: ${upload.error.message}`);
    }

    const inserted = await query<MediaAssetRecord>(
      `
        insert into media_assets (
          organization_id,
          source,
          mime_type,
          file_name,
          file_size,
          storage_bucket,
          storage_path,
          sha256
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning *
      `,
      [
        input.organizationId,
        input.source,
        inline.mimeType,
        inline.fileName,
        buffer.length,
        this.bucketName,
        storagePath,
        sha256
      ]
    );

    return this.toReference(inserted.rows[0], inline.kind, inline.fileName, inline.mimeType, buffer.length);
  }

  async resolveAttachmentForDispatch(attachment: unknown) {
    const inline = parseInlineMediaAttachment(attachment);
    if (inline) {
      return {
        kind: inline.kind,
        fileName: inline.fileName,
        mimeType: inline.mimeType,
        dataBase64: inline.dataBase64
      };
    }

    const reference = parseStoredMediaReference(attachment);
    if (!reference) {
      return null;
    }

    const storageBucket = reference.storageBucket ?? this.bucketName;
    const storagePath = reference.storagePath;
    if (!storagePath) {
      return null;
    }

    const supabase = createSupabaseAdminClient();
    const download = await supabase.storage.from(storageBucket).download(storagePath);

    if (download.error) {
      throw new Error(`Unable to download stored media asset: ${download.error.message}`);
    }

    const buffer = Buffer.from(await download.data.arrayBuffer());
    return {
      kind: reference.kind,
      fileName: reference.fileName,
      mimeType: reference.mimeType,
      dataBase64: buffer.toString("base64")
    };
  }

  getInlineSizeBytes(attachment: unknown) {
    const inline = parseInlineMediaAttachment(attachment);
    if (!inline) {
      return 0;
    }

    return inline.fileSizeBytes || estimateBase64Bytes(inline.dataBase64);
  }

  private async findExistingAsset(organizationId: string, sha256: string, fileSizeBytes: number) {
    const result = await query<MediaAssetRecord>(
      `
        select *
        from media_assets
        where organization_id = $1
          and sha256 = $2
          and file_size = $3
          and storage_bucket is not null
          and storage_path is not null
        order by created_at desc
        limit 1
      `,
      [organizationId, sha256, fileSizeBytes]
    );

    return result.rows[0] ?? null;
  }

  private async ensureBucket() {
    if (!ensureBucketPromise) {
      ensureBucketPromise = (async () => {
        const supabase = createSupabaseAdminClient();
        const bucket = await supabase.storage.getBucket(this.bucketName);

        if (!bucket.data) {
          const created = await supabase.storage.createBucket(this.bucketName, {
            public: false,
            fileSizeLimit: "10MB"
          });

          if (created.error && !String(created.error.message ?? "").toLowerCase().includes("already exists")) {
            throw new Error(`Unable to create media bucket: ${created.error.message}`);
          }
        }
      })().catch((error) => {
        ensureBucketPromise = null;
        logger.error({ err: error, bucketName: this.bucketName }, "Unable to ensure Supabase media bucket");
        throw error;
      });
    }

    return ensureBucketPromise;
  }

  private toReference(
    row: MediaAssetRecord,
    kind: StoredMediaReference["kind"],
    fallbackFileName: string,
    fallbackMimeType: string,
    fallbackFileSizeBytes: number
  ): StoredMediaReference {
    return {
      kind,
      fileName: row.file_name ?? fallbackFileName,
      mimeType: row.mime_type ?? fallbackMimeType,
      fileSizeBytes: Number(row.file_size ?? fallbackFileSizeBytes),
      mediaId: row.id,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path
    };
  }
}

function buildStoragePath(organizationId: string, source: string, fileName: string, sha256: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return `organizations/${organizationId}/${source}/${sha256}-${safeName}`;
}
