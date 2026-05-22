import { createContext, useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GuideContextValue, GuideRegistry } from "./types";

export const GuideContext = createContext<GuideContextValue | null>(null);

function getGuideCompletedKey(guideId: string) {
  return `guide.completed.${guideId}`;
}

function getGuideSessionKey(guideId: string) {
  return `guide.started.${guideId}`;
}

export function GuideProvider({ children, registry }: { children: ReactNode; registry: GuideRegistry }) {
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentGuide = activeGuideId ? registry[activeGuideId] ?? null : null;
  const currentStep = currentGuide?.steps[currentStepIndex] ?? null;

  const isGuideCompleted = useCallback((guideId: string) => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(getGuideCompletedKey(guideId)) === "true";
  }, []);

  const hasGuideStartedInSession = useCallback((guideId: string) => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.sessionStorage.getItem(getGuideSessionKey(guideId)) === "true";
  }, []);

  const markGuideStartedInSession = useCallback((guideId: string) => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(getGuideSessionKey(guideId), "true");
  }, []);

  const markGuideCompleted = useCallback((guideId: string) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(getGuideCompletedKey(guideId), "true");
  }, []);

  const startGuide = useCallback((guideId: string) => {
    if (!registry[guideId]) {
      return;
    }

    markGuideStartedInSession(guideId);
    setActiveGuideId(guideId);
    setCurrentStepIndex(0);
  }, [markGuideStartedInSession, registry]);

  const stopGuide = useCallback(() => {
    setActiveGuideId(null);
    setCurrentStepIndex(0);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((current) => {
      if (!currentGuide) {
        return current;
      }

      return Math.min(current + 1, currentGuide.steps.length - 1);
    });
  }, [currentGuide]);

  const previousStep = useCallback(() => {
    setCurrentStepIndex((current) => Math.max(current - 1, 0));
  }, []);

  const completeCurrentGuide = useCallback(() => {
    if (activeGuideId) {
      markGuideCompleted(activeGuideId);
    }

    stopGuide();
  }, [activeGuideId, markGuideCompleted, stopGuide]);

  const value = useMemo<GuideContextValue>(() => ({
    registry,
    activeGuideId,
    currentGuide,
    currentStepIndex,
    currentStep,
    isGuideActive: Boolean(currentGuide && currentStep),
    startGuide,
    stopGuide,
    nextStep,
    previousStep,
    completeCurrentGuide,
    isGuideCompleted,
    hasGuideStartedInSession
  }), [activeGuideId, completeCurrentGuide, currentGuide, currentStep, currentStepIndex, hasGuideStartedInSession, isGuideCompleted, nextStep, previousStep, registry, startGuide, stopGuide]);

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}