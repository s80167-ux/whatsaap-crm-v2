import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { Input, Select } from "../../../components/Input";
import { renderCampaignTemplate } from "../utils/campaignTemplate";
import { CampaignPreviewCard } from "./CampaignPreviewCard";
import type { AudienceSource, CampaignContact } from "../types/campaign.types";

const sampleContact: CampaignContact = {
  name: "Ahmad",
  phone: "+60123456789",
  tag: "VIP",
  gender: "male"
};

const defaultTemplate = "Salam {{salutation}} {{name}}, kami ada promosi khas untuk anda.";

export function CreateCampaignDrawer({
  open,
  onClose,
  onPlaceholderAction
}: {
  open: boolean;
  onClose: () => void;
  onPlaceholderAction: (message: string) => void;
}) {
  const [campaignName, setCampaignName] = useState("");
  const [audienceSource, setAudienceSource] = useState<AudienceSource>("Existing CRM Contacts");
  const [messageTemplate, setMessageTemplate] = useState(defaultTemplate);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const preview = useMemo(() => renderCampaignTemplate(messageTemplate, sampleContact), [messageTemplate]);

  if (!open) {
    return null;
  }

  function handleAction(action: string) {
    onPlaceholderAction(`${action} is placeholder-only in this phase. No WhatsApp messages were sent.`);
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/45">
      <button type="button" className="absolute inset-0" aria-label="Close campaign drawer" onClick={onClose} />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-border bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Campaigns</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-text">Create Campaign</h3>
          </div>
          <Button size="icon" variant="ghost" aria-label="Close campaign drawer" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <label className="block">
            <span className="workspace-label">Campaign Name</span>
            <Input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="May promo campaign" />
          </label>

          <label className="block">
            <span className="workspace-label">Audience Source</span>
            <Select value={audienceSource} onChange={(event) => setAudienceSource(event.target.value as AudienceSource)}>
              <option value="Upload CSV">Upload CSV</option>
              <option value="Existing CRM Contacts">Existing CRM Contacts</option>
            </Select>
          </label>

          <label className="block">
            <span className="workspace-label">Message Template</span>
            <textarea
              value={messageTemplate}
              onChange={(event) => setMessageTemplate(event.target.value)}
              className="input-base min-h-36 w-full resize-y"
              placeholder={defaultTemplate}
            />
          </label>

          <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Dynamic variables</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-text-muted">
              <span>{"{{name}}"}</span>
              <span>{"{{phone}}"}</span>
              <span>{"{{salutation}}"}</span>
              <span>{"{{tag}}"}</span>
            </div>
          </div>

          <label className="block">
            <span className="workspace-label">Test Phone Number</span>
            <Input value={testPhoneNumber} onChange={(event) => setTestPhoneNumber(event.target.value)} placeholder="+60123456789" />
          </label>

          <CampaignPreviewCard preview={preview} />

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Campaigns should only be sent to customers who have given permission to receive messages. Always provide a clear way for customers to opt out.
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => handleAction("Save Draft")}>Save Draft</Button>
            <Button variant="secondary" onClick={() => handleAction("Send Test")}>Send Test</Button>
            <Button variant="secondary" onClick={() => handleAction("Schedule Later")}>Schedule Later</Button>
            <Button onClick={() => handleAction("Start Campaign")}>Start Campaign</Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
