import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export type AiMessageSource = "campaign" | "template";
export type AiMessageAction = "improve" | "shorten" | "friendly" | "professional" | "check";
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
  language?: AiMessageLanguage;
  tone?: string;
  variables?: string[];
  campaignObjective?: string;
  templatePurpose?: string;
  audienceContext?: Record<string, unknown>;
};

export type AiMessageAssistResult = {
  success: true;
  source: AiMessageSource;
  action: AiMessageAction;
  suggestedMessage: string | null;
  review: AiMessageReview;
  provider: "deepseek" | "fallback";
};

type DeepSeekJson = {
  suggestedMessage?: unknown;
  review?: Partial<Record<keyof AiMessageReview, unknown>>;
};

const placeholderPattern = /\{\{[^}]+\}\}/g;
const deepSeekChatCompletionsUrl = "https://api.deepseek.com/chat/completions";

export async function callDeepSeekMessageAssist(input: AiMessageAssistInput): Promise<AiMessageAssistResult> {
  const fallback = fallbackReview(input.message, input.source, input.action);

  if (!env.DEEPSEEK_API_KEY) {
    return buildFallbackResult(input, fallback);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

  try {
    const response = await fetch(deepSeekChatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: getDeepSeekModel(),
        messages: buildMessages(input),
        thinking: { type: "disabled" },
        temperature: 0.4,
        max_tokens: 700,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorSummary = await readDeepSeekErrorSummary(response);
      logger.warn(
        { status: response.status, source: input.source, action: input.action, deepSeekError: errorSummary },
        "DeepSeek message assist request failed"
      );
      return buildFallbackResult(input, fallback);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return buildFallbackResult(input, fallback);
    }

    const parsed = JSON.parse(content) as DeepSeekJson;
    const suggestedMessage = input.action === "check" ? null : sanitizeSuggestion(parsed.suggestedMessage, input.message);

    return {
      success: true,
      source: input.source,
      action: input.action,
      suggestedMessage,
      review: normalizeReview(parsed.review, fallback),
      provider: "deepseek"
    };
  } catch (error) {
    logger.warn(
      {
        source: input.source,
        action: input.action,
        error: error instanceof Error ? error.name : "unknown"
      },
      "DeepSeek message assist fell back"
    );
    return buildFallbackResult(input, fallback);
  } finally {
    clearTimeout(timeout);
  }
}

export function fallbackReview(message: string, source: AiMessageSource, action: AiMessageAction = "check"): AiMessageReview {
  const warnings: string[] = [];
  const tips: string[] = [];
  const placeholders = message.match(placeholderPattern) ?? [];
  const exclamationCount = (message.match(/!/g) ?? []).length;
  const emojiCount = countEmoji(message);
  const spamHits = ["free", "percuma", "urgent", "limited time", "cepat", "sekarang juga", "guarantee", "jamin"].filter((term) =>
    message.toLowerCase().includes(term)
  ).length;
  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  const sentenceCount = Math.max(1, (message.match(/[.!?]/g) ?? []).length);
  const wordsPerSentence = wordCount / sentenceCount;

  if (message.length > 800) {
    warnings.push("Mesej agak panjang untuk WhatsApp.");
  }

  if (emojiCount > 4) {
    warnings.push("Emoji agak banyak dan boleh nampak kurang natural.");
  }

  if (exclamationCount > 2) {
    warnings.push("Tanda seru terlalu banyak boleh nampak seperti spam.");
  }

  if (hasBrokenPlaceholder(message)) {
    warnings.push("Semak placeholder. Ada corak variable yang mungkin tidak lengkap.");
  }

  const hasCta = /\b(reply|balas|hubungi|klik|call|whatsapp|mesej|pm|dm|daftar|booking|tempah)\b/i.test(message);

  if (source === "campaign" && !hasCta) {
    warnings.push("CTA kempen belum jelas.");
  }

  if (placeholders.length === 0) {
    tips.push("Pertimbangkan guna {{first_name}} supaya mesej nampak lebih personal.");
  }

  if (source === "template") {
    tips.push("Pastikan template kekal neutral supaya sesuai digunakan berulang kali.");
  }

  if (action === "shorten") {
    tips.push("Fokus kepada satu mesej utama dan satu CTA sahaja.");
  }

  if (action === "friendly") {
    tips.push("Guna nada mesra, tetapi elakkan emoji berlebihan.");
  }

  if (action === "professional") {
    tips.push("Pastikan ayat jelas, sopan, dan tidak terlalu menjual.");
  }

  const spamRisk = spamHits >= 3 || exclamationCount > 4 || emojiCount > 8 ? "high" : spamHits > 0 || exclamationCount > 2 || emojiCount > 4 ? "medium" : "low";
  const readability = wordsPerSentence > 24 || message.length > 1000 ? "hard" : wordsPerSentence > 16 || message.length > 600 ? "medium" : "easy";
  const ctaClarity = hasCta ? "good" : source === "campaign" ? "missing" : "unclear";

  return {
    spamRisk,
    readability,
    ctaClarity,
    warnings,
    tips
  };
}

function buildFallbackResult(input: AiMessageAssistInput, review: AiMessageReview): AiMessageAssistResult {
  return {
    success: true,
    source: input.source,
    action: input.action,
    suggestedMessage: buildFallbackSuggestion(input),
    review,
    provider: "fallback"
  };
}

function buildFallbackSuggestion(input: AiMessageAssistInput) {
  if (input.action === "check") {
    return null;
  }

  const normalized = normalizeMessageText(input.message);
  const greeting = getFallbackGreeting(input);
  const cta = input.source === "campaign" ? getCampaignCta(normalized) : "";

  if (input.action === "shorten") {
    return shortenMessage(normalized, input.source);
  }

  if (input.action === "friendly") {
    return joinMessageParts([
      ensureGreeting(normalized, greeting),
      input.source === "campaign" ? cta : ""
    ]);
  }

  if (input.action === "professional") {
    return joinMessageParts([
      ensureGreeting(normalized, greeting.replace("Hi", "Salam")),
      input.source === "campaign" ? cta.replace("Boleh", "Sila") : ""
    ]);
  }

  return joinMessageParts([
    ensureGreeting(normalized, greeting),
    input.source === "campaign" ? cta : ""
  ]);
}

function normalizeMessageText(message: string) {
  return message
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/!{2,}/g, "!")
    .trim();
}

function getFallbackGreeting(input: AiMessageAssistInput) {
  const existingPlaceholders: string[] = input.message.match(placeholderPattern) ?? [];
  const variables: string[] = input.variables ?? [];
  const preferredVariable = ["first_name", "name", "customer_name"].find((variable) =>
    variables.includes(variable) || existingPlaceholders.includes(`{{${variable}}}`)
  );

  return preferredVariable ? `Hi {{${preferredVariable}}},` : "Hi,";
}

function ensureGreeting(message: string, greeting: string) {
  if (/^(hi|hai|hello|salam|assalamualaikum)\b/i.test(message)) {
    return message;
  }

  return `${greeting} ${lowercaseFirstLetter(message)}`;
}

function lowercaseFirstLetter(message: string) {
  const firstLetterIndex = message.search(/[A-Za-z]/);

  if (firstLetterIndex < 0) {
    return message;
  }

  return `${message.slice(0, firstLetterIndex)}${message[firstLetterIndex].toLowerCase()}${message.slice(firstLetterIndex + 1)}`;
}

function getCampaignCta(message: string) {
  const hasCta = /\b(reply|balas|hubungi|klik|call|whatsapp|mesej|pm|dm|daftar|booking|tempah)\b/i.test(message);
  return hasCta ? "" : "Boleh balas mesej ini jika berminat.";
}

function shortenMessage(message: string, source: AiMessageSource) {
  const compact = message
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  if (compact.length <= 280) {
    return compact;
  }

  const sentenceMatch = compact.match(/^(.{1,280})(?:[.!?]\s|$)/);
  const shortened = sentenceMatch?.[1]?.trim() || compact.slice(0, 277).trim();
  return source === "campaign" ? joinMessageParts([shortened, getCampaignCta(shortened)]) : shortened;
}

function joinMessageParts(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n\n");
}

function buildMessages(input: AiMessageAssistInput) {
  const sourceRules =
    input.source === "campaign"
      ? "Source is campaign. Optimize for WhatsApp campaign sending. Check promotional clarity, CTA clarity, personalization, spam risk, and message length. Persuasive wording is allowed, but do not add fake urgency or invented offer details."
      : "Source is template. Optimize for reusable template wording. Keep wording neutral and suitable for repeated use. Avoid time-sensitive phrases unless they exist in the original message. Avoid campaign-style hard selling unless the original template is clearly promotional. Protect variables/placeholders carefully.";

  const actionRules: Record<AiMessageAction, string> = {
    improve: "Polish the message without changing meaning.",
    shorten: "Make it shorter and suitable for WhatsApp.",
    friendly: "Make it warmer and more friendly.",
    professional: "Make it more professional but still natural.",
    check: "Do not rewrite. suggestedMessage must be null. Only return review."
  };

  return [
    {
      role: "system",
      content: [
        "You are an AI writing assistant for a Malaysian WhatsApp CRM.",
        "Use Bahasa Melayu Malaysia by default.",
        "Do not use Bahasa Indonesia.",
        "Keep the message natural, concise, and WhatsApp-friendly.",
        "Do not invent prices, promotions, discounts, stock availability, guarantees, deadlines, or fake urgency.",
        "Preserve placeholders exactly, for example: {{first_name}}, {{name}}, {{business_name}}, {{phone}}, {{order_id}}.",
        "Do not remove or corrupt placeholders.",
        "Keep the original intent.",
        "Avoid spammy words, excessive emoji, excessive uppercase, and too many exclamation marks.",
        "Return json only with suggestedMessage and review.",
        "Example json output: {\"suggestedMessage\":\"Hi {{first_name}}, terima kasih kerana berminat.\",\"review\":{\"spamRisk\":\"low\",\"readability\":\"easy\",\"ctaClarity\":\"good\",\"warnings\":[],\"tips\":[]}}.",
        sourceRules,
        actionRules[input.action]
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        source: input.source,
        action: input.action,
        message: input.message,
        language: input.language ?? "ms-MY",
        tone: input.tone,
        variables: input.variables,
        campaignObjective: input.campaignObjective,
        templatePurpose: input.templatePurpose,
        audienceContext: input.audienceContext,
        expectedJsonShape: {
          suggestedMessage: input.action === "check" ? null : "string",
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

function getDeepSeekModel() {
  if (env.DEEPSEEK_MODEL === "deepseek-chat") {
    return "deepseek-v4-flash";
  }

  return env.DEEPSEEK_MODEL;
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

function sanitizeSuggestion(value: unknown, originalMessage: string) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === originalMessage.trim()) {
    return trimmed || null;
  }

  return trimmed;
}

function normalizeReview(review: DeepSeekJson["review"], fallback: AiMessageReview): AiMessageReview {
  if (!review || typeof review !== "object") {
    return fallback;
  }

  return {
    spamRisk: isSpamRisk(review.spamRisk) ? review.spamRisk : fallback.spamRisk,
    readability: isReadability(review.readability) ? review.readability : fallback.readability,
    ctaClarity: isCtaClarity(review.ctaClarity) ? review.ctaClarity : fallback.ctaClarity,
    warnings: normalizeStringArray(review.warnings, fallback.warnings),
    tips: normalizeStringArray(review.tips, fallback.tips)
  };
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 6);
}

function isSpamRisk(value: unknown): value is AiMessageReview["spamRisk"] {
  return value === "low" || value === "medium" || value === "high";
}

function isReadability(value: unknown): value is AiMessageReview["readability"] {
  return value === "easy" || value === "medium" || value === "hard";
}

function isCtaClarity(value: unknown): value is AiMessageReview["ctaClarity"] {
  return value === "good" || value === "unclear" || value === "missing";
}

function countEmoji(value: string) {
  return Array.from(value).filter((character) => /\p{Extended_Pictographic}/u.test(character)).length;
}

function hasBrokenPlaceholder(value: string) {
  return /\{\{[^}]*$/.test(value) || /^[^{]*\}\}/.test(value) || /\{\{[^}]*\{|\}[^}]*\}\}/.test(value);
}
