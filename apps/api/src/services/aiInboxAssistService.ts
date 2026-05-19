import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { QuickReplyService } from "./quickReplyService.js";
import { QueryService } from "./queryService.js";
import type { AuthUser } from "../types/auth.js";
import type { ConversationRecord, MessageRecord } from "../types/domain.js";

export type AiInboxAssistAction =
  | "suggest_reply"
  | "detect_intent"
  | "summarize"
  | "match_quick_reply"
  | "rewrite_draft"
  | "check_reply";

export type AiInboxIntentLabel =
  | "pricing"
  | "coverage_check"
  | "interested"
  | "document_request"
  | "complaint"
  | "follow_up"
  | "not_interested"
  | "unknown";

export type AiInboxIntent = {
  label: AiInboxIntentLabel;
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
  organizationId: string;
  conversationId: string;
  action: AiInboxAssistAction;
  draft?: string;
  tone?: "friendly" | "professional" | "concise";
};

export type AiInboxAssistUsage = {
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  creditUnits: number;
};

export type AiInboxAssistResult = {
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
  usage: AiInboxAssistUsage;
};

type QuickReplyTemplate = Awaited<ReturnType<QuickReplyService["list"]>>[number];

type DeepSeekUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
};

type DeepSeekInboxJson = {
  intent?: Partial<AiInboxIntent>;
  summary?: unknown;
  suggestedReplies?: unknown;
  quickReplyMatches?: unknown;
  recommendedAction?: unknown;
  review?: Partial<AiInboxReview>;
};

const deepSeekChatCompletionsUrl = "https://api.deepseek.com/chat/completions";

export class AiInboxAssistService {
  constructor(
    private readonly queryService = new QueryService(),
    private readonly quickReplyService = new QuickReplyService()
  ) {}

  async assist(authUser: AuthUser, input: AiInboxAssistInput): Promise<AiInboxAssistResult> {
    const [messages, conversations, quickReplies] = await Promise.all([
      this.queryService.listMessages(authUser, input.organizationId, input.conversationId),
      this.queryService.listConversations(authUser, input.organizationId),
      this.quickReplyService.list(authUser, { organizationId: input.organizationId, activeOnly: true })
    ]);
    const conversation = conversations.find((item) => item.id === input.conversationId) ?? null;
    const recentMessages = messages.filter((message) => !message.is_deleted).slice(-20);
    const fallback = buildFallbackResult(input, recentMessages, quickReplies);

    if (!env.DEEPSEEK_API_KEY) {
      return fallback;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

    try {
      const model = getDeepSeekModel();
      const response = await fetch(deepSeekChatCompletionsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(input, recentMessages, quickReplies, conversation),
          thinking: { type: "disabled" },
          temperature: 0.3,
          max_tokens: 900,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status, action: input.action, deepSeekError: await readDeepSeekErrorSummary(response) },
          "DeepSeek inbox assist request failed"
        );
        return fallback;
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        usage?: DeepSeekUsage;
      };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return fallback;
      }

      const parsed = JSON.parse(content) as DeepSeekInboxJson;

      return {
        success: true,
        action: input.action,
        intent: normalizeIntent(parsed.intent, fallback.intent),
        summary: normalizeNullableString(parsed.summary, fallback.summary),
        suggestedReplies: normalizeSuggestedReplies(parsed.suggestedReplies, fallback.suggestedReplies),
        quickReplyMatches: normalizeQuickReplyMatches(parsed.quickReplyMatches, quickReplies, fallback.quickReplyMatches),
        recommendedAction: normalizeNullableString(parsed.recommendedAction, fallback.recommendedAction),
        review: normalizeReview(parsed.review, fallback.review),
        provider: "deepseek",
        usage: normalizeDeepSeekUsage(data.usage, data.model ?? model)
      };
    } catch (error) {
      logger.warn(
        { action: input.action, error: error instanceof Error ? error.name : "unknown" },
        "DeepSeek inbox assist fell back"
      );
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildMessages(
  input: AiInboxAssistInput,
  recentMessages: MessageRecord[],
  quickReplies: QuickReplyTemplate[],
  conversation: ConversationRecord | null
) {
  const quickReplyContext = quickReplies.slice(0, 30).map((template) => ({
    templateId: template.id,
    title: template.title,
    category: template.category,
    body: template.body
  }));

  return [
    {
      role: "system",
      content: [
        "You are an AI assistant inside a Malaysian WhatsApp CRM.",
        "Use Bahasa Melayu Malaysia by default.",
        "Do not use Bahasa Indonesia.",
        "Do not auto-send.",
        "Do not invent prices, promotions, discounts, stock availability, guarantees, deadlines, eligibility, approval status, or fake urgency.",
        "Only use facts found in the supplied conversation, draft, templates, and CRM context.",
        "If information is missing, ask one clear follow-up question.",
        "Keep replies short, natural, and WhatsApp-friendly.",
        "Return JSON only.",
        "Supported intent labels are pricing, coverage_check, interested, document_request, complaint, follow_up, not_interested, unknown.",
        "For match_quick_reply, only return templateIds from supplied templates.",
        "For check_reply, do not rewrite unless a suggested correction is useful."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        action: input.action,
        tone: input.tone ?? "friendly",
        draft: input.draft ?? "",
        conversation: conversation
          ? {
              contactName: getConversationString(conversation, "contact_name"),
              phoneNumber: getConversationString(conversation, "phone_number_normalized"),
              channel: conversation.channel,
              lastMessageAt: conversation.last_message_at
            }
          : null,
        recentMessages: recentMessages.map((message) => ({
          direction: message.direction,
          messageType: message.message_type,
          text: message.content_text,
          sentAt: message.sent_at
        })),
        quickReplies: quickReplyContext,
        expectedJsonShape: {
          intent: {
            label: "pricing | coverage_check | interested | document_request | complaint | follow_up | not_interested | unknown",
            confidence: "number between 0 and 1",
            sentiment: "positive | neutral | negative",
            urgency: "low | medium | high"
          },
          summary: "string or null",
          suggestedReplies: [{ label: "string", body: "string", confidence: "number between 0 and 1" }],
          quickReplyMatches: [{ templateId: "string", title: "string", confidence: "number between 0 and 1" }],
          recommendedAction: "string or null",
          review: {
            spamRisk: "low | medium | high",
            readability: "easy | medium | hard",
            ctaClarity: "good | unclear | missing",
            warnings: ["string"],
            tips: ["string"]
          }
        }
      })
    }
  ];
}

function buildFallbackResult(
  input: AiInboxAssistInput,
  recentMessages: MessageRecord[],
  quickReplies: QuickReplyTemplate[]
): AiInboxAssistResult {
  const lastIncoming = [...recentMessages].reverse().find((message) => message.direction === "incoming" && message.content_text);
  const contextText = recentMessages.map((message) => message.content_text ?? "").join(" ");
  const draft = input.draft?.trim() ?? "";
  const intent = detectFallbackIntent(`${contextText} ${draft}`);
  const matchedTemplates = matchQuickReplies(`${lastIncoming?.content_text ?? ""} ${draft}`, quickReplies);
  const review = buildFallbackReview(draft);
  const suggestedBody =
    input.action === "rewrite_draft" && draft
      ? improveFallbackDraft(draft, input.tone)
      : input.action === "check_reply"
        ? null
        : buildFallbackSuggestedReply(lastIncoming?.content_text ?? "", intent.label);

  return {
    success: true,
    action: input.action,
    intent,
    summary: buildFallbackSummary(lastIncoming?.content_text ?? "", intent.label),
    suggestedReplies: suggestedBody ? [{ label: "Cadangan ringkas", body: suggestedBody, confidence: 0.58 }] : [],
    quickReplyMatches: matchedTemplates,
    recommendedAction: getRecommendedAction(intent.label),
    review,
    provider: "fallback",
    usage: {
      model: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      creditUnits: 0
    }
  };
}

function getConversationString(conversation: ConversationRecord, key: string) {
  const value = (conversation as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function detectFallbackIntent(text: string): AiInboxIntent {
  const normalized = text.toLowerCase();
  const rules: Array<[AiInboxIntentLabel, RegExp]> = [
    ["pricing", /\b(harga|price|pricing|pakej|package|berapa|kos|bayar)\b/i],
    ["coverage_check", /\b(coverage|cover|kawasan|alamat|area|semak|check)\b/i],
    ["document_request", /\b(ic|mykad|ssm|dokumen|document|slip|bil|bill)\b/i],
    ["complaint", /\b(complaint|aduan|marah|problem|masalah|lambat|tak puas)\b/i],
    ["not_interested", /\b(tak minat|not interested|jangan|stop|berhenti)\b/i],
    ["follow_up", /\b(follow up|update|status|bila|dah semak)\b/i],
    ["interested", /\b(minat|interested|nak|mahu|boleh|yes|ya)\b/i]
  ];
  const match = rules.find(([, pattern]) => pattern.test(normalized));
  const label = match?.[0] ?? "unknown";
  const urgency = /\b(urgent|segera|cepat|hari ini|asap)\b/i.test(normalized) ? "high" : label === "complaint" ? "medium" : "low";
  const sentiment = label === "complaint" || label === "not_interested" ? "negative" : label === "interested" ? "positive" : "neutral";

  return {
    label,
    confidence: label === "unknown" ? 0.35 : 0.66,
    sentiment,
    urgency
  };
}

function buildFallbackSuggestedReply(lastIncomingText: string, label: AiInboxIntentLabel) {
  if (!lastIncomingText.trim()) {
    return "Salam, boleh saya bantu semak maklumat lanjut untuk anda?";
  }

  if (label === "pricing") {
    return "Salam, boleh saya bantu semak pakej yang sesuai. Boleh share alamat premis dulu ya?";
  }

  if (label === "coverage_check") {
    return "Salam, boleh share alamat penuh premis? Saya bantu semak coverage dahulu.";
  }

  if (label === "document_request") {
    return "Baik, saya bantu semak dokumen yang diperlukan. Boleh kongsi maklumat yang berkaitan dahulu ya?";
  }

  if (label === "complaint") {
    return "Maaf atas kesulitan ini. Boleh kongsi sedikit detail masalah supaya saya boleh bantu semak langkah seterusnya?";
  }

  if (label === "not_interested") {
    return "Baik, terima kasih kerana maklumkan. Jika perlukan bantuan kemudian, boleh mesej kami semula ya.";
  }

  return "Salam, terima kasih kerana mesej. Boleh saya bantu semak maklumat lanjut untuk anda?";
}

function improveFallbackDraft(draft: string, tone: AiInboxAssistInput["tone"]) {
  const normalized = draft
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/!{2,}/g, "!")
    .trim();

  if (tone === "professional") {
    return normalized.replace(/\bboss\b/gi, "tuan/puan").replace(/\bnak\b/gi, "ingin");
  }

  if (tone === "concise" && normalized.length > 280) {
    return normalized.slice(0, 277).trimEnd() + "...";
  }

  return normalized;
}

function buildFallbackSummary(lastIncomingText: string, label: AiInboxIntentLabel) {
  if (!lastIncomingText.trim()) {
    return "Belum cukup konteks mesej pelanggan untuk ringkasan yang tepat.";
  }

  return `Pelanggan nampak berkaitan ${label.replace(/_/g, " ")}. Cadangan: ${getRecommendedAction(label) ?? "balas dengan satu soalan susulan yang jelas"}.`;
}

function getRecommendedAction(label: AiInboxIntentLabel) {
  const map: Record<AiInboxIntentLabel, string> = {
    pricing: "ask_for_address",
    coverage_check: "ask_for_full_address",
    interested: "qualify_interest",
    document_request: "clarify_required_document",
    complaint: "acknowledge_and_collect_details",
    follow_up: "share_status_or_next_step",
    not_interested: "acknowledge_opt_out",
    unknown: "ask_one_follow_up_question"
  };

  return map[label];
}

function matchQuickReplies(text: string, quickReplies: QuickReplyTemplate[]) {
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));

  return quickReplies
    .map((template) => {
      const haystack = [template.title, template.category ?? "", template.body].join(" ").toLowerCase();
      const hits = Array.from(words).filter((word) => haystack.includes(word)).length;
      return {
        templateId: template.id,
        title: template.title,
        confidence: Math.min(0.9, hits / Math.max(3, words.size))
      };
    })
    .filter((match) => match.confidence > 0)
    .sort((first, second) => second.confidence - first.confidence)
    .slice(0, 3);
}

function buildFallbackReview(draft: string): AiInboxReview {
  const warnings: string[] = [];
  const tips: string[] = [];
  const normalized = draft.trim();

  if (!normalized) {
    tips.push("Tulis draft dahulu untuk semakan yang lebih tepat.");
  }

  if (normalized.length > 700) {
    warnings.push("Draft agak panjang untuk WhatsApp.");
  }

  if ((normalized.match(/!/g) ?? []).length > 2) {
    warnings.push("Tanda seru terlalu banyak boleh nampak memaksa.");
  }

  const hasCta = /\b(balas|share|kongsi|hantar|semak|reply|call|hubungi)\b/i.test(normalized);

  return {
    spamRisk: /\b(guarantee|jamin|limited|urgent|free|percuma)\b/i.test(normalized) ? "medium" : "low",
    readability: normalized.length > 700 ? "hard" : normalized.length > 350 ? "medium" : "easy",
    ctaClarity: hasCta ? "good" : normalized ? "unclear" : "missing",
    warnings,
    tips
  };
}

function normalizeIntent(value: DeepSeekInboxJson["intent"], fallback: AiInboxIntent): AiInboxIntent {
  return {
    label: isIntentLabel(value?.label) ? value.label : fallback.label,
    confidence: normalizeConfidence(value?.confidence, fallback.confidence),
    sentiment: value?.sentiment === "positive" || value?.sentiment === "neutral" || value?.sentiment === "negative" ? value.sentiment : fallback.sentiment,
    urgency: value?.urgency === "low" || value?.urgency === "medium" || value?.urgency === "high" ? value.urgency : fallback.urgency
  };
}

function normalizeSuggestedReplies(value: unknown, fallback: AiInboxAssistResult["suggestedReplies"]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const entry = item as Record<string, unknown>;
      const body = typeof entry.body === "string" ? entry.body.trim() : "";
      if (!body) {
        return null;
      }
      return {
        label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : "Cadangan",
        body,
        confidence: normalizeConfidence(entry.confidence, 0.6)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 3);
}

function normalizeQuickReplyMatches(
  value: unknown,
  quickReplies: QuickReplyTemplate[],
  fallback: AiInboxAssistResult["quickReplyMatches"]
) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const templatesById = new Map(quickReplies.map((template) => [template.id, template]));

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const entry = item as Record<string, unknown>;
      const templateId = typeof entry.templateId === "string" ? entry.templateId : "";
      const template = templatesById.get(templateId);
      if (!template) {
        return null;
      }
      return {
        templateId,
        title: template.title,
        confidence: normalizeConfidence(entry.confidence, 0.6)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 3);
}

function normalizeReview(value: DeepSeekInboxJson["review"], fallback: AiInboxReview): AiInboxReview {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  return {
    spamRisk: value.spamRisk === "low" || value.spamRisk === "medium" || value.spamRisk === "high" ? value.spamRisk : fallback.spamRisk,
    readability: value.readability === "easy" || value.readability === "medium" || value.readability === "hard" ? value.readability : fallback.readability,
    ctaClarity: value.ctaClarity === "good" || value.ctaClarity === "unclear" || value.ctaClarity === "missing" ? value.ctaClarity : fallback.ctaClarity,
    warnings: normalizeStringArray(value.warnings, fallback.warnings),
    tips: normalizeStringArray(value.tips, fallback.tips)
  };
}

function normalizeNullableString(value: unknown, fallback: string | null) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 5);
}

function normalizeConfidence(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function isIntentLabel(value: unknown): value is AiInboxIntentLabel {
  return (
    value === "pricing" ||
    value === "coverage_check" ||
    value === "interested" ||
    value === "document_request" ||
    value === "complaint" ||
    value === "follow_up" ||
    value === "not_interested" ||
    value === "unknown"
  );
}

function getDeepSeekModel() {
  if (env.DEEPSEEK_MODEL === "deepseek-chat") {
    return "deepseek-v4-flash";
  }

  return env.DEEPSEEK_MODEL;
}

function normalizeDeepSeekUsage(usage: DeepSeekUsage | undefined, model: string): AiInboxAssistUsage {
  const promptTokens = normalizeTokenCount(usage?.prompt_tokens);
  const completionTokens = normalizeTokenCount(usage?.completion_tokens);
  const totalTokens = normalizeTokenCount(usage?.total_tokens) || promptTokens + completionTokens;

  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    creditUnits: totalTokens > 0 ? Math.max(1, Math.ceil(totalTokens / 1000)) : 0
  };
}

function normalizeTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

async function readDeepSeekErrorSummary(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: unknown; type?: unknown; code?: unknown }; message?: unknown };
    const message = typeof body.error?.message === "string" ? body.error.message : typeof body.message === "string" ? body.message : null;
    const type = typeof body.error?.type === "string" ? body.error.type : null;
    const code = typeof body.error?.code === "string" ? body.error.code : null;

    return { message, type, code };
  } catch {
    return null;
  }
}
