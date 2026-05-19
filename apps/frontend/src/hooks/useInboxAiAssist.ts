import { useState } from "react";
import { requestInboxAiAssist } from "../api/aiInbox";
import type { AiInboxAssistAction, AiInboxAssistResponse } from "../api/aiInbox";

export function useInboxAiAssist(input: {
  organizationId?: string | null;
  conversationId?: string | null;
}) {
  const [loadingAction, setLoadingAction] = useState<AiInboxAssistAction | null>(null);
  const [result, setResult] = useState<AiInboxAssistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: AiInboxAssistAction, options?: { draft?: string; tone?: "friendly" | "professional" | "concise" }) {
    if (!input.conversationId) {
      return null;
    }

    setLoadingAction(action);
    setError(null);

    try {
      const response = await requestInboxAiAssist({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        action,
        draft: options?.draft,
        tone: options?.tone
      });
      setResult(response);
      return response;
    } catch (error) {
      setError(error instanceof Error ? error.message : "AI Assist belum tersedia. Awak masih boleh terus tulis mesej seperti biasa.");
      return null;
    } finally {
      setLoadingAction(null);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    setLoadingAction(null);
  }

  return {
    loadingAction,
    result,
    error,
    runAction,
    reset
  };
}
