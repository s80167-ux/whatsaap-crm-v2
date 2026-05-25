import { Button } from "../Button";
import type { AiMessageAction } from "../../api/ai";

const actionItems: Array<{ action: AiMessageAction; label: string; helper: string; loadingLabel?: string }> = [
  { action: "generate", label: "✨ Generate Message", helper: "Tukar point ringkas kepada template mesej.", loadingLabel: "Generating..." },
  { action: "improve", label: "Improve", helper: "Kemaskan ayat tanpa ubah maksud." },
  { action: "shorten", label: "Shorten", helper: "Pendekkan mesej supaya lebih sesuai untuk WhatsApp." },
  { action: "friendly", label: "Friendly", helper: "Jadikan ayat lebih mesra." },
  { action: "professional", label: "Professional", helper: "Jadikan ayat lebih profesional tetapi natural." },
  { action: "check", label: "📊 WhatsApp Score", helper: "Semak mesej sebelum dihantar." }
];

type AiAssistToolbarProps = {
  actions?: AiMessageAction[];
  disabled?: boolean;
  disabledActions?: AiMessageAction[];
  loadingAction: AiMessageAction | null;
  onAction: (action: AiMessageAction) => void;
};

export function AiAssistToolbar({ actions, disabled = false, disabledActions = [], loadingAction, onAction }: AiAssistToolbarProps) {
  const visibleActions = actions ?? ["improve", "shorten", "friendly", "professional", "check"];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actionItems.filter((item) => visibleActions.includes(item.action)).map((item) => (
        <Button
          key={item.action}
          size="sm"
          variant="secondary"
          disabled={disabled || disabledActions.includes(item.action) || Boolean(loadingAction)}
          title={item.helper}
          onClick={() => onAction(item.action)}
        >
          {loadingAction === item.action ? item.loadingLabel ?? "Checking..." : item.label}
        </Button>
      ))}
    </div>
  );
}
