import type { MessageTemplateStatus } from "../types/template.types";

const statusClassNames: Record<MessageTemplateStatus, string> = {
  Active: "border-primary/20 bg-primary/5 text-primary",
  Draft: "border-border bg-muted text-text-muted",
  Archived: "border-border bg-background-tint text-text-soft"
};

export function TemplateStatusBadge({ status }: { status: MessageTemplateStatus }) {
  return (
    <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${statusClassNames[status]}`}>
      {status}
    </span>
  );
}
