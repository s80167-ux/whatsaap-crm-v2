import type { Placement } from "@floating-ui/react";

export type GuideStep = {
  id: string;
  title: string;
  description: string;
  target: string;
  placement?: Placement;
  optional?: boolean;
};

export type GuideDefinition = {
  id: string;
  label: string;
  page: string;
  steps: GuideStep[];
};

export type GuideRegistry = Record<string, GuideDefinition>;

export type GuideContextValue = {
  registry: GuideRegistry;
  activeGuideId: string | null;
  currentGuide: GuideDefinition | null;
  currentStepIndex: number;
  currentStep: GuideStep | null;
  isGuideActive: boolean;
  startGuide: (guideId: string) => void;
  stopGuide: () => void;
  nextStep: () => void;
  previousStep: () => void;
  completeCurrentGuide: () => void;
  isGuideCompleted: (guideId: string) => boolean;
  hasGuideStartedInSession: (guideId: string) => boolean;
};