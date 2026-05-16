import { useState } from "react";
import { requestAiMessageAssist } from "../../api/ai";
import type { AiMessageAction, AiMessageAssistResponse, AiMessageLanguage, AiMessageSource } from "../../api/ai";
import { AiAssistToolbar } from "./AiAssistToolbar";
import { AiSuggestionCard } from "./AiSuggestionCard";
import { MessageMetaBar } from "./MessageMetaBar";

export type AiMessageAssistProps = {
  value: string;
  onChange: (nextValue: string) => void;
  source: AiMessageSource;
  variables?: string[];
  language?: AiMessageLanguage;
  tone?: string;
  campaignObjective?: string;
  templatePurpose?: string;
};

export function AiMessageAssist({
  value,
  onChange,
  source,
  variables,
  language = "ms-MY",
  tone = "friendly",
  campaignObjective,
  templatePurpose
}: AiMessageAssistProps) {
  const [loadingAction, setLoadingAction] = useState<AiMessageAction | null>(null);
  const [result, setResult] = useState<AiMessageAssistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmedValue = value.trim();

  async function handleAction(action: AiMessageAction) {
    if (!trimmedValue || loadingAction) {
      return;
    }

    setLoadingAction(action);
    setError(null);
    setResult(null);

    try {
      const response = await requestAiMessageAssist({
        source,
        action,
        message: value,
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

  return (
    <div className="mt-3 space-y-3">
      <AiAssistToolbar disabled={!trimmedValue} loadingAction={loadingAction} onAction={handleAction} />
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
