import { apiPost } from "../lib/http";

export type AiMessageSource = "campaign" | "template";
export type AiMessageAction = "generate" | "improve" | "shorten" | "friendly" | "professional" | "check";
export type AiMessageLanguage = "ms-MY" | "en-MY";

export type AiMessageReview = {
  spamRisk: "low" | "medium" | "high";
  readability: "easy" | "medium" | "hard";
  ctaClarity: "good" | "unclear" | "missing";
  warnings: string[];
  tips: string[];
};

export type AiMessageAssistInput = {
  source: AiMessageSource;
  action: AiMessageAction;
  message: string;
  organizationId?: string | null;
  language?: AiMessageLanguage;
  tone?: string;
  variables?: string[];
  campaignObjective?: string;
  templatePurpose?: string;
  audienceContext?: Record<string, unknown>;
};

export type AiMessageAssistResponse = {
  success: true;
  source: AiMessageSource;
  action: AiMessageAction;
  suggestedMessage: string | null;
  review: AiMessageReview;
  provider: "deepseek" | "fallback";
  usage: {
    model: string | null;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    creditUnits: number;
  };
};

export function requestAiMessageAssist(input: AiMessageAssistInput) {
  return apiPost<AiMessageAssistResponse>("/ai/message-assist", input);
}
