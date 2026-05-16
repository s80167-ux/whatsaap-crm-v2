import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { AiMessageAssist } from "../../../components/ai/AiMessageAssist";
import { Button } from "../../../components/Button";
import { Input, Select } from "../../../components/Input";
import { PopupOverlay } from "../../../components/PopupOverlay";
import type { WhatsAppAccountSummary } from "../../../types/admin";
import type { AudienceGroup } from "../audience-groups/types/audienceGroup.types";
import { fetchAudienceGroupContacts } from "../audience-groups/services/audienceGroupService";
import { createCampaign, sendCampaignTest, startCampaign } from "../services/campaignService";
import { renderCampaignTemplate } from "../utils/campaignTemplate";
import { CampaignPreviewCard } from "./CampaignPreviewCard";
import type { CampaignContact, CampaignSpeedPreset, CampaignTempo } from "../types/campaign.types";

const fallbackSampleContact: CampaignContact = {
  name: "Ahmad",
  phone: "60123456789",
  tag: "VIP",
  gender: "male"
};

const defaultTemplate = "Salam {{salutation}} {{name}}, kami ada promosi khas untuk anda.";

const tempoPresets: Record<CampaignSpeedPreset, CampaignTempo> = {
  safe: {
    speedPreset: "safe",
    delayPerMessageSeconds: 12,
    batchSize: 20,
    batchPauseSeconds: 120,
    dailyLimit: 300,
    stopOnHighFailure: true
  },
  normal: {
    speedPreset: "normal",
    delayPerMessageSeconds: 7,
    batchSize: 30,
    batchPauseSeconds: 60,
    dailyLimit: 500,
    stopOnHighFailure: true
  },
  custom: {
    speedPreset: "custom",
    delayPerMessageSeconds: 12,
    batchSize: 20,
    batchPauseSeconds: 120,
    dailyLimit: 300,
    stopOnHighFailure: true
  }
};

const connectedStatuses = new Set(["connected", "open", "ready"]);

export function CreateCampaignDrawer({
  open,
  onClose,
  onPlaceholderAction,
  whatsappAccounts,
  audienceGroups,
  organizationId,
  onCampaignChanged
}: {
  open: boolean;
  onClose: () => void;
  onPlaceholderAction: (message: string, variant?: "success" | "error") => void;
  whatsappAccounts: WhatsAppAccountSummary[];
  audienceGroups: AudienceGroup[];
  organizationId?: string | null;
  onCampaignChanged?: () => void;
}) {
  const [campaignName, setCampaignName] = useState("");
  const [senderWhatsAppAccountId, setSenderWhatsAppAccountId] = useState("");
  const [audienceGroupId, setAudienceGroupId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(defaultTemplate);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [tempo, setTempo] = useState<CampaignTempo>(tempoPresets.safe);
  const [sampleContact, setSampleContact] = useState<CampaignContact>(fallbackSampleContact);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isStartingCampaign, setIsStartingCampaign] = useState(false);

  const connectedAccounts = useMemo(
    () => whatsappAccounts.filter((account) => connectedStatuses.has(account.status.toLowerCase())),
    [whatsappAccounts]
  );

  const readyAudienceGroups = useMemo(
    () => audienceGroups.filter((group) => group.status === "imported" && group.valid_count > 0),
    [audienceGroups]
  );

  const selectedSender = connectedAccounts.find((account) => account.id === senderWhatsAppAccountId) ?? null;
  const selectedAudienceGroup = readyAudienceGroups.find((group) => group.id === audienceGroupId) ?? null;
  const preview = useMemo(() => renderCampaignTemplate(messageTemplate, sampleContact), [messageTemplate, sampleContact]);
  const senderLabel = selectedSender ? formatSenderLabel(selectedSender) : null;
  const tempoLabel = formatTempoLabel(tempo);

  if (!open) {
    return null;
  }

  function showError(message: string) {
    onPlaceholderAction(message, "error");
  }

  function validateSender() {
    if (!senderWhatsAppAccountId || !selectedSender) {
      showError("Select a Sender WhatsApp Number first.");
      return false;
    }

    return true;
  }

  function validateAudience() {
    if (!selectedAudienceGroup) {
      showError("Select an Audience Group with valid contacts first.");
      return false;
    }

    if (selectedAudienceGroup.valid_count <= 0) {
      showError("Audience Group must have at least one valid contact.");
      return false;
    }

    return true;
  }

  function validateTemplate() {
    if (!messageTemplate.trim()) {
      showError("Message Template is required.");
      return false;
    }

    return true;
  }

  async function handleAudienceGroupChange(nextAudienceGroupId: string) {
    setAudienceGroupId(nextAudienceGroupId);

    if (!nextAudienceGroupId) {
      setSampleContact(fallbackSampleContact);
      return;
    }

    try {
      const contacts = await fetchAudienceGroupContacts(nextAudienceGroupId, organizationId);
      const sample = contacts.find((contact) => contact.validation_status === "valid" && contact.phone_normalized);
      setSampleContact(
        sample
          ? {
              name: sample.name ?? "Ahmad",
              phone: sample.phone_normalized ?? "60123456789",
              gender: sample.gender,
              tag: sample.tag
            }
          : fallbackSampleContact
      );
    } catch {
      setSampleContact(fallbackSampleContact);
    }
  }

  function handleTempoPresetChange(speedPreset: CampaignSpeedPreset) {
    setTempo(speedPreset === "custom" ? { ...tempo, speedPreset: "custom" } : tempoPresets[speedPreset]);
  }

  function handleTempoNumberChange(field: keyof Omit<CampaignTempo, "speedPreset" | "stopOnHighFailure">, value: string) {
    setTempo((current) => ({
      ...current,
      speedPreset: "custom",
      [field]: Math.max(1, Number(value) || 1)
    }));
  }

  function validateCampaignName() {
    if (!campaignName.trim()) {
      showError("Campaign Name is required.");
      return false;
    }

    return true;
  }

  async function handleSaveDraft() {
    if (!validateCampaignName() || !validateSender() || !validateAudience() || !validateTemplate()) {
      return;
    }

    setIsSavingDraft(true);

    try {
      const campaign = await createCampaign({
        organizationId,
        name: campaignName.trim(),
        senderWhatsAppAccountId,
        audienceGroupId,
        messageTemplate,
        tempo
      });
      onPlaceholderAction(`Campaign draft "${campaign.name}" saved.`, "success");
      onCampaignChanged?.();
      onClose();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save campaign draft.");
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handleSendTest() {
    if (!validateSender() || !validateTemplate()) {
      return;
    }

    if (!testPhoneNumber.trim()) {
      showError("Test Phone Number is required.");
      return;
    }

    setIsSendingTest(true);

    try {
      const result = await sendCampaignTest({
        organizationId,
        senderWhatsAppAccountId,
        testPhoneNumber: testPhoneNumber.trim(),
        messageTemplate: preview
      });
      onPlaceholderAction(result.message || `Test message queued from ${senderLabel} to ${testPhoneNumber.trim()}.`, "success");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to send test message.");
    } finally {
      setIsSendingTest(false);
    }
  }

  async function handleStartCampaign(action: "Schedule Later" | "Start Campaign") {
    if (!validateCampaignName() || !validateSender() || !validateAudience() || !validateTemplate()) {
      return;
    }

    setIsStartingCampaign(true);

    try {
      const campaign = await createCampaign({
        organizationId,
        name: campaignName.trim(),
        senderWhatsAppAccountId,
        audienceGroupId,
        messageTemplate,
        tempo
      });

      if (action === "Schedule Later") {
        onPlaceholderAction(`Campaign "${campaign.name}" saved for scheduling.`, "success");
        onCampaignChanged?.();
        onClose();
        return;
      }

      const result = await startCampaign({
        campaignId: campaign.id,
        organizationId,
        senderWhatsAppAccountId,
        audienceGroupId,
        messageTemplate,
        speedPreset: tempo.speedPreset
      });
      onPlaceholderAction(result.message, "success");
      onCampaignChanged?.();
      onClose();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to start campaign.");
    } finally {
      setIsStartingCampaign(false);
    }
  }

  const actionDisabled = !selectedSender;
  const startDisabled = actionDisabled || !selectedAudienceGroup || isSavingDraft || isStartingCampaign;

  return (
    <PopupOverlay
      open={open}
      onClose={onClose}
      title="Create Campaign"
      description="Set sender, audience, message template and sending tempo before launching the campaign."
      panelClassName="max-w-6xl"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-border bg-white p-5 shadow-soft">
            <div className="mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Campaign setup</p>
                <p className="mt-1 text-sm text-text-muted">Choose the sender and target audience before writing the message.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="workspace-label">Campaign Name</span>
                <Input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="May promo campaign" />
              </label>

              <label className="block">
                <span className="workspace-label">Sender WhatsApp Number</span>
                <Select value={senderWhatsAppAccountId} onChange={(event) => setSenderWhatsAppAccountId(event.target.value)}>
                  <option value="">Select connected sender</option>
                  {connectedAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {formatSenderLabel(account)}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block">
                <span className="workspace-label">Audience Group</span>
                <Select value={audienceGroupId} onChange={(event) => void handleAudienceGroupChange(event.target.value)}>
                  <option value="">Select Audience Group</option>
                  {readyAudienceGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} - {group.valid_count} valid contacts
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            {connectedAccounts.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                No connected WhatsApp number available. Please connect a WhatsApp account before starting a campaign.
              </div>
            ) : null}

            {selectedAudienceGroup?.invalid_count || selectedAudienceGroup?.duplicate_count ? (
              <p className="mt-4 text-xs text-text-muted">
                {selectedAudienceGroup.invalid_count} invalid skipped, {selectedAudienceGroup.duplicate_count} duplicates skipped
              </p>
            ) : null}

            {readyAudienceGroups.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-background-tint px-4 py-4">
                <p className="text-sm font-semibold text-text">No Audience Groups yet.</p>
                <p className="mt-1 text-sm text-text-muted">Create an Audience Group before starting a campaign.</p>
                <Link className="mt-3 inline-flex text-sm font-semibold text-primary hover:text-primary-dark" to="/campaigns/whatsapp/audience">
                  Create Audience Group
                </Link>
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-border bg-white p-5 shadow-soft">
            <div className="mb-4">
              <p className="text-sm font-semibold text-text">Message Template</p>
              <p className="mt-1 text-sm text-text-muted">Use variables to personalise the message automatically for each contact.</p>
            </div>

            <label className="block">
              <span className="workspace-label">Template Content</span>
              <textarea
                value={messageTemplate}
                onChange={(event) => setMessageTemplate(event.target.value)}
                className="input-base min-h-44 w-full resize-y"
                placeholder={defaultTemplate}
              />
            </label>
            <AiMessageAssist
              value={messageTemplate}
              onChange={setMessageTemplate}
              source="campaign"
              organizationId={organizationId}
              variables={["first_name", "name", "business_name", "phone", "salutation", "tag"]}
              campaignObjective={campaignName}
            />

            <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Dynamic variables</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-text-muted">
                <span className="rounded-full border border-primary/10 bg-white px-3 py-1">{"{{name}}"}</span>
                <span className="rounded-full border border-primary/10 bg-white px-3 py-1">{"{{phone}}"}</span>
                <span className="rounded-full border border-primary/10 bg-white px-3 py-1">{"{{salutation}}"}</span>
                <span className="rounded-full border border-primary/10 bg-white px-3 py-1">{"{{tag}}"}</span>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-background-tint p-5">
            <div>
              <p className="text-sm font-semibold text-text">Sending Tempo</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Use a slower tempo for new or recently reconnected WhatsApp numbers to reduce delivery risk.
              </p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {(["safe", "normal", "custom"] as CampaignSpeedPreset[]).map((preset) => (
                <Button
                  key={preset}
                  variant={tempo.speedPreset === preset ? "primary" : "secondary"}
                  onClick={() => handleTempoPresetChange(preset)}
                >
                  {preset[0].toUpperCase() + preset.slice(1)}
                </Button>
              ))}
            </div>
            {tempo.speedPreset === "custom" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <TempoInput label="Delay per message seconds" value={tempo.delayPerMessageSeconds} onChange={(value) => handleTempoNumberChange("delayPerMessageSeconds", value)} />
                <TempoInput label="Batch size" value={tempo.batchSize} onChange={(value) => handleTempoNumberChange("batchSize", value)} />
                <TempoInput label="Batch pause seconds" value={tempo.batchPauseSeconds} onChange={(value) => handleTempoNumberChange("batchPauseSeconds", value)} />
                <TempoInput label="Daily limit" value={tempo.dailyLimit} onChange={(value) => handleTempoNumberChange("dailyLimit", value)} />
              </div>
            ) : null}
            <label className="mt-4 flex items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={tempo.stopOnHighFailure}
                onChange={(event) => setTempo((current) => ({ ...current, stopOnHighFailure: event.target.checked }))}
              />
              Stop on high failure
            </label>
          </section>
        </div>

        <div className="space-y-5 xl:sticky xl:top-0 xl:self-start">
          <CampaignPreviewCard
            preview={preview}
            senderLabel={senderLabel}
            audienceLabel={selectedAudienceGroup?.name}
            validRecipients={selectedAudienceGroup?.valid_count}
            tempoLabel={tempoLabel}
          />

          <section className="rounded-3xl border border-border bg-white p-5 shadow-soft">
            <div>
              <p className="text-sm font-semibold text-text">Test Delivery</p>
              <p className="mt-1 text-sm text-text-muted">Send one preview message before you launch the campaign.</p>
            </div>

            <label className="mt-4 block">
              <span className="workspace-label">Test Phone Number</span>
              <Input value={testPhoneNumber} onChange={(event) => setTestPhoneNumber(event.target.value)} placeholder="+60123456789" />
            </label>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Campaigns should only be sent to customers who have given permission to receive messages. Always provide a clear way for customers to opt out.
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" disabled={startDisabled} onClick={() => void handleSaveDraft()}>
                {isSavingDraft ? "Saving..." : "Save Draft"}
              </Button>
              <Button variant="secondary" disabled={actionDisabled || isSendingTest} onClick={() => void handleSendTest()}>
                {isSendingTest ? "Sending..." : "Send Test"}
              </Button>
              <Button variant="secondary" disabled={startDisabled} onClick={() => void handleStartCampaign("Schedule Later")}>
                Schedule Later
              </Button>
              <Button disabled={startDisabled} onClick={() => void handleStartCampaign("Start Campaign")}>
                {isStartingCampaign ? "Starting..." : "Start Campaign"}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </PopupOverlay>
  );
}

function TempoInput({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 border-border bg-white px-3 py-2 text-text"
      />
    </label>
  );
}

function formatSenderLabel(account: WhatsAppAccountSummary) {
  const phone = account.phone_number || account.phone_number_normalized || "No phone";
  return `${account.name} - ${phone} - ${account.status}`;
}

function formatTempoLabel(tempo: CampaignTempo) {
  const preset = `${tempo.speedPreset[0].toUpperCase()}${tempo.speedPreset.slice(1)} mode`;
  const pauseMinutes = tempo.batchPauseSeconds >= 60 ? `${Math.round(tempo.batchPauseSeconds / 60)} min pause` : `${tempo.batchPauseSeconds}s pause`;
  return `${preset}, ${tempo.delayPerMessageSeconds}s/message, ${tempo.batchSize} per batch, ${pauseMinutes}`;
}
