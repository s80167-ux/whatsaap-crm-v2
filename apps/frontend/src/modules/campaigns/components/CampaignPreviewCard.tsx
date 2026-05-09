import { Card } from "../../../components/Card";

export function CampaignPreviewCard({ preview }: { preview: string }) {
  return (
    <Card className="bg-background-tint p-4" elevated={false}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">Preview</p>
      <div className="mt-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm leading-6 text-text shadow-soft">
        {preview || "Message preview will appear here."}
      </div>
    </Card>
  );
}
