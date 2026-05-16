import { Card } from "../../../components/Card";

type CampaignPreviewCardProps = {
  preview: string;
  senderLabel?: string | null;
  audienceLabel?: string | null;
  validRecipients?: number | null;
  tempoLabel?: string | null;
};

export function CampaignPreviewCard({
  preview,
  senderLabel,
  audienceLabel,
  validRecipients,
  tempoLabel
}: CampaignPreviewCardProps) {
  return (
    <Card className="bg-background-tint p-4" elevated={false}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">Preview</p>
      <div className="mt-3 grid gap-2 text-xs text-text-muted sm:grid-cols-2">
        <PreviewMeta label="Sender" value={senderLabel ?? "Not selected"} />
        <PreviewMeta
          label="Audience Group"
          value={audienceLabel ? `${audienceLabel} - ${validRecipients ?? 0} valid contacts` : "Not selected"}
        />
        <PreviewMeta label="Valid recipients" value={String(validRecipients ?? 0)} />
        <PreviewMeta label="Estimated tempo" value={tempoLabel ?? "Safe mode, 12s/message, 20 per batch, 2 min pause"} />
      </div>
      <div className="mt-3 rounded-2xl border border-success/20 bg-card px-4 py-3 text-sm leading-6 text-card-foreground shadow-soft">
        {preview || "Message preview will appear here."}
      </div>
    </Card>
  );
}

function PreviewMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card px-3 py-2">
      <p className="font-semibold text-text-soft">{label}</p>
      <p className="mt-1 text-text-muted">{value}</p>
    </div>
  );
}
