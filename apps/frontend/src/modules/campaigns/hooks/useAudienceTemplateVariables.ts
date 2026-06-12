import { useEffect, useState } from "react";
import { fetchAudienceGroupTemplateVariables } from "../audience-groups/services/audienceGroupService";
import type {
  AudienceTemplateVariable,
  AudienceTemplateVariableKey
} from "../audience-groups/types/audienceGroup.types";

type AudienceTemplateVariablesState = {
  availableVariables: AudienceTemplateVariable[];
  sampleValues: Partial<Record<AudienceTemplateVariableKey, string>>;
  isLoading: boolean;
  error: string | null;
};

const emptyState: AudienceTemplateVariablesState = {
  availableVariables: [],
  sampleValues: {},
  isLoading: false,
  error: null
};

export function useAudienceTemplateVariables(audienceGroupId: string, organizationId?: string | null) {
  const [state, setState] = useState<AudienceTemplateVariablesState>(emptyState);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!audienceGroupId) {
      setState(emptyState);
      return () => {
        cancelled = true;
      };
    }

    setState({
      availableVariables: [],
      sampleValues: {},
      isLoading: true,
      error: null
    });

    void fetchAudienceGroupTemplateVariables(audienceGroupId, organizationId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setState({
          availableVariables: response.variables,
          sampleValues: response.sampleValues,
          isLoading: false,
          error: null
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({
          availableVariables: [],
          sampleValues: {},
          isLoading: false,
          error: "Unable to load variables for this audience."
        });
      });

    return () => {
      cancelled = true;
    };
  }, [audienceGroupId, organizationId, reloadKey]);

  return {
    ...state,
    retry: () => setReloadKey((current) => current + 1)
  };
}
