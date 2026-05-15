export function WhatsAppTemplatePreview({ content }: { content: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background-tint p-4">
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="rounded-xl bg-primary/10 px-3 py-2 text-sm leading-6 text-text whitespace-pre-wrap">
          {content.trim() || "Your message preview will appear here."}
        </div>
      </div>
    </div>
  );
}
