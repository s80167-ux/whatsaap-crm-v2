import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  const shouldReduceMotion = useReducedMotion();

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

  const backdropTransition = shouldReduceMotion
    ? { duration: 0.16 }
    : { duration: 0.42, ease: [0.19, 1, 0.22, 1] as const };

  const panelTransition = shouldReduceMotion
    ? { duration: 0.18, ease: "easeOut" as const }
    : {
        opacity: { duration: 0.34, ease: [0.19, 1, 0.22, 1] as const },
        filter: { duration: 0.42, ease: [0.19, 1, 0.22, 1] as const },
        scale: { type: "spring" as const, stiffness: 170, damping: 24, mass: 1.08 },
        y: { type: "spring" as const, stiffness: 150, damping: 23, mass: 1.12 }
      };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="popup-overlay fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={backdropTransition}
        >
          <motion.button
            type="button"
            aria-label="Close popup"
            className="popup-overlay__backdrop absolute inset-0"
            onClick={onClose}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(0px) saturate(100%)" }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, filter: "blur(20px) saturate(145%)" }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(6px) saturate(115%)" }}
            transition={backdropTransition}
          />
          <motion.div
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 54, scale: 0.965, filter: "blur(18px)" }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 28, scale: 0.985, filter: "blur(10px)" }
            }
            transition={panelTransition}
            className={clsx(
              "popup-overlay__panel app-card relative z-[1] mt-auto max-h-[min(88vh,920px)] w-full overflow-hidden text-card-foreground shadow-[0_28px_80px_rgb(2_6_23/0.55)] sm:mt-0",
              panelClassName
            )}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? "Popup window"}
          >
            {title || description || showCloseButton ? (
              <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
                <div className="min-w-0">
                  {title ? <p className="text-sm font-semibold tracking-[0.02em] text-text">{title}</p> : null}
                  {description ? <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p> : null}
                </div>
                {showCloseButton ? (
                  <button
                    type="button"
                    aria-label="Close popup"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground transition hover:bg-card hover:text-foreground"
                    onClick={onClose}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="max-h-[calc(min(88vh,920px)-4.5rem)] overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
