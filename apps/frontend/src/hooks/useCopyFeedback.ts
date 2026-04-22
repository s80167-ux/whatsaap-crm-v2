import { useEffect, useRef, useState } from "react";

export type CopyToastState =
  | {
      message: string;
      variant: "success" | "error";
    }
  | null;

export function useCopyFeedback() {
  const [toast, setToast] = useState<CopyToastState>(null);
  const timeoutRef = useRef<number | null>(null);

  function showToast(message: string, variant: "success" | "error") {
    setToast({ message, variant });

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setToast(null);
      timeoutRef.current = null;
    }, 2200);
  }

  async function copyText(input: { text: string; label?: string }) {
    const label = input.label ?? "Link";

    if (typeof window === "undefined" || !navigator.clipboard?.writeText) {
      showToast(`Unable to copy ${label.toLowerCase()}.`, "error");
      return false;
    }

    try {
      await navigator.clipboard.writeText(input.text);
      showToast(`${label} copied.`, "success");
      return true;
    } catch {
      showToast(`Unable to copy ${label.toLowerCase()}.`, "error");
      return false;
    }
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { toast, copyText };
}
