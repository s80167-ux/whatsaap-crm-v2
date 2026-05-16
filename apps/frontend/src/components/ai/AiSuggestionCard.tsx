import { CheckCircle2, Clipboard, X } from "lucide-react";
import { Button } from "../Button";
import type { AiMessageAssistResponse } from "../../api/ai";

type AiSuggestionCardProps = {
  result: AiMessageAssistResponse;
  onUse: (message: string) => void;
  onDismiss: () => void;
};

export function AiSuggestionCard({ result, onUse, onDismiss }: AiSuggestionCardProps) {
  const isCheck = result.action === "check";
  const title = isCheck ? "AI Review" : result.source === "template" ? "Suggested Template" : "Suggested Version";

  async function handleCopy() {
    if (!result.suggestedMessage) {
      return;
    }

    await navigator.clipboard.writeText(result.suggestedMessage);
  }

  return (
    <div className="rounded-2xl border border-border bg-background-tint p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className="mt-1 text-xs font-semibold text-text-muted">Spam risk: {result.review.spamRisk} · Readability: {result.review.readability} · CTA: {result.review.ctaClarity}</p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {result.suggestedMessage ? (
        <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-card px-3 py-3 text-sm leading-6 text-text">
          {result.suggestedMessage}
        </div>
      ) : null}

      {result.review.warnings.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase text-text-soft">Warnings</p>
          <ul className="mt-2 space-y-1 text-sm text-text-muted">
            {result.review.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.review.tips.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase text-text-soft">Tips</p>
          <ul className="mt-2 space-y-1 text-sm text-text-muted">
            {result.review.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.suggestedMessage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => result.suggestedMessage && onUse(result.suggestedMessage)}>
            <CheckCircle2 className="h-4 w-4" />
            Use This Version
          </Button>
          <Button size="sm" variant="secondary" onClick={handleCopy}>
            <Clipboard className="h-4 w-4" />
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}
