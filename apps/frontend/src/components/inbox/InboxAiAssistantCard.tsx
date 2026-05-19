import { Bot, CheckCircle2, FileSearch, Lightbulb, ListChecks, PenLine, SearchCheck } from "lucide-react";
import { useEffect } from "react";
import { useAiMessageAssistModuleStatus } from "../../hooks/useAdmin";
import { useInboxAiAssist } from "../../hooks/useInboxAiAssist";
import type { AiInboxAssistAction } from "../../api/aiInbox";
import { Button } from "../Button";
import { InboxIntentBadge } from "./InboxIntentBadge";

type QuickReplyMatch = {
  id: string;
  title: string;
  body: string;
};

type InboxAiAssistantCardProps = {
  organizationId?: string | null;
  conversationId?: string | null;
  draft: string;
  quickReplies: QuickReplyMatch[];
  requestedAction?: AiInboxAssistAction | null;
  onRequestedActionHandled?: () => void;
  onUseReply: (body: string) => void;
  onUseQuickReply: (templateId: string) => void;
};

const actions: Array<{
  action: AiInboxAssistAction;
  label: string;
  icon: typeof Lightbulb;
  needsDraft?: boolean;
}> = [
  { action: "suggest_reply", label: "Suggest reply", icon: Lightbulb },
  { action: "detect_intent", label: "Detect intent", icon: SearchCheck },
  { action: "summarize", label: "Summarize", icon: ListChecks },
  { action: "match_quick_reply", label: "Find template", icon: FileSearch },
  { action: "rewrite_draft", label: "Improve draft", icon: PenLine, needsDraft: true },
  { action: "check_reply", label: "Check draft", icon: CheckCircle2, needsDraft: true }
];

export function InboxAiAssistantCard({
  organizationId,
  conversationId,
  draft,
  quickReplies,
  requestedAction,
  onRequestedActionHandled,
  onUseReply,
  onUseQuickReply
}: InboxAiAssistantCardProps) {
  const moduleStatusQuery = useAiMessageAssistModuleStatus(organizationId, Boolean(conversationId && organizationId));
  const { loadingAction, result, error, runAction, reset } = useInboxAiAssist({ organizationId, conversationId });
  const draftText = draft.trim();

  useEffect(() => {
    reset();
  }, [conversationId]);

  useEffect(() => {
    if (!requestedAction) {
      return;
    }

    void handleAction(requestedAction).finally(() => onRequestedActionHandled?.());
  }, [requestedAction]);

  if (!conversationId || !organizationId || moduleStatusQuery.isLoading || moduleStatusQuery.data?.isEnabled !== true) {
    return null;
  }

  async function handleAction(action: AiInboxAssistAction) {
    await runAction(action, {
      draft: draftText || undefined,
      tone: action === "rewrite_draft" ? "friendly" : "concise"
    });
  }

  return (
    <div className="rounded-lg border border-border bg-background-tint/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">
          <Bot className="h-4 w-4 text-primary" />
          AI Assist
        </div>
        <div className="flex flex-wrap gap-1.5">
          {actions.map((item) => {
            const Icon = item.icon;
            const disabled = Boolean(loadingAction) || Boolean(item.needsDraft && !draftText);
            return (
              <Button
                key={item.action}
                data-inbox-ai-action={item.action}
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => void handleAction(item.action)}
                className="min-h-8 gap-1.5 rounded-lg px-2 py-1 text-[11px]"
              >
                <Icon className="h-3.5 w-3.5" />
                {loadingAction === item.action ? "Thinking..." : item.label}
              </Button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
          AI Assist belum tersedia. Awak masih boleh terus tulis mesej seperti biasa.
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 space-y-3">
          {result.action === "detect_intent" ? (
            <InboxIntentBadge intent={result.intent} recommendedAction={result.recommendedAction} />
          ) : null}

          {result.action === "summarize" && result.summary ? (
            <div className="rounded-lg border border-border bg-card p-3 text-xs leading-5 text-text-muted">
              <p className="font-semibold text-foreground">Summary</p>
              <p className="mt-1">{result.summary}</p>
              {result.recommendedAction ? <p className="mt-2">Next: {result.recommendedAction.replace(/_/g, " ")}</p> : null}
            </div>
          ) : null}

          {(result.action === "suggest_reply" || result.action === "rewrite_draft" || result.action === "check_reply") &&
          result.suggestedReplies.length > 0 ? (
            <div className="grid gap-2">
              {result.suggestedReplies.map((suggestion) => (
                <div key={`${suggestion.label}:${suggestion.body}`} className="rounded-lg border border-border bg-card p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">{suggestion.label}</p>
                    <span className="text-text-soft">{Math.round(suggestion.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-5 text-text-muted">{suggestion.body}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-3 min-h-8 px-3 py-1.5 text-xs"
                    onClick={() => onUseReply(suggestion.body)}
                  >
                    Use reply
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {result.action === "check_reply" ? (
            <div className="rounded-lg border border-border bg-card p-3 text-xs leading-5 text-text-muted">
              <p className="font-semibold text-foreground">Draft check</p>
              <p className="mt-1">
                Spam: {result.review.spamRisk}. Readability: {result.review.readability}. CTA: {result.review.ctaClarity}.
              </p>
              {[...result.review.warnings, ...result.review.tips].slice(0, 4).map((item) => (
                <p key={item} className="mt-1">- {item}</p>
              ))}
            </div>
          ) : null}

          {result.action === "match_quick_reply" && result.quickReplyMatches.length > 0 ? (
            <div className="grid gap-2">
              {result.quickReplyMatches.map((match) => {
                const template = quickReplies.find((item) => item.id === match.templateId);
                return (
                  <div key={match.templateId} className="rounded-lg border border-border bg-card p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-foreground">{match.title}</p>
                      <span className="text-text-soft">{Math.round(match.confidence * 100)}%</span>
                    </div>
                    {template ? <p className="mt-2 line-clamp-2 leading-5 text-text-muted">{template.body}</p> : null}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-3 min-h-8 px-3 py-1.5 text-xs"
                      onClick={() => onUseQuickReply(match.templateId)}
                    >
                      Use template
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
