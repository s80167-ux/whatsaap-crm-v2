import type { ReactNode } from "react";
import { Check } from "lucide-react";

const steps = ["Template Info", "Message Content", "Personalization", "Review"];

export function TemplateWizardSteps({ currentStep }: { currentStep: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isComplete = currentStep > stepNumber;
        const isActive = currentStep === stepNumber;

        return (
          <div
            key={step}
            className={`app-card flex items-center gap-3 px-3 py-3 ${
              isActive ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center border text-xs font-semibold ${
              isComplete || isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-text-muted"
            }`}>
              {isComplete ? <Check size={14} /> : stepNumber}
            </span>
            <span className={`text-xs font-semibold ${isActive ? "text-primary" : "text-text-muted"}`}>{step}</span>
          </div>
        );
      })}
    </div>
  );
}

export function WizardField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">{label}</span>
      <div className="mt-2">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-text-muted">{hint}</span> : null}
    </label>
  );
}
