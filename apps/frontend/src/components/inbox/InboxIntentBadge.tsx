import clsx from "clsx";
import type { AiInboxIntent } from "../../api/aiInbox";

type InboxIntentBadgeProps = {
  intent: AiInboxIntent;
  recommendedAction?: string | null;
};

const intentLabels: Record<AiInboxIntent["label"], string> = {
  pricing: "Pricing",
  coverage_check: "Coverage check",
  interested: "Interested",
  document_request: "Document request",
  complaint: "Complaint",
  follow_up: "Follow up",
  not_interested: "Not interested",
  unknown: "Unknown"
};

export function InboxIntentBadge({ intent, recommendedAction }: InboxIntentBadgeProps) {
  return (
    <div className="rounded-lg border border-border bg-background-tint p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">{intentLabels[intent.label]}</span>
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-text-muted">
          {Math.round(intent.confidence * 100)}%
        </span>
        <span className={clsx("rounded-full px-2 py-0.5", getSentimentClass(intent.sentiment))}>{intent.sentiment}</span>
        <span className={clsx("rounded-full px-2 py-0.5", getUrgencyClass(intent.urgency))}>{intent.urgency} urgency</span>
      </div>
      {recommendedAction ? (
        <p className="mt-2 leading-5 text-text-muted">Next: {recommendedAction.replace(/_/g, " ")}</p>
      ) : null}
    </div>
  );
}

function getSentimentClass(sentiment: AiInboxIntent["sentiment"]) {
  if (sentiment === "positive") {
    return "bg-success/10 text-success";
  }

  if (sentiment === "negative") {
    return "bg-destructive/10 text-destructive";
  }

  return "bg-muted text-text-muted";
}

function getUrgencyClass(urgency: AiInboxIntent["urgency"]) {
  if (urgency === "high") {
    return "bg-destructive/10 text-destructive";
  }

  if (urgency === "medium") {
    return "bg-warning/10 text-warning";
  }

  return "bg-muted text-text-muted";
}
