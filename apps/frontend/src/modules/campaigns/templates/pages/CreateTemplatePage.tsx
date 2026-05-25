import { ArrowLeft, CheckCircle2, FileText, Image, Music, Paperclip, Trash2, Upload, Video } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { AiMessageAssist } from "../../../../components/ai/AiMessageAssist";
import { Button } from "../../../../components/Button";
import { Card } from "../../../../components/Card";
import { Input, Select } from "../../../../components/Input";
import { Toast } from "../../../../components/Toast";
import type { DashboardOutletContext } from "../../../../layouts/DashboardLayout";
import { CampaignModuleTabs } from "../../components/CampaignModuleTabs";
import { configurableTemplateVariables, defaultTemplateContent, templateCategories } from "../constants/templateConstants";
import { getMessageTemplatesQueryKey, useMessageTemplates } from "../hooks/useMessageTemplates";
import { createMessageTemplate, updateMessageTemplate } from "../services/templateService";
import type { MessageTemplateCategory, TemplateAttachment, TemplateAttachmentKind, TemplateFormDraft } from "../types/template.types";
import { extractTemplateVariables, getInvalidTemplateVariables, insertVariableAtCursor, renderTemplateSample } from "../utils/templateVariables";
import { TemplateWizardSteps, WizardField } from "../components/TemplateWizardSteps";
import { WhatsAppTemplatePreview } from "../components/WhatsAppTemplatePreview";

const initialDraft: TemplateFormDraft = {
  name: "",
  category: "Promotion",
  description: "",
  content: defaultTemplateContent,
  attachments: [],
  status: "Active"
};

const suggestedUnsubscribeText = "Reply STOP untuk berhenti menerima mesej.";
const maxTemplateAttachments = 3;
const maxAttachmentBytes = 3 * 1024 * 1024;
const maxImagePreviewBytes = 1024 * 1024;
const attachmentAccept = "image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,video/*,audio/*,.txt,.csv";

const attachmentIcons: Record<TemplateAttachmentKind, typeof Paperclip> = {
  image: Image,
  document: FileText,
  video: Video,
  audio: Music,
  file: Paperclip
};

export function CreateTemplatePage() {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : null;
  const shouldAllowCreate = !outletContext.isSuperAdmin || Boolean(organizationId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<TemplateFormDraft>(initialDraft);
  const [unsubscribeText, setUnsubscribeText] = useState("");
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const editTemplateId = searchParams.get("edit");
  const { data: templates = [] } = useMessageTemplates(organizationId, shouldAllowCreate && Boolean(editTemplateId));
  const editingTemplate = useMemo(
    () => templates.find((template) => template.id === editTemplateId) ?? null,
    [editTemplateId, templates]
  );
  const finalTemplateContent = useMemo(
    () => buildTemplateContentWithUnsubscribe(draft.content, unsubscribeText),
    [draft.content, unsubscribeText]
  );
  const detectedVariables = useMemo(() => extractTemplateVariables(finalTemplateContent), [finalTemplateContent]);
  const invalidVariables = useMemo(
    () => getInvalidTemplateVariables(finalTemplateContent, configurableTemplateVariables),
    [finalTemplateContent]
  );
  const samplePreview = useMemo(
    () => renderTemplateSample(finalTemplateContent, configurableTemplateVariables),
    [finalTemplateContent]
  );

  useEffect(() => {
    if (!editingTemplate) {
      return;
    }

    const existingUnsubscribeText = inferUnsubscribeText(editingTemplate.content);

    setUnsubscribeText(existingUnsubscribeText);
    setDraft({
      name: editingTemplate.name,
      category: editingTemplate.category,
      description: editingTemplate.description ?? "",
      content: stripUnsubscribeText(editingTemplate.content, existingUnsubscribeText),
      attachments: editingTemplate.attachments ?? [],
      status: editingTemplate.status
    });
  }, [editingTemplate]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const draftToSave = {
        ...draft,
        content: finalTemplateContent
      };

      return editTemplateId
        ? updateMessageTemplate({ ...draftToSave, templateId: editTemplateId })
        : createMessageTemplate({ ...draftToSave, organizationId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getMessageTemplatesQueryKey(organizationId) });
      navigate("/campaigns/whatsapp/templates");
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to save template.", "error")
  });

  function showNotice(message: string, variant: "success" | "error" = "success") {
    setNotice({ message, variant });
  }

  function goNext() {
    const validation = validateStep(step);

    if (validation) {
      showNotice(validation, "error");
      return;
    }

    setStep((current) => Math.min(4, current + 1));
  }

  function validateStep(currentStep: number) {
    if (currentStep === 1 && !draft.name.trim()) {
      return "Template name is required.";
    }

    if (currentStep === 2 && !draft.content.trim()) {
      return "Message content is required.";
    }

    if (currentStep === 3 && invalidVariables.length > 0) {
      return "Resolve invalid variables before review.";
    }

    return null;
  }

  function handleInsertVariable(variableKey: string) {
    const textArea = textAreaRef.current;
    const nextValue = insertVariableAtCursor(draft.content, variableKey, textArea?.selectionStart ?? null, textArea?.selectionEnd ?? null);

    setDraft((current) => ({ ...current, content: nextValue.value }));
    window.setTimeout(() => {
      textArea?.focus();
      textArea?.setSelectionRange(nextValue.cursorPosition, nextValue.cursorPosition);
    }, 0);
  }

  async function handleAttachmentFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const availableSlots = maxTemplateAttachments - draft.attachments.length;
    const selectedFiles = Array.from(files).slice(0, Math.max(0, availableSlots));

    if (availableSlots <= 0) {
      showNotice(`You can attach up to ${maxTemplateAttachments} files per template.`, "error");
      resetAttachmentInput();
      return;
    }

    if (files.length > availableSlots) {
      showNotice(`Only ${availableSlots} more attachment${availableSlots === 1 ? "" : "s"} can be added.`, "error");
    }

    const acceptedAttachments: TemplateAttachment[] = [];

    for (const file of selectedFiles) {
      if (file.size > maxAttachmentBytes) {
        showNotice(`${file.name} is larger than ${formatFileSize(maxAttachmentBytes)}.`, "error");
        continue;
      }

      acceptedAttachments.push({
        id: createAttachmentId(),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        kind: getAttachmentKind(file),
        dataUrl: await getAttachmentPreviewDataUrl(file)
      });
    }

    if (acceptedAttachments.length > 0) {
      setDraft((current) => ({
        ...current,
        attachments: [...current.attachments, ...acceptedAttachments]
      }));
    }

    resetAttachmentInput();
  }

  function removeAttachment(attachmentId: string) {
    setDraft((current) => ({
      ...current,
      attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId)
    }));
  }

  function resetAttachmentInput() {
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  function submitTemplate() {
    const validation = validateStep(3) || validateStep(2) || validateStep(1);

    if (validation) {
      showNotice(validation, "error");
      return;
    }

    if (!unsubscribeText.trim()) {
      const message = "Sila masukkan Opt-out Message sebelum submit template. Contoh: Reply STOP untuk berhenti menerima mesej.";
      window.alert(message);
      showNotice(message, "error");
      setStep(2);
      return;
    }

    saveMutation.mutate();
  }

  return (
    <section className="space-y-5">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Templates</p>
            <h2 className="mt-3 section-title">{editTemplateId ? "Edit Message Template" : "Create Message Template"}</h2>
            <p className="mt-2 max-w-2xl section-copy">Build reusable message content for future WhatsApp campaigns.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate("/campaigns/whatsapp/templates")}>
            <ArrowLeft size={16} />
            Back to Templates
          </Button>
        </div>
      </Card>

      <CampaignModuleTabs channel="whatsapp" />

      {outletContext.isSuperAdmin && !organizationId ? (
        <Card elevated className="p-5 text-sm text-text-muted">
          Choose an organization from the sidebar before creating Message Templates.
        </Card>
      ) : (
        <>
          <TemplateWizardSteps currentStep={step} />
          <Card elevated className="space-y-5 p-4 sm:p-5">
            {step === 1 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <WizardField label="Template Name">
                  <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Example: Raya Promo Follow Up" />
                </WizardField>
                <WizardField label="Category">
                  <Select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as MessageTemplateCategory }))}>
                    {templateCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </Select>
                </WizardField>
                <WizardField label="Description" hint="Optional internal note for your team.">
                  <Input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="When should this template be used?" />
                </WizardField>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <WizardField label="Message Content">
                    <textarea
                      ref={textAreaRef}
                      value={draft.content}
                      onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                      className="input-base min-h-[260px] resize-y leading-6"
                      placeholder="Write your WhatsApp blast message"
                    />
                    <AiMessageAssist
                      actions={["generate", "check"]}
                      value={draft.content}
                      onChange={(nextValue) => setDraft((current) => ({ ...current, content: nextValue }))}
                      source="template"
                      organizationId={organizationId}
                      variables={["first_name", "name", "business_name", "phone", "order_id", ...configurableTemplateVariables.map((variable) => variable.key)]}
                      templatePurpose={draft.description || draft.category}
                    />
                  </WizardField>

                  <WizardField label="Opt-out Message" hint="Required. This footer will be appended to the saved template and helps campaign safety checks pass.">
                    <textarea
                      value={unsubscribeText}
                      onChange={(event) => setUnsubscribeText(event.target.value)}
                      className="input-base min-h-[90px] resize-y leading-6"
                      placeholder={suggestedUnsubscribeText}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => setUnsubscribeText(suggestedUnsubscribeText)}>
                        Use Suggested Text
                      </Button>
                      <p className="text-xs text-text-muted">Example: {suggestedUnsubscribeText}</p>
                    </div>
                  </WizardField>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Attachment</p>
                        <p className="mt-1 text-xs text-text-muted">Add PDF, image, video, audio or document files to this template.</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={draft.attachments.length >= maxTemplateAttachments}
                        onClick={() => attachmentInputRef.current?.click()}
                      >
                        <Upload size={15} />
                        Add Attachment
                      </Button>
                    </div>
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      accept={attachmentAccept}
                      className="hidden"
                      onChange={(event) => void handleAttachmentFiles(event.target.files)}
                    />
                    {draft.attachments.length > 0 ? (
                      <div className="space-y-2">
                        {draft.attachments.map((attachment) => (
                          <AttachmentItem key={attachment.id} attachment={attachment} onRemove={() => removeAttachment(attachment.id)} />
                        ))}
                      </div>
                    ) : (
                      <div className="border border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-text-muted">
                        No attachment added yet.
                      </div>
                    )}
                    <p className="text-xs text-text-muted">
                      {draft.attachments.length}/{maxTemplateAttachments} attachments used. Max {formatFileSize(maxAttachmentBytes)} per file.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {configurableTemplateVariables.map((variable) => (
                      <Button key={variable.key} size="sm" variant="secondary" onClick={() => handleInsertVariable(variable.key)}>
                        {variable.key}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-text-muted">{finalTemplateContent.length.toLocaleString()} characters including opt-out message</p>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">WhatsApp Preview</p>
                  <WhatsAppTemplatePreview content={finalTemplateContent} attachments={draft.attachments} />
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Detected Variables</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detectedVariables.length > 0 ? detectedVariables.map((variable) => (
                        <span key={variable} className={`inline-flex border px-3 py-2 text-xs font-semibold ${
                          invalidVariables.includes(variable) ? "border-coral/30 bg-coral/10 text-coral" : "border-primary/20 bg-primary/5 text-primary"
                        }`}>
                          {variable}
                          {invalidVariables.includes(variable) ? " warning" : ""}
                        </span>
                      )) : <span className="text-sm text-text-muted">No variables detected.</span>}
                    </div>
                  </div>
                  {invalidVariables.length > 0 ? (
                    <div className="border border-coral/30 bg-coral/10 p-4 text-sm text-coral">
                      Invalid variables: {invalidVariables.join(", ")}
                    </div>
                  ) : (
                    <div className="border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                      All detected variables are configured.
                    </div>
                  )}
                  {!unsubscribeText.trim() ? (
                    <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                      Opt-out Message is still empty. You will be reminded to add it before saving this template.
                    </div>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Available Variables</p>
                  <div className="space-y-2">
                    {configurableTemplateVariables.map((variable) => (
                      <div key={variable.key} className="app-card p-3">
                        <p className="text-sm font-semibold text-text">{variable.key}</p>
                        <p className="mt-1 text-xs text-text-muted">{variable.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <div className="app-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Template Info</p>
                    <h3 className="mt-2 text-lg font-semibold text-text">{draft.name}</h3>
                    <p className="mt-1 text-sm text-text-muted">{draft.category}</p>
                    {draft.description ? <p className="mt-3 text-sm text-text-muted">{draft.description}</p> : null}
                  </div>
                  <div className="app-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Opt-out Message</p>
                    {unsubscribeText.trim() ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text">{unsubscribeText.trim()}</p>
                    ) : (
                      <p className="mt-3 text-sm text-coral">Missing. You must add this before saving.</p>
                    )}
                  </div>
                  <div className="app-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Detected Variables</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detectedVariables.length > 0 ? detectedVariables.map((variable) => (
                        <span key={variable} className="inline-flex border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
                          {variable}
                        </span>
                      )) : <span className="text-sm text-text-muted">No variables detected.</span>}
                    </div>
                  </div>
                  <div className="app-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Rendered Sample Preview</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text">{samplePreview}</p>
                  </div>
                  <div className="app-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Attachments</p>
                    {draft.attachments.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {draft.attachments.map((attachment) => (
                          <AttachmentSummary key={attachment.id} attachment={attachment} />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-text-muted">No attachments added.</p>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Final Preview</p>
                  <WhatsAppTemplatePreview content={finalTemplateContent} attachments={draft.attachments} />
                </div>
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="secondary" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}>
                Previous
              </Button>
              <div className="flex gap-2 sm:justify-end">
                {step < 4 ? (
                  <Button onClick={goNext}>Next</Button>
                ) : (
                  <Button onClick={submitTemplate} disabled={!shouldAllowCreate || saveMutation.isPending}>
                    <CheckCircle2 size={16} />
                    {editTemplateId ? "Update Template" : "Save Template"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} onClose={() => setNotice(null)} />
    </section>
  );
}

function AttachmentItem({ attachment, onRemove }: { attachment: TemplateAttachment; onRemove: () => void }) {
  const Icon = attachmentIcons[attachment.kind] ?? Paperclip;

  return (
    <div className="flex items-center gap-3 border border-border bg-card px-3 py-2">
      <Icon size={18} className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{attachment.name}</p>
        <p className="text-xs text-text-muted">{formatAttachmentKind(attachment.kind)} · {formatFileSize(attachment.size)}</p>
      </div>
      <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${attachment.name}`} onClick={onRemove}>
        <Trash2 size={16} />
      </Button>
    </div>
  );
}

function AttachmentSummary({ attachment }: { attachment: TemplateAttachment }) {
  const Icon = attachmentIcons[attachment.kind] ?? Paperclip;

  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <Icon size={16} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
      <span className="shrink-0">{formatFileSize(attachment.size)}</span>
    </div>
  );
}

function getAttachmentKind(file: File): TemplateAttachmentKind {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  if (file.type.startsWith("audio/")) {
    return "audio";
  }

  if (file.type === "application/pdf" || /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i.test(file.name)) {
    return "document";
  }

  return "file";
}

function formatAttachmentKind(kind: TemplateAttachmentKind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createAttachmentId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read attachment."));
    reader.readAsDataURL(file);
  });
}

async function getAttachmentPreviewDataUrl(file: File) {
  if (!file.type.startsWith("image/") || file.size > maxImagePreviewBytes) {
    return undefined;
  }

  try {
    return await readFileAsDataUrl(file);
  } catch {
    return undefined;
  }
}

function buildTemplateContentWithUnsubscribe(content: string, unsubscribeText: string) {
  const body = content.trim();
  const footer = unsubscribeText.trim();

  if (!footer) {
    return body;
  }

  if (body.toLowerCase().includes(footer.toLowerCase())) {
    return body;
  }

  return body ? `${body}\n\n${footer}` : footer;
}

function inferUnsubscribeText(content: string) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const match = [...lines].reverse().find((line) => /(stop|unsubscribe|tak nak|taknak|berhenti|jangan hantar|cancel|opt out)/i.test(line));
  return match ?? "";
}

function stripUnsubscribeText(content: string, unsubscribeText: string) {
  const footer = unsubscribeText.trim();

  if (!footer) {
    return content;
  }

  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== footer)
    .join("\n")
    .trim();
}
