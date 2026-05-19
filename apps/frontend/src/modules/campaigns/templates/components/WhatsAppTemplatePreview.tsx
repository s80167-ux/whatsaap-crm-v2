import { FileText, Image, Music, Paperclip, Video } from "lucide-react";
import type { TemplateAttachment, TemplateAttachmentKind } from "../types/template.types";

const attachmentIcons: Record<TemplateAttachmentKind, typeof Paperclip> = {
  image: Image,
  document: FileText,
  video: Video,
  audio: Music,
  file: Paperclip
};

export function WhatsAppTemplatePreview({ content, attachments = [] }: { content: string; attachments?: TemplateAttachment[] }) {
  return (
    <div className="rounded-2xl border border-border bg-background-tint p-4">
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-3 shadow-soft">
        {attachments.length > 0 ? (
          <div className="mb-2 space-y-2">
            {attachments.map((attachment) => (
              <AttachmentPreview key={attachment.id} attachment={attachment} />
            ))}
          </div>
        ) : null}
        <div className="rounded-xl bg-primary/10 px-3 py-2 text-sm leading-6 text-text whitespace-pre-wrap">
          {content.trim() || "Your message preview will appear here."}
        </div>
      </div>
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: TemplateAttachment }) {
  const Icon = attachmentIcons[attachment.kind] ?? Paperclip;

  if (attachment.kind === "image" && attachment.dataUrl) {
    return (
      <figure className="overflow-hidden rounded-xl border border-border bg-muted">
        <img src={attachment.dataUrl} alt={attachment.name} className="max-h-48 w-full object-cover" />
        <figcaption className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-text-muted">
          <Image size={14} />
          <span className="min-w-0 truncate">{attachment.name}</span>
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-text">
      <Icon size={16} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate font-semibold">{attachment.name}</span>
      <span className="shrink-0 text-text-muted">{formatFileSize(attachment.size)}</span>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
