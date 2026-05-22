import {
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating
} from "@floating-ui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import type { GuideStep } from "./types";
import { useGuide } from "./useGuide";

const highlightClassNames = [
  "relative",
  "z-[55]",
  "ring-2",
  "ring-primary/35",
  "ring-offset-2",
  "ring-offset-background",
  "shadow-panel",
  "transition-[box-shadow,background-color,transform]",
  "duration-200",
  "ease-out"
] as const;

const CONTENT_SWAP_DELAY_MS = 90;

export function GuidePopover() {
  const { t } = useTranslation();
  const {
    completeCurrentGuide,
    currentGuide,
    currentStep,
    currentStepIndex,
    isGuideActive,
    nextStep,
    previousStep
  } = useGuide();
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const previousTargetRef = useRef<HTMLElement | null>(null);
  const positionFrameRef = useRef<number | null>(null);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [displayStep, setDisplayStep] = useState<GuideStep | null>(currentStep);
  const [isContentChanging, setIsContentChanging] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const { refs, floatingStyles, middlewareData, placement, update } = useFloating({
    open: isGuideActive,
    placement: currentStep?.placement ?? "bottom",
    strategy: "absolute",
    middleware: [offset(12), flip(), shift({ padding: 16 }), arrow({ element: arrowRef })],
    whileElementsMounted: autoUpdate
  });

  const hasTarget = Boolean(targetElement);
  const totalSteps = currentGuide?.steps.length ?? 0;
  const isLastStep = currentGuide ? currentStepIndex === currentGuide.steps.length - 1 : false;
  const side = placement.split("-")[0] as "top" | "right" | "bottom" | "left";
  const staticSide = side === "top" ? "bottom" : side === "right" ? "left" : side === "bottom" ? "top" : "right";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);

    return () => {
      mediaQuery.removeEventListener("change", syncPreference);
    };
  }, []);

  useEffect(() => {
    if (!currentStep) {
      setDisplayStep(null);
      setIsContentChanging(false);
      return;
    }

    if (!displayStep || displayStep.id === currentStep.id) {
      setDisplayStep(currentStep);
      setIsContentChanging(false);
      return;
    }

    if (prefersReducedMotion) {
      setDisplayStep(currentStep);
      setIsContentChanging(false);
      return;
    }

    setIsContentChanging(true);

    const timeoutId = window.setTimeout(() => {
      setDisplayStep(currentStep);
      window.requestAnimationFrame(() => {
        setIsContentChanging(false);
      });
    }, CONTENT_SWAP_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentStep, displayStep, prefersReducedMotion]);

  useEffect(() => {
    if (!isGuideActive || currentStep) {
      return;
    }

    setDisplayStep(null);
  }, [currentStep, isGuideActive]);

  function schedulePositionUpdate() {
    if (positionFrameRef.current != null) {
      return;
    }

    positionFrameRef.current = window.requestAnimationFrame(() => {
      positionFrameRef.current = null;
      void update();
    });
  }

  useEffect(() => {
    if (!isGuideActive || !currentStep) {
      if (previousTargetRef.current) {
        highlightClassNames.forEach((className) => previousTargetRef.current?.classList.remove(className));
        previousTargetRef.current = null;
      }
      setTargetElement(null);
      refs.setReference(null);
      return;
    }

    const target = document.querySelector(currentStep.target);
    const targetNode = target instanceof HTMLElement ? target : null;

    setTargetElement(targetNode);
    refs.setReference(targetNode);

    if (!targetNode) {
      return;
    }

    const previousTarget = previousTargetRef.current;
    targetNode.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
    highlightClassNames.forEach((className) => targetNode.classList.add(className));
    previousTargetRef.current = targetNode;

    const frameId = window.requestAnimationFrame(() => {
      if (previousTarget && previousTarget !== targetNode) {
        highlightClassNames.forEach((className) => previousTarget.classList.remove(className));
      }

      schedulePositionUpdate();
    });

    return () => {
      window.cancelAnimationFrame(frameId);

      if (previousTargetRef.current === targetNode) {
        highlightClassNames.forEach((className) => targetNode.classList.remove(className));
        previousTargetRef.current = null;
      }
    };
  }, [currentStep, isGuideActive, prefersReducedMotion, refs, update]);

  useEffect(() => {
    if (!isGuideActive || !hasTarget || !currentStep) {
      return;
    }

    const scrollParents = Array.from(document.querySelectorAll<HTMLElement>("main, .content-area, .page-content, .overflow-auto"));
    const uniqueParents = Array.from(new Set(scrollParents));
    const handlePositionUpdate = () => {
      schedulePositionUpdate();
    };

    const targetObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
        schedulePositionUpdate();
      });

    if (targetObserver && targetElement) {
      targetObserver.observe(targetElement);
    }

    window.addEventListener("scroll", handlePositionUpdate, true);
    window.addEventListener("resize", handlePositionUpdate);
    uniqueParents.forEach((parent) => parent.addEventListener("scroll", handlePositionUpdate, { passive: true }));

    return () => {
      targetObserver?.disconnect();
      window.removeEventListener("scroll", handlePositionUpdate, true);
      window.removeEventListener("resize", handlePositionUpdate);
      uniqueParents.forEach((parent) => parent.removeEventListener("scroll", handlePositionUpdate));
    };
  }, [currentStep, hasTarget, isGuideActive, targetElement, update]);

  useEffect(() => {
    return () => {
      if (positionFrameRef.current != null) {
        window.cancelAnimationFrame(positionFrameRef.current);
        positionFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const node = floatingRef.current;

    if (!node) {
      return;
    }

    if (!hasTarget) {
      node.style.position = "";
      node.style.left = "";
      node.style.top = "";
      node.style.transform = "";
      node.style.willChange = prefersReducedMotion ? "auto" : "transform, opacity";
      return;
    }

    node.style.position = typeof floatingStyles.position === "string" ? floatingStyles.position : "absolute";
    node.style.left = "0px";
    node.style.top = "0px";

    const scale = prefersReducedMotion ? 1 : isContentChanging ? 0.985 : 1;
    const baseTransform = typeof floatingStyles.transform === "string" && floatingStyles.transform.trim().length > 0
      ? floatingStyles.transform
      : `translate3d(${typeof floatingStyles.left === "number" ? floatingStyles.left : Number.parseFloat(String(floatingStyles.left ?? 0)) || 0}px, ${typeof floatingStyles.top === "number" ? floatingStyles.top : Number.parseFloat(String(floatingStyles.top ?? 0)) || 0}px, 0)`;

    node.style.transform = `${baseTransform} scale(${scale})`;
    node.style.willChange = prefersReducedMotion ? "auto" : "transform, opacity";
  }, [floatingStyles.left, floatingStyles.top, floatingStyles.transform, hasTarget, isContentChanging, prefersReducedMotion]);

  useEffect(() => {
    const arrowNode = arrowRef.current;

    if (!arrowNode || !hasTarget) {
      return;
    }

    arrowNode.style.left = middlewareData.arrow?.x != null ? `${middlewareData.arrow.x}px` : "";
    arrowNode.style.top = middlewareData.arrow?.y != null ? `${middlewareData.arrow.y}px` : "";
    arrowNode.style.right = "";
    arrowNode.style.bottom = "";
    arrowNode.style.setProperty(staticSide, "-6px");

    return () => {
      arrowNode.style.left = "";
      arrowNode.style.top = "";
      arrowNode.style.right = "";
      arrowNode.style.bottom = "";
      arrowNode.style.removeProperty("top");
      arrowNode.style.removeProperty("right");
      arrowNode.style.removeProperty("bottom");
      arrowNode.style.removeProperty("left");
      arrowNode.style.removeProperty(staticSide);
    };
  }, [hasTarget, middlewareData.arrow?.x, middlewareData.arrow?.y, staticSide]);

  function setFloatingNode(node: HTMLDivElement | null) {
    floatingRef.current = node;
    refs.setFloating(node);
  }

  if (!isGuideActive || !currentGuide || !currentStep || !displayStep) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-slate-950/14" />
      <div ref={setFloatingNode} className={hasTarget ? `pointer-events-auto z-[70] w-[min(22rem,calc(100vw-2rem))] rounded-[1.5rem] border border-border bg-card p-4 shadow-lift transform-gpu ease-out sm:p-5 ${prefersReducedMotion ? "transition-none" : "transition-[transform,opacity] duration-[220ms]"}` : `pointer-events-auto fixed right-4 top-4 z-[70] w-[min(22rem,calc(100vw-2rem))] rounded-[1.5rem] border border-border bg-card p-4 shadow-lift transform-gpu ease-out sm:p-5 ${prefersReducedMotion ? "transition-none" : "transition-[transform,opacity] duration-[220ms]"}`} role="dialog" aria-modal="false" aria-label={displayStep.title}>
        {hasTarget ? <div ref={arrowRef} className="absolute h-3 w-3 rotate-45 border border-border bg-card" /> : null}
        <div className={prefersReducedMotion ? "opacity-100" : `transform-gpu transition-[opacity,transform] duration-150 ease-out ${isContentChanging ? "opacity-0 scale-[0.985]" : "opacity-100 scale-100"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{currentGuide.label}</p>
          <h3 className="mt-2 text-lg font-semibold text-text">{displayStep.title}</h3>
          <p className="mt-2 text-sm leading-6 text-text-muted">{displayStep.description}</p>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs font-medium text-text-soft">
            <span>{t("guide.stepLabel", { current: currentStepIndex + 1, total: totalSteps })}</span>
            <button type="button" className="pointer-events-auto text-primary transition-opacity duration-200 ease-out hover:opacity-80" onClick={completeCurrentGuide}>{t("guide.actions.skip")}</button>
          </div>
          {!hasTarget ? <p className="mt-3 text-xs text-text-muted">{t("guide.fallback")}</p> : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="secondary" onClick={previousStep} disabled={currentStepIndex === 0}>
              <ChevronLeft size={14} /> {t("guide.actions.back")}
            </Button>
            {isLastStep ? (
              <Button size="sm" onClick={completeCurrentGuide}>{t("guide.actions.finish")}</Button>
            ) : (
              <Button size="sm" onClick={nextStep}>
                {t("guide.actions.next")} <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}