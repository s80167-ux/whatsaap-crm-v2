import { Button } from "../Button";
import type { AiMessageAction } from "../../api/ai";

const actions: Array<{ action: AiMessageAction; label: string; helper: string }> = [
  { action: "improve", label: "Improve", helper: "Kemaskan ayat tanpa ubah maksud." },
  { action: "shorten", label: "Shorten", helper: "Pendekkan mesej supaya lebih sesuai untuk WhatsApp." },
  { action: "friendly", label: "Friendly", helper: "Jadikan ayat lebih mesra." },
  { action: "professional", label: "Professional", helper: "Jadikan ayat lebih profesional tetapi natural." },
  { action: "check", label: "Check", helper: "Semak mesej sebelum dihantar." }
];

type AiAssistToolbarProps = {
  disabled: boolean;
  loadingAction: AiMessageAction | null;
  onAction: (action: AiMessageAction) => void;
};

export function AiAssistToolbar({ disabled, loadingAction, onAction }: AiAssistToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((item) => (
        <Button
          key={item.action}
          size="sm"
          variant="secondary"
          disabled={disabled || Boolean(loadingAction)}
          title={item.helper}
          onClick={() => onAction(item.action)}
        >
          {loadingAction === item.action ? "Checking..." : item.label}
        </Button>
      ))}
    </div>
  );
}
