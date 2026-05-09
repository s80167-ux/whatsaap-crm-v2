import { X } from "lucide-react";

type ToastProps = {
  message: string | null;
  variant?: "success" | "error";
  onClose?: () => void;
};

export function Toast({ message, onClose, variant = "success" }: ToastProps) {
  if (!message) {
    return null;
  }

  const tone =
    variant === "error"
      ? "border-coral/20 bg-coral/10 text-coral"
      : "border-emerald-200 bg-white text-text";

  return (
    <div
      className={`fixed bottom-5 right-5 z-[120] flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-[0_18px_50px_rgba(20,32,51,0.18)] ${onClose ? "pointer-events-auto" : "pointer-events-none"} ${tone}`}
    >
      <p className="text-sm font-medium">{message}</p>
      {onClose ? (
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-current opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          aria-label="Close notification"
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
