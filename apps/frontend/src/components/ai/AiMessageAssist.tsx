import { useState } from "react";
import type { FormEvent } from "react";
import { requestAiMessageAssist } from "../../api/ai";
import type { AiMessageAction, AiMessageAssistResponse, AiMessageLanguage, AiMessageSource } from "../../api/ai";
import { useAiMessageAssistModuleStatus } from "../../hooks/useAdmin";
import { getStoredUser } from "../../lib/auth";
import { Button } from "../Button";
import { Input, Select } from "../Input";
import { AiAssistToolbar } from "./AiAssistToolbar";
import { AiSuggestionCard } from "./AiSuggestionCard";
import { MessageMetaBar } from "./MessageMetaBar";

export type AiMessageAssistProps = {
  actions?: AiMessageAction[];
  value: string;
  onChange: (nextValue: string) => void;
  source: AiMessageSource;
  organizationId?: string | null;
  variables?: string[];
  language?: AiMessageLanguage;
  tone?: string;
  campaignObjective?: string;
  templatePurpose?: string;
};

export function AiMessageAssist({
  actions,
  value,
  onChange,
  source,
  organizationId,
  variables,
  language = "ms-MY",
  tone = "friendly",
  campaignObjective,
  templatePurpose
}: AiMessageAssistProps) {
  const [loadingAction, setLoadingAction] = useState<AiMessageAction | null>(null);
  const [result, setResult] = useState<AiMessageAssistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateBrief, setShowTemplateBrief] = useState(false);
  const [brief, setBrief] = useState({
    productOffer: "",
    audience: "",
    cta: "",
    tone: "Friendly"
  });
  const trimmedValue = value.trim();
  const user = getStoredUser();
  const shouldFetchModuleStatus = Boolean(user && (user.role !== "super_admin" || organizationId));
  const moduleStatusQuery = useAiMessageAssistModuleStatus(organizationId, shouldFetchModuleStatus);
  const isEnabled = moduleStatusQuery.data?.isEnabled === true;
  const disabledWhenEmpty: AiMessageAction[] = source === "template"
    ? ["improve", "shorten", "friendly", "professional", "check"]
    : ["generate", "improve", "shorten", "friendly", "professional", "check"];

  if (!shouldFetchModuleStatus || moduleStatusQuery.isLoading || !isEnabled) {
    return null;
  }

  async function handleAction(action: AiMessageAction) {
    if (loadingAction) {
      return;
    }

    if (!trimmedValue) {
      if (source === "template" && action === "generate") {
        setShowTemplateBrief(true);
        setError(null);
        setResult(null);
      }

      return;
    }

    setShowTemplateBrief(false);
    setLoadingAction(action);
    setError(null);
    setResult(null);

    try {
      const response = await requestAiMessageAssist({
        source,
        action,
        message: value,
        organizationId,
        language,
        tone,
        variables,
        campaignObjective,
        templatePurpose
      });
      setResult(response);
    } catch {
      setError("AI Assist belum tersedia. Awak masih boleh terus tulis mesej seperti biasa.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleTemplateBriefSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadingAction) {
      return;
    }

    const briefMessage = [
      `Product / Offer: ${brief.productOffer.trim() || "-"}`,
      `Audience: ${brief.audience.trim() || "-"}`,
      `CTA: ${brief.cta.trim() || "-"}`,
      `Tone: ${brief.tone}`,
      `Template purpose: ${templatePurpose?.trim() || "-"}`
    ].join("\n");

    setLoadingAction("generate");
    setError(null);
    setResult(null);

    try {
      const response = await requestAiMessageAssist({
        source: "template",
        action: "generate",
        message: briefMessage,
        organizationId,
        language: "ms-MY",
        tone: brief.tone,
        variables,
        templatePurpose
      });
      setResult(response);
      setShowTemplateBrief(false);
    } catch {
      setError("AI Assist belum tersedia. Awak masih boleh terus tulis mesej seperti biasa.");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <AiAssistToolbar
        actions={actions}
        disabledActions={trimmedValue ? [] : disabledWhenEmpty}
        loadingAction={loadingAction}
        onAction={handleAction}
      />
      {showTemplateBrief ? (
        <form className="rounded-2xl border border-border bg-background-tint p-4" onSubmit={handleTemplateBriefSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-text-muted">
              <span>Product / Offer</span>
              <Input
                value={brief.productOffer}
                onChange={(event) => setBrief((current) => ({ ...current, productOffer: event.target.value }))}
                placeholder="Example: Raya promo set"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-text-muted">
              <span>Audience</span>
              <Input
                value={brief.audience}
                onChange={(event) => setBrief((current) => ({ ...current, audience: event.target.value }))}
                placeholder="Example: Existing customers"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-text-muted">
              <span>CTA</span>
              <Input
                value={brief.cta}
                onChange={(event) => setBrief((current) => ({ ...current, cta: event.target.value }))}
                placeholder="Example: Reply YES to book"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-text-muted">
              <span>Tone</span>
              <Select value={brief.tone} onChange={(event) => setBrief((current) => ({ ...current, tone: event.target.value }))}>
                <option value="Friendly">Friendly</option>
                <option value="Professional">Professional</option>
                <option value="Soft-sell">Soft-sell</option>
                <option value="Casual Bahasa Melayu">Casual Bahasa Melayu</option>
              </Select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={loadingAction === "generate"}>
              {loadingAction === "generate" ? "Generating..." : "Generate Message"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowTemplateBrief(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      <MessageMetaBar value={value} latestReview={result?.review ?? null} />
      {error ? <p className="rounded-xl border border-warning/20 bg-warning/10 px-3 py-2 text-xs font-semibold text-text-muted">{error}</p> : null}
      {result ? (
        <AiSuggestionCard
          result={result}
          onUse={(nextValue) => {
            onChange(nextValue);
            setResult(null);
          }}
          onDismiss={() => setResult(null)}
        />
      ) : null}
    </div>
  );
}
