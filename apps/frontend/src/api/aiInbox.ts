import { apiPost } from "../lib/http";

export type AiInboxAssistAction =
  | "suggest_reply"
  | "detect_intent"
  | "summarize"
  | "match_quick_reply"
  | "rewrite_draft"
  | "check_reply";

export type AiInboxIntent = {
  label:
    | "pricing"
    | "coverage_check"
    | "interested"
    | "document_request"
    | "complaint"
    | "follow_up"
    | "not_interested"
    | "unknown";
  confidence: number;
  sentiment: "positive" | "neutral" | "negative";
  urgency: "low" | "medium" | "high";
};

export type AiInboxReview = {
  spamRisk: "low" | "medium" | "high";
  readability: "easy" | "medium" | "hard";
  ctaClarity: "good" | "unclear" | "missing";
  warnings: string[];
  tips: string[];
};

export type AiInboxAssistInput = {
  organizationId?: string | null;
  conversationId: string;
  action: AiInboxAssistAction;
  draft?: string;
  tone?: "friendly" | "professional" | "concise";
};

export type AiInboxAssistResponse = {
  success: true;
  action: AiInboxAssistAction;
  intent: AiInboxIntent;
  summary: string | null;
  suggestedReplies: Array<{
    label: string;
    body: string;
    confidence: number;
  }>;
  quickReplyMatches: Array<{
    templateId: string;
    title: string;
    confidence: number;
  }>;
  recommendedAction: string | null;
  review: AiInboxReview;
  provider: "deepseek" | "fallback";
  usage: {
    model: string | null;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    creditUnits: number;
  };
};

export function requestInboxAiAssist(input: AiInboxAssistInput) {
  return apiPost<AiInboxAssistResponse>("/ai/inbox-assist", input);
}
