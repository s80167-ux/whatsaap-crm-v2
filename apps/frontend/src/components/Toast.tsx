import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

type ToastProps = {
  message: string | null;
  variant?: "success" | "error";
  onClose?: () => void;
};

export function Toast({ message, onClose, variant = "success" }: ToastProps) {
  const { t } = useTranslation();

  if (!message) {
    return null;
  }

  const tone =
    variant === "error"
      ? "border-destructive/20 bg-destructive/10 text-destructive"
      : "border-success/20 bg-card text-text";

  return (
    <div
      className={`fixed right-5 top-5 z-[1000] flex w-[min(calc(100vw-2rem),28rem)] items-start justify-between gap-3 rounded-xl border px-4 py-3 shadow-[0_18px_50px_rgba(20,32,51,0.18)] ${onClose ? "pointer-events-auto" : "pointer-events-none"} ${tone}`}
    >
      <p className="min-w-0 flex-1 break-words text-sm font-medium leading-5">{message}</p>
      {onClose ? (
        <button
          type="button"
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-current opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          aria-label={t("common.closeNotification")}
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
