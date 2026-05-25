import { CheckCircle2, Clipboard, X } from "lucide-react";
import { Button } from "../Button";
import type { AiMessageAssistResponse, AiMessageReview } from "../../api/ai";

type AiSuggestionCardProps = {
  result: AiMessageAssistResponse;
  onUse: (message: string) => void;
  onDismiss: () => void;
};

export function AiSuggestionCard({ result, onUse, onDismiss }: AiSuggestionCardProps) {
  const isCheck = result.action === "check";
  const title = isCheck ? "AI Review" : result.source === "template" ? "Suggested Template" : "Suggested Version";
  const providerLabel = result.provider === "deepseek" ? "DeepSeek AI" : "Fallback review";
  const whatsappScore = isCheck ? calculateWhatsAppScore(result.review) : null;

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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {providerLabel}
            </span>
            <span className="text-xs font-semibold text-text-muted">
              Spam risk: {result.review.spamRisk} · Readability: {result.review.readability} · CTA: {result.review.ctaClarity}
            </span>
          </div>
        </div>
        <Button size="icon" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {isCheck ? (
        <div className="mt-3 rounded-xl border border-border bg-card px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">WhatsApp Score: {whatsappScore}/100</p>
            <div className="flex flex-wrap gap-2">
              <ScoreBadge label="Spam Risk" value={result.review.spamRisk} />
              <ScoreBadge label="Readability" value={result.review.readability} />
              <ScoreBadge label="CTA" value={result.review.ctaClarity} />
              <ScoreBadge label="Warnings" value={String(result.review.warnings.length)} />
            </div>
          </div>
        </div>
      ) : null}

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

export function calculateWhatsAppScore(review: AiMessageReview) {
  let score = 100;

  if (review.spamRisk === "medium") {
    score -= 15;
  } else if (review.spamRisk === "high") {
    score -= 30;
  }

  if (review.readability === "medium") {
    score -= 10;
  } else if (review.readability === "hard") {
    score -= 20;
  }

  if (review.ctaClarity === "unclear") {
    score -= 10;
  } else if (review.ctaClarity === "missing") {
    score -= 25;
  }

  score -= review.warnings.length * 5;

  return Math.max(0, Math.min(100, score));
}

function ScoreBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
      {label}: {value}
    </span>
  );
}
