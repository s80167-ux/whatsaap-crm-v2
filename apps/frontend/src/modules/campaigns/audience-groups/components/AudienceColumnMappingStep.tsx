import React from "react";
import { Select } from "../../../../components/Input";
import type { AudienceColumnMapping, AudienceColumnMappingSuggestion, AudienceCsvField } from "../types/audienceGroup.types";
import {
  getAudienceMappingStatus,
  getAudienceMappingSummary,
  getSuggestionConfidenceLabel
} from "../utils/audienceColumnMapping";
import { audienceCsvFields } from "../utils/audienceCsvValidation";

type AudienceColumnMappingStepProps = {
  headers: string[];
  mapping: AudienceColumnMapping;
  suggestions: AudienceColumnMappingSuggestion[];
  manuallyChangedFields: Set<AudienceCsvField>;
  onChange: (field: AudienceCsvField, sourceHeader?: string) => void;
};

const labels: Record<(typeof audienceCsvFields)[number], string> = {
  name: "Name (optional)",
  phone: "Phone *",
  gender: "Gender",
  tag: "Tag",
  location: "Location",
  product_interest: "Product Interest",
  customer_type: "Customer Type",
  notes: "Notes"
};

const statusClassNames = {
  auto_matched: "border-emerald-200 bg-emerald-50 text-emerald-700",
  review_suggested: "border-amber-200 bg-amber-50 text-amber-700",
  not_mapped: "border-border bg-background-tint text-text-soft",
  changed_manually: "border-sky-200 bg-sky-50 text-sky-700"
} as const;

const statusLabels = {
  auto_matched: "Auto-matched",
  review_suggested: "Review suggested",
  not_mapped: "Not mapped",
  changed_manually: "Changed manually"
} as const;

export function AudienceColumnMappingStep({
  headers,
  mapping,
  suggestions,
  manuallyChangedFields,
  onChange
}: AudienceColumnMappingStepProps) {
  const summary = getAudienceMappingSummary({ headers, mapping, suggestions, manuallyChangedFields });

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background-tint p-3">
        <p className="text-sm font-semibold text-text">
          {summary.autoMatchedFields} of {summary.totalHeaders} columns matched automatically
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {summary.matchedFieldLabels.length > 0 ? `${summary.matchedFieldLabels.join(" and ")} matched.` : "No confident matches yet."}
          {" "}
          {summary.reviewedFields > 0 ? `${summary.reviewedFields} column${summary.reviewedFields === 1 ? "" : "s"} need your review.` : "Everything mapped looks ready to validate."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {audienceCsvFields.map((field) => (
          <MappingField
            key={field}
            field={field}
            headers={headers}
            mapping={mapping}
            suggestions={suggestions}
            manuallyChangedFields={manuallyChangedFields}
            onChange={onChange}
          />
        ))}
      </div>
      {!mapping.phone ? <p className="text-sm text-coral">Map the phone column before validating contacts.</p> : null}
    </div>
  );
}

type MappingFieldProps = {
  field: AudienceCsvField;
  headers: string[];
  mapping: AudienceColumnMapping;
  suggestions: AudienceColumnMappingSuggestion[];
  manuallyChangedFields: Set<AudienceCsvField>;
  onChange: (field: AudienceCsvField, sourceHeader?: string) => void;
};

function MappingField({ field, headers, mapping, suggestions, manuallyChangedFields, onChange }: MappingFieldProps) {
  const status = getAudienceMappingStatus({ field, mapping, suggestions, manuallyChangedFields });

  return (
    <label className="block">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-muted">{labels[field]}</span>
        <span className={`inline-flex items-center border px-2 py-0.5 text-[11px] font-medium ${statusClassNames[status]}`}>
          {statusLabels[status]}
        </span>
      </div>
      <Select
        className="mt-1 border-border bg-card px-3 py-2 text-text"
        value={mapping[field] ?? ""}
        onChange={(event) => onChange(field, event.target.value || undefined)}
      >
        <option value="">Not mapped</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </Select>
      {renderSuggestionHint(field, mapping, suggestions, manuallyChangedFields)}
    </label>
  );
}

function renderSuggestionHint(
  field: AudienceCsvField,
  mapping: AudienceColumnMapping,
  suggestions: AudienceColumnMappingSuggestion[],
  manuallyChangedFields: Set<AudienceCsvField>
) {
  const status = getAudienceMappingStatus({ field, mapping, suggestions, manuallyChangedFields });
  const suggestion = suggestions.find((item) => item.field === field);

  if (status === "changed_manually") {
    return <p className="mt-1 text-[11px] text-sky-700">Your selection is being kept for this CSV.</p>;
  }

  if (!suggestion?.sourceHeader) {
    return <p className="mt-1 text-[11px] text-text-soft">No safe automatic match was found.</p>;
  }

  return (
    <p className="mt-1 text-[11px] text-text-soft">
      {getSuggestionConfidenceLabel(suggestion.confidence)} from "{suggestion.sourceHeader}".
    </p>
  );
}
