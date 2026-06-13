import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { checkCampaignContentRisk } from "../../../../api/campaignSafety";
import { AiMessageAssist } from "../../../../components/ai/AiMessageAssist";
import { Button } from "../../../../components/Button";
import { Card } from "../../../../components/Card";
import { Input, Select } from "../../../../components/Input";
import { Toast } from "../../../../components/Toast";
import type { DashboardOutletContext } from "../../../../layouts/DashboardLayout";
import { CampaignModuleTabs } from "../../components/CampaignModuleTabs";
import { WhatsAppTemplatePreview } from "../components/WhatsAppTemplatePreview";
import { configurableTemplateVariables, defaultTemplateContent, templateCategories } from "../constants/templateConstants";
import { getMessageTemplatesQueryKey, useMessageTemplates } from "../hooks/useMessageTemplates";
import { createMessageTemplate, updateMessageTemplate } from "../services/templateService";
import type { MessageTemplateCategory, TemplateFormDraft } from "../types/template.types";
import { extractTemplateVariables, getInvalidTemplateVariables, insertVariableAtCursor, renderTemplateSample } from "../utils/templateVariables";
import { TemplateWizardSteps, WizardField } from "../components/TemplateWizardSteps";

const initialDraft: TemplateFormDraft = {
  name: "",
  category: "Promotion",
  description: "",
  content: defaultTemplateContent,
  status: "Active"
};

const suggestedUnsubscribeText = "Reply STOP untuk berhenti menerima mesej.";

export function CreateTemplatePage() {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : null;
  const shouldAllowCreate = !outletContext.isSuperAdmin || Boolean(organizationId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
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
  const { data: safetyScan } = useQuery({
    queryKey: ["template-safety-scan", finalTemplateContent],
    queryFn: () => checkCampaignContentRisk({ message: finalTemplateContent }),
    enabled: finalTemplateContent.trim().length > 0
  });

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

  function submitTemplate() {
    const validation = validateStep(3) || validateStep(2) || validateStep(1);

    if (validation) {
      showNotice(validation, "error");
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

                  <WizardField label="Opt-out Message" hint="Optional but recommended. If left empty, Campaign Risk Guard can suggest a safer opt-out line later.">
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

                  <div className="flex flex-wrap gap-2">
                    {configurableTemplateVariables.map((variable) => (
                      <Button key={variable.key} size="sm" variant="secondary" onClick={() => handleInsertVariable(variable.key)}>
                        {variable.key}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-text-muted">{finalTemplateContent.length.toLocaleString()} characters including opt-out message</p>
                  {safetyScan ? (
                    <div className={`border p-4 text-sm leading-6 ${getSafetyTone(safetyScan.spam_risk_level)}`}>
                      <p className="font-semibold">{getSafetyLabel(safetyScan.spam_risk_level)}</p>
                      <p className="mt-1">
                        Message length: {safetyScan.message_length} characters. Links: {safetyScan.link_count}. Emoji: {safetyScan.emoji_count ?? 0}.
                      </p>
                      {safetyScan.suggestions.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {safetyScan.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">WhatsApp Preview</p>
                  <WhatsAppTemplatePreview content={finalTemplateContent} />
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
                        <span
                          key={variable}
                          className={`inline-flex border px-3 py-2 text-xs font-semibold ${
                            invalidVariables.includes(variable) ? "border-coral/30 bg-coral/10 text-coral" : "border-primary/20 bg-primary/5 text-primary"
                          }`}
                        >
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
                      Opt-out Message is still empty. You can still save this template, but Campaign Risk Guard will recommend a safer opt-out line before sending.
                    </div>
                  ) : null}
                  {safetyScan ? (
                    <div className={`border p-4 text-sm leading-6 ${getSafetyTone(safetyScan.spam_risk_level)}`}>
                      <p className="font-semibold">{getSafetyLabel(safetyScan.spam_risk_level)}</p>
                      {safetyScan.warnings.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {safetyScan.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-2">No major template safety warnings detected.</p>
                      )}
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
                      <p className="mt-3 text-sm text-amber-700">Missing. You can still save, but safer campaigns usually include a short opt-out line.</p>
                    )}
                  </div>
                  {safetyScan ? (
                    <div className={`app-card p-4 ${getSafetyTone(safetyScan.spam_risk_level)}`}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em]">Template Safety</p>
                      <p className="mt-2 text-sm font-semibold">{getSafetyLabel(safetyScan.spam_risk_level)}</p>
                      <p className="mt-2 text-sm">
                        {safetyScan.warnings[0] ?? "Template looks reasonable for a normal campaign review."}
                      </p>
                    </div>
                  ) : null}
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
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Final Preview</p>
                  <WhatsAppTemplatePreview content={finalTemplateContent} />
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

function getSafetyLabel(level: "low" | "medium" | "high" | "critical") {
  if (level === "low") return "Template Safety: Good";
  if (level === "medium") return "Template Safety: Needs Review";
  return "Template Safety: High Risk";
}

function getSafetyTone(level: "low" | "medium" | "high" | "critical") {
  if (level === "low") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (level === "medium") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-coral/30 bg-coral/10 text-coral";
}
