import type { AudienceTemplateVariable } from "../audience-groups/types/audienceGroup.types";
import { formatVariableToken } from "../utils/templateVariables";

export function DynamicVariablePanel({
  audienceSelected,
  isLoading,
  error,
  variables,
  invalidVariables,
  onInsert,
  onRetry
}: {
  audienceSelected: boolean;
  isLoading: boolean;
  error: string | null;
  variables: AudienceTemplateVariable[];
  invalidVariables: string[];
  onInsert: (token: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-background-tint px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Dynamic variables</p>

      {!audienceSelected ? (
        <p className="mt-2 text-sm text-text-muted">Select an Audience Group to view available variables.</p>
      ) : isLoading ? (
        <p className="mt-2 text-sm text-text-muted">Loading audience variables...</p>
      ) : error ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-muted">
          <span>{error}</span>
          <button type="button" className="font-semibold text-primary hover:text-primary-dark" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            {variables.map((variable) => {
              const token = formatVariableToken(variable.key);
              const details = [variable.label, variable.sampleValue ? `Sample: ${variable.sampleValue}` : ""]
                .filter(Boolean)
                .join("\n");

              return (
                <button
                  key={variable.key}
                  type="button"
                  title={details}
                  className="rounded-full border border-border bg-card px-3 py-1 text-text transition hover:border-primary/40 hover:text-primary"
                  onClick={() => onInsert(token)}
                >
                  {token}
                </button>
              );
            })}
          </div>

          {invalidVariables.length > 0 ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This message contains variables that are not available in the selected audience:{" "}
              {invalidVariables.map((key) => formatVariableToken(key)).join(", ")}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
