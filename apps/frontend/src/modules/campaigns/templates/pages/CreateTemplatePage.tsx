import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";
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
import type { MessageTemplateCategory, TemplateFormDraft } from "../types/template.types";
import { extractTemplateVariables, getInvalidTemplateVariables, insertVariableAtCursor, renderTemplateSample } from "../utils/templateVariables";
import { TemplateWizardSteps, WizardField } from "../components/TemplateWizardSteps";
import { WhatsAppTemplatePreview } from "../components/WhatsAppTemplatePreview";

const initialDraft: TemplateFormDraft = {
  name: "",
  category: "Promotion",
  description: "",
  content: defaultTemplateContent,
  status: "Active"
};

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
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const editTemplateId = searchParams.get("edit");
  const { data: templates = [] } = useMessageTemplates(organizationId, shouldAllowCreate && Boolean(editTemplateId));
  const editingTemplate = useMemo(
    () => templates.find((template) => template.id === editTemplateId) ?? null,
    [editTemplateId, templates]
  );
  const detectedVariables = useMemo(() => extractTemplateVariables(draft.content), [draft.content]);
  const invalidVariables = useMemo(
    () => getInvalidTemplateVariables(draft.content, configurableTemplateVariables),
    [draft.content]
  );
  const samplePreview = useMemo(
    () => renderTemplateSample(draft.content, configurableTemplateVariables),
    [draft.content]
  );

  useEffect(() => {
    if (!editingTemplate) {
      return;
    }

    setDraft({
      name: editingTemplate.name,
      category: editingTemplate.category,
      description: editingTemplate.description ?? "",
      content: editingTemplate.content,
      status: editingTemplate.status
    });
  }, [editingTemplate]);

  const saveMutation = useMutation({
    mutationFn: () => (
      editTemplateId
        ? updateMessageTemplate({ ...draft, templateId: editTemplateId })
        : createMessageTemplate({ ...draft, organizationId })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getMessageTemplatesQueryKey(organizationId) });
      navigate("/campaigns/templates");
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
      <Card elevated className="workspace-page-header p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
              <FileText size={18} />
            </p>
            <h2 className="mt-3 section-title">{editTemplateId ? "Edit Message Template" : "Create Message Template"}</h2>
            <p className="mt-2 max-w-2xl section-copy">Build reusable message content for future WhatsApp campaigns.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate("/campaigns/templates")}>
            <ArrowLeft size={16} />
            Back to Templates
          </Button>
        </div>
      </Card>

      <CampaignModuleTabs />

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
                      value={draft.content}
                      onChange={(nextValue) => setDraft((current) => ({ ...current, content: nextValue }))}
                      source="template"
                      variables={["first_name", "name", "business_name", "phone", "order_id", ...configurableTemplateVariables.map((variable) => variable.key)]}
                      templatePurpose={draft.description || draft.category}
                    />
                  </WizardField>
                  <div className="flex flex-wrap gap-2">
                    {configurableTemplateVariables.map((variable) => (
                      <Button key={variable.key} size="sm" variant="secondary" onClick={() => handleInsertVariable(variable.key)}>
                        {variable.key}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-text-muted">{draft.content.length.toLocaleString()} characters</p>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">WhatsApp Preview</p>
                  <WhatsAppTemplatePreview content={draft.content} />
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
                  <WhatsAppTemplatePreview content={draft.content} />
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
