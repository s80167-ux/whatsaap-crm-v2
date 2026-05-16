import type { AiMessageReview } from "../../api/ai";

type MessageMetaBarProps = {
  value: string;
  latestReview?: AiMessageReview | null;
};

const variablePattern = /\{\{[^}]+\}\}/g;

export function MessageMetaBar({ value, latestReview }: MessageMetaBarProps) {
  const variables = Array.from(new Set(value.match(variablePattern) ?? []));

  return (
    <p className="text-xs font-semibold text-text-muted">
      {value.length.toLocaleString()} chars
      {variables.length > 0 ? ` · Variables: ${variables.join(", ")}` : " · Variables: none"}
      {latestReview ? ` · Spam risk: ${latestReview.spamRisk}` : ""}
    </p>
  );
}
