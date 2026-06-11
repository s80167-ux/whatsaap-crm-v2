import type {
  AudienceColumnMapping,
  AudienceColumnMappingSuggestion,
  AudienceColumnSuggestionConfidence,
  AudienceCsvField
} from "../types/audienceGroup.types";

export type AudienceColumnMappingStatus = "auto_matched" | "review_suggested" | "not_mapped" | "changed_manually";

export function buildAudienceMappingFromSuggestions(suggestions: AudienceColumnMappingSuggestion[]): AudienceColumnMapping {
  const mapping: AudienceColumnMapping = {};

  suggestions.forEach((suggestion) => {
    if (suggestion.sourceHeader) {
      mapping[suggestion.field] = suggestion.sourceHeader;
    }
  });

  return mapping;
}

export function resolveAudienceMappingChange(
  mapping: AudienceColumnMapping,
  field: AudienceCsvField,
  sourceHeader?: string
): { mapping: AudienceColumnMapping; clearedField?: AudienceCsvField } {
  const nextMapping: AudienceColumnMapping = { ...mapping };
  let clearedField: AudienceCsvField | undefined;

  if (!sourceHeader) {
    delete nextMapping[field];
    return { mapping: nextMapping };
  }

  for (const [mappedField, mappedHeader] of Object.entries(nextMapping) as [AudienceCsvField, string][]) {
    if (mappedField !== field && mappedHeader === sourceHeader) {
      delete nextMapping[mappedField];
      clearedField = mappedField;
      break;
    }
  }

  nextMapping[field] = sourceHeader;

  return { mapping: nextMapping, clearedField };
}

export function getAudienceMappingStatus(input: {
  field: AudienceCsvField;
  mapping: AudienceColumnMapping;
  suggestions: AudienceColumnMappingSuggestion[];
  manuallyChangedFields: Set<AudienceCsvField>;
}): AudienceColumnMappingStatus {
  const { field, mapping, suggestions, manuallyChangedFields } = input;
  if (manuallyChangedFields.has(field)) {
    return "changed_manually";
  }

  const suggestion = suggestions.find((item) => item.field === field);
  const mappedHeader = mapping[field];

  if (!mappedHeader) {
    return "not_mapped";
  }

  if (suggestion?.sourceHeader === mappedHeader) {
    return suggestion.confidence === "high" ? "auto_matched" : "review_suggested";
  }

  return "changed_manually";
}

export function getAudienceMappingSummary(input: {
  headers: string[];
  mapping: AudienceColumnMapping;
  suggestions: AudienceColumnMappingSuggestion[];
  manuallyChangedFields: Set<AudienceCsvField>;
}) {
  const { headers, mapping, suggestions, manuallyChangedFields } = input;
  const mappedFields = Object.values(mapping).filter(Boolean).length;
  const autoMatchedFields = suggestions.filter((suggestion) => suggestion.sourceHeader).length;
  const reviewedFields = suggestions.filter((suggestion) => suggestion.sourceHeader && suggestion.confidence !== "high").length;
  const changedFields = Array.from(manuallyChangedFields).filter((field) => Boolean(mapping[field]));

  return {
    mappedFields,
    totalHeaders: headers.length,
    autoMatchedFields,
    reviewedFields,
    changedFields,
    matchedFieldLabels: suggestions
      .filter((suggestion) => suggestion.sourceHeader)
      .map((suggestion) => titleCaseField(suggestion.field))
      .slice(0, 3)
  };
}

export function getSuggestionConfidenceLabel(confidence: AudienceColumnSuggestionConfidence) {
  if (confidence === "high") return "Auto-matched";
  if (confidence === "medium") return "Review suggested";
  return "Review suggested";
}

function titleCaseField(field: AudienceCsvField) {
  return field
    .split("_")
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}
