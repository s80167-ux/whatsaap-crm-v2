type ToastProps = {
  message: string | null;
  variant?: "success" | "error";
};

export function Toast({ message, variant = "success" }: ToastProps) {
  if (!message) {
    return null;
  }

  const tone =
    variant === "error"
      ? "border-coral/20 bg-coral/10 text-coral"
      : "border-emerald-200 bg-white text-text";

  return (
    <div
      className={`pointer-events-none fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border px-4 py-3 shadow-[0_18px_50px_rgba(20,32,51,0.18)] ${tone}`}
    >
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
