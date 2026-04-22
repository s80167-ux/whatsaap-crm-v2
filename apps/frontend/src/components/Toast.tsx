type ToastProps = {
  message: string | null;
};

export function Toast({ message }: ToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-border bg-white px-4 py-3 shadow-[0_18px_50px_rgba(20,32,51,0.18)]">
      <p className="text-sm font-medium text-text">{message}</p>
    </div>
  );
}
