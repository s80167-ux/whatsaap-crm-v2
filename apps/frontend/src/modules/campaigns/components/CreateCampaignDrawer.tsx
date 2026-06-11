import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AiMessageAssist } from "../../../components/ai/AiMessageAssist";
import { Button } from "../../../components/Button";
import { Input, Select } from "../../../components/Input";
import { PopupOverlay } from "../../../components/PopupOverlay";
import type { WhatsAppAccountSummary } from "../../../types/admin";
import type { AudienceGroup } from "../audience-groups/types/audienceGroup.types";
import { fetchAudienceGroupContacts } from "../audience-groups/services/audienceGroupService";
import { createCampaign, sendCampaignTest, startCampaign } from "../services/campaignService";
import { useMessageTemplates } from "../templates/hooks/useMessageTemplates";
import { renderCampaignTemplate } from "../utils/campaignTemplate";
import { CampaignPreviewCard } from "./CampaignPreviewCard";
import type { CampaignAttachment, CampaignContact, CampaignSpeedPreset, CampaignTempo } from "../types/campaign.types";

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
  const { t } = useTranslation();
  const [campaignName, setCampaignName] = useState("");
  const [selectedSenderWhatsAppAccountIds, setSelectedSenderWhatsAppAccountIds] = useState<string[]>([]);
  const [primarySenderWhatsAppAccountId, setPrimarySenderWhatsAppAccountId] = useState("");
  const [audienceGroupId, setAudienceGroupId] = useState("");
  const [selectedMessageTemplateId, setSelectedMessageTemplateId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(defaultTemplate);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [tempo, setTempo] = useState<CampaignTempo>(tempoPresets.safe);
  const [attachment, setAttachment] = useState<CampaignAttachment | null>(null);
  const [attachContactCard, setAttachContactCard] = useState(false);
  const [sampleContact, setSampleContact] = useState<CampaignContact>(fallbackSampleContact);
  const [testSendNotice, setTestSendNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isStartingCampaign, setIsStartingCampaign] = useState(false);
  const [identityHintDismissed, setIdentityHintDismissed] = useState(false);
  const { data: savedMessageTemplates = [], isLoading: isLoadingSavedTemplates } = useMessageTemplates(organizationId, open);

  const connectedAccounts = useMemo(() => whatsappAccounts.filter((account) => isSenderConnected(account)), [whatsappAccounts]);
  const availableMessageTemplates = useMemo(
    () => savedMessageTemplates.filter((template) => template.status !== "Archived"),
    [savedMessageTemplates]
  );
  const disconnectedAccounts = useMemo(
    () => whatsappAccounts.filter((account) => !isSenderConnected(account)),
    [whatsappAccounts]
  );

  const readyAudienceGroups = useMemo(
    () => audienceGroups.filter((group) => group.status === "imported" && group.valid_count > 0),
    [audienceGroups]
  );

  const selectedSenders = useMemo(
    () => selectedSenderWhatsAppAccountIds
      .map((senderId) => whatsappAccounts.find((account) => account.id === senderId) ?? null)
      .filter((account): account is NonNullable<typeof account> => Boolean(account)),
    [selectedSenderWhatsAppAccountIds, whatsappAccounts]
  );
  const selectedSender = whatsappAccounts.find((account) => account.id === primarySenderWhatsAppAccountId) ?? null;
  const selectedSenderIsConnected = selectedSender ? isSenderConnected(selectedSender) : false;
  const selectedAudienceGroup = readyAudienceGroups.find((group) => group.id === audienceGroupId) ?? null;
  const selectedAudienceSyncedCount = selectedAudienceGroup
    ? selectedAudienceGroup.crm_saved_count ?? selectedAudienceGroup.linked_crm_count ?? 0
    : 0;
  const shouldShowIdentitySyncHint = Boolean(
    selectedAudienceGroup &&
    !identityHintDismissed &&
    selectedAudienceGroup.storage_status !== "deleted_details" &&
    selectedAudienceGroup.valid_count > 0 &&
    selectedAudienceSyncedCount < selectedAudienceGroup.valid_count
  );
  const preview = useMemo(() => renderCampaignTemplate(messageTemplate, sampleContact), [messageTemplate, sampleContact]);
  const senderLabel = useMemo(() => {
    if (selectedSenders.length === 0) {
      return null;
    }

    if (selectedSenders.length === 1) {
      return formatSenderLabel(selectedSenders[0]);
    }

    return `${selectedSenders.length} senders selected - Primary: ${selectedSender ? formatSenderLabel(selectedSender) : formatSenderLabel(selectedSenders[0])}`;
  }, [selectedSender, selectedSenders]);
  const tempoLabel = formatTempoLabel(tempo);

  if (!open) {
    return null;
  }

  function showError(message: string) {
    onPlaceholderAction(message, "error");
  }

  function showTestSendNotice(message: string, variant: "success" | "error") {
    setTestSendNotice({ message, variant });
    onPlaceholderAction(message, variant);
  }

  function validateSender() {
    if (selectedSenderWhatsAppAccountIds.length === 0) {
      showError("Select at least one connected Sender WhatsApp Number first.");
      return false;
    }

    const firstUnavailableSender = selectedSenders.find((sender) => !isSenderConnected(sender));
    if (firstUnavailableSender) {
      showError(
        firstUnavailableSender.live_status_error
          ? "One selected sender could not be verified with the live WhatsApp connector. Reconnect it and try again."
          : `${firstUnavailableSender.name} is currently ${formatSenderStatus(firstUnavailableSender)}. Reconnect it and try again.`
      );
      return false;
    }

    if (!primarySenderWhatsAppAccountId || !selectedSender) {
      showError("Choose the primary sender for test sends and campaign ownership.");
      return false;
    }

    return true;
  }

  function handleSenderToggle(senderId: string, checked: boolean) {
    setSelectedSenderWhatsAppAccountIds((current) => {
      const next = checked
        ? current.includes(senderId)
          ? current
          : [...current, senderId]
        : current.filter((value) => value !== senderId);

      setPrimarySenderWhatsAppAccountId((currentPrimary) => {
        if (next.length === 0) return "";
        if (currentPrimary && next.includes(currentPrimary)) return currentPrimary;
        return next[0];
      });

      return next;
    });
    setTestSendNotice(null);
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
    if (!messageTemplate.trim() && !attachment) {
      showError("Message Template or an attachment is required.");
      return false;
    }

    return true;
  }

  async function handleAudienceGroupChange(nextAudienceGroupId: string) {
    setAudienceGroupId(nextAudienceGroupId);
    setTestSendNotice(null);
    setIdentityHintDismissed(false);

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

  function handleMessageTemplateSelect(templateId: string) {
    setSelectedMessageTemplateId(templateId);
    const selectedTemplate = availableMessageTemplates.find((template) => template.id === templateId);

    if (selectedTemplate) {
      setMessageTemplate(selectedTemplate.content);
    }
  }

  function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const maxBytes = 4 * 1024 * 1024;
    if (file.size > maxBytes) {
      showError("Attachment too large. Please keep files under 4 MB.");
      event.target.value = "";
      return;
    }

    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "document";

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, dataBase64 = ""] = result.split(",");
      if (dataBase64) {
        setAttachment({
          kind,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64,
          fileSizeBytes: file.size
        });
      }
    };
    reader.onerror = () => showError("Unable to read the selected file.");
    reader.readAsDataURL(file);
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
        senderWhatsAppAccountId: primarySenderWhatsAppAccountId,
        senderWhatsAppAccountIds: selectedSenderWhatsAppAccountIds,
        senderMode: selectedSenderWhatsAppAccountIds.length > 1 ? "round_robin" : "single",
        audienceGroupId,
        messageTemplate,
        tempo,
        attachment,
        attachContactCard
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

    setTestSendNotice(null);
    setIsSendingTest(true);

    try {
      const result = await sendCampaignTest({
        organizationId,
        senderWhatsAppAccountId: primarySenderWhatsAppAccountId,
        testPhoneNumber: testPhoneNumber.trim(),
        messageTemplate: preview,
        attachment,
        attachContactCard
      });
      showTestSendNotice(result.message || `Test message queued from ${senderLabel} to ${testPhoneNumber.trim()}.`, "success");
    } catch (error) {
      showTestSendNotice(error instanceof Error ? error.message : "Unable to send test message.", "error");
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
        senderWhatsAppAccountId: primarySenderWhatsAppAccountId,
        senderWhatsAppAccountIds: selectedSenderWhatsAppAccountIds,
        senderMode: selectedSenderWhatsAppAccountIds.length > 1 ? "round_robin" : "single",
        audienceGroupId,
        messageTemplate,
        tempo,
        attachment,
        attachContactCard
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
        senderWhatsAppAccountId: primarySenderWhatsAppAccountId,
        senderWhatsAppAccountIds: selectedSenderWhatsAppAccountIds,
        senderMode: selectedSenderWhatsAppAccountIds.length > 1 ? "round_robin" : "single",
        audienceGroupId,
        messageTemplate,
        speedPreset: tempo.speedPreset,
        attachment,
        attachContactCard
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

  const actionDisabled = selectedSenderWhatsAppAccountIds.length === 0 || !selectedSender || !selectedSenderIsConnected;
  const startDisabled = actionDisabled || !selectedAudienceGroup || isSavingDraft || isStartingCampaign;

  return (
    <PopupOverlay
      open={open}
      onClose={onClose}
      title={t("campaign.create")}
      description="Set sender, audience, message template and sending tempo before launching the campaign."
      panelClassName="max-w-6xl"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
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

              <div className="block">
                <span className="workspace-label">Sender WhatsApp Numbers</span>
                <div className="mt-2 space-y-2 rounded-2xl border border-border bg-background px-3 py-3">
                  {whatsappAccounts.length === 0 ? (
                    <p className="text-sm text-text-muted">No WhatsApp numbers available yet.</p>
                  ) : (
                    whatsappAccounts.map((account) => {
                      const connected = isSenderConnected(account);
                      const checked = selectedSenderWhatsAppAccountIds.includes(account.id);

                      return (
                        <label
                          key={account.id}
                          className={connected
                            ? "flex items-start gap-3 rounded-2xl border border-border bg-card px-3 py-3"
                            : "flex items-start gap-3 rounded-2xl border border-border bg-background-tint px-3 py-3 opacity-70"}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!connected}
                            onChange={(event) => handleSenderToggle(account.id, event.target.checked)}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text">{account.name}</p>
                            <p className="text-xs text-text-muted">{formatSenderLabel(account)}</p>
                            {!connected ? (
                              <p className="mt-1 text-xs text-amber-800">
                                Not connected. Reconnect this number before it can join the campaign sender pool.
                              </p>
                            ) : null}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Choose one or more connected senders. When more than one sender is selected, the campaign will rotate them automatically.
                </p>
              </div>

              <label className="block">
                <span className="workspace-label">Primary Sender</span>
                <Select
                  value={primarySenderWhatsAppAccountId}
                  onChange={(event) => {
                    setPrimarySenderWhatsAppAccountId(event.target.value);
                    setTestSendNotice(null);
                  }}
                  disabled={selectedSenders.length === 0}
                >
                  <option value="">{selectedSenders.length === 0 ? "Select sender(s) first" : "Choose primary sender"}</option>
                  {selectedSenders.map((account) => (
                    <option key={account.id} value={account.id}>
                      {formatSenderLabel(account)}
                    </option>
                  ))}
                </Select>
                {selectedSender ? (
                  <p className="mt-2 text-xs text-text-muted">
                    Primary sender handles test sends and becomes the campaign's main sender label.
                  </p>
                ) : null}
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
                No live connected WhatsApp number available. Please reconnect a WhatsApp account before starting a campaign.
              </div>
            ) : null}

            {disconnectedAccounts.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-background-tint px-4 py-3 text-sm leading-6 text-text-muted">
                {connectedAccounts.length} connected sender{connectedAccounts.length === 1 ? "" : "s"} can be selected now. {disconnectedAccounts.length} sender{disconnectedAccounts.length === 1 ? " is" : "s are"} shown as disabled because the live WhatsApp connection is disconnected or could not be verified.
              </div>
            ) : null}

            {selectedAudienceGroup?.invalid_count || selectedAudienceGroup?.duplicate_count ? (
              <p className="mt-4 text-xs text-text-muted">
                {selectedAudienceGroup.invalid_count} invalid skipped, {selectedAudienceGroup.duplicate_count} duplicates skipped
              </p>
            ) : null}

            {shouldShowIdentitySyncHint ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                <p className="font-semibold">Identity sync is recommended.</p>
                <p className="mt-1">
                  Some audience contacts are not linked to contact identity yet. Campaign can still be sent, but replies may appear with weaker name/phone matching in Inbox.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="inline-flex min-h-9 items-center border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100" to="/campaigns/whatsapp/audience">
                    Sync Now
                  </Link>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setIdentityHintDismissed(true)}>
                    Continue Without Sync
                  </Button>
                </div>
              </div>
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

          <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-4">
              <p className="text-sm font-semibold text-text">Message Template</p>
              <p className="mt-1 text-sm text-text-muted">Choose a saved template from Create Template, or write the campaign message directly and personalise it for each contact.</p>
            </div>

            <label className="block">
              <span className="workspace-label">Choose Saved Template</span>
              <Select
                value={selectedMessageTemplateId}
                onChange={(event) => handleMessageTemplateSelect(event.target.value)}
                disabled={isLoadingSavedTemplates}
              >
                <option value="">
                  {isLoadingSavedTemplates
                    ? "Loading saved templates..."
                    : availableMessageTemplates.length > 0
                      ? "Select a created template"
                      : "No saved templates yet"}
                </option>
                {availableMessageTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.category})
                  </option>
                ))}
              </Select>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                <span>Saved templates come from the WhatsApp template library.</span>
                <Link className="font-semibold text-primary hover:text-primary-dark" to="/campaigns/whatsapp/templates/create">
                  Create Template
                </Link>
                <Link className="font-semibold text-primary hover:text-primary-dark" to="/campaigns/whatsapp/templates">
                  Manage Templates
                </Link>
              </div>
            </label>

            <label className="block">
              <span className="workspace-label">Template Content</span>
              <textarea
                value={messageTemplate}
                onChange={(event) => setMessageTemplate(event.target.value)}
                className="input-base min-h-44 w-full resize-y"
                placeholder={defaultTemplate}
              />
            </label>

            <label className="mt-4 block">
              <span className="workspace-label">Media Attachment</span>
              <input
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                onChange={handleAttachmentChange}
                className="block w-full text-sm text-text-muted file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-primary-dark"
              />
              {attachment ? (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs">
                  <span className="font-semibold text-text">{attachment.kind.toUpperCase()}:</span>
                  <span className="text-text-muted">{attachment.fileName}</span>
                  <button
                    type="button"
                    className="ml-auto text-coral hover:text-coral-dark"
                    onClick={() => setAttachment(null)}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </label>

            <label className="mt-4 flex items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={attachContactCard}
                onChange={(event) => setAttachContactCard(event.target.checked)}
              />
              Attach business contact card (recipients can save your number)
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
                <span className="rounded-full border border-primary/10 bg-card px-3 py-1">{"{{name}}"}</span>
                <span className="rounded-full border border-primary/10 bg-card px-3 py-1">{"{{phone}}"}</span>
                <span className="rounded-full border border-primary/10 bg-card px-3 py-1">{"{{salutation}}"}</span>
                <span className="rounded-full border border-primary/10 bg-card px-3 py-1">{"{{tag}}"}</span>
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
            attachment={attachment}
            attachContactCard={attachContactCard}
          />

          <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div>
              <p className="text-sm font-semibold text-text">Test Delivery</p>
              <p className="mt-1 text-sm text-text-muted">Send one preview message before you launch the campaign.</p>
            </div>

            <label className="mt-4 block">
              <span className="workspace-label">Test Phone Number</span>
              <Input
                value={testPhoneNumber}
                onChange={(event) => {
                  setTestPhoneNumber(event.target.value);
                  setTestSendNotice(null);
                }}
                placeholder="+60123456789"
              />
            </label>

            {testSendNotice ? (
              <div
                className={testSendNotice.variant === "error"
                  ? "mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
                  : "mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900"}
              >
                {testSendNotice.message}
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Campaigns should only be sent to customers who have given permission to receive messages. Always provide a clear way for customers to opt out.
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" disabled={startDisabled} onClick={() => void handleSaveDraft()}>
                {isSavingDraft ? t("common.loading") : t("campaign.saveDraft")}
              </Button>
              <Button variant="secondary" disabled={actionDisabled || isSendingTest} onClick={() => void handleSendTest()}>
                {isSendingTest ? t("common.loading") : t("campaign.sendTest")}
              </Button>
              <Button variant="secondary" disabled={startDisabled} onClick={() => void handleStartCampaign("Schedule Later")}>
                {t("campaign.scheduleLater")}
              </Button>
              <Button disabled={startDisabled} onClick={() => void handleStartCampaign("Start Campaign")}>
                {isStartingCampaign ? t("common.loading") : t("campaign.startCampaign")}
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
        className="mt-1 border-border bg-card px-3 py-2 text-text"
      />
    </label>
  );
}

function formatSenderLabel(account: WhatsAppAccountSummary) {
  const phone = account.phone_number || account.phone_number_normalized || "No phone";
  return `${account.name} - ${phone} - ${formatSenderStatus(account)}`;
}

function isSenderConnected(account: WhatsAppAccountSummary) {
  if (typeof account.live_connected === "boolean") {
    return account.live_connected;
  }

  return connectedStatuses.has(account.status.toLowerCase());
}

function formatSenderStatus(account: WhatsAppAccountSummary) {
  if (account.live_status_error) {
    return "unverified";
  }

  return account.live_connection_status ?? account.status;
}

function formatTempoLabel(tempo: CampaignTempo) {
  const preset = `${tempo.speedPreset[0].toUpperCase()}${tempo.speedPreset.slice(1)} mode`;
  const pauseMinutes = tempo.batchPauseSeconds >= 60 ? `${Math.round(tempo.batchPauseSeconds / 60)} min pause` : `${tempo.batchPauseSeconds}s pause`;
  return `${preset}, ${tempo.delayPerMessageSeconds}s/message, ${tempo.batchSize} per batch, ${pauseMinutes}`;
}
