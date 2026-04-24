import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";

type PopupOverlayProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  panelClassName?: string;
  showCloseButton?: boolean;
};

export function PopupOverlay({
  open,
  onClose,
  title,
  description,
  children,
  panelClassName,
  showCloseButton = true
}: PopupOverlayProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="popup-overlay fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close popup"
        className="popup-overlay__backdrop absolute inset-0"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={clsx(
          "popup-overlay__panel relative z-[1] max-h-[min(88vh,920px)] w-full overflow-hidden border border-border bg-white text-text shadow-[0_28px_80px_rgba(2,6,23,0.55)] backdrop-blur-2xl",
          panelClassName
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Popup window"}
      >
        {title || description || showCloseButton ? (
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              {title ? <p className="text-sm font-semibold tracking-[0.02em] text-text">{title}</p> : null}
              {description ? <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p> : null}
            </div>
            {showCloseButton ? (
              <button
                type="button"
                aria-label="Close popup"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background-tint text-text-soft transition hover:bg-white hover:text-text"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="max-h-[calc(min(88vh,920px)-4.5rem)] overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {children}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
