import { Select } from "../../../../components/Input";
import type { AudienceColumnMapping } from "../types/audienceGroup.types";
import { audienceCsvFields } from "../utils/audienceCsvValidation";

type AudienceColumnMappingStepProps = {
  headers: string[];
  mapping: AudienceColumnMapping;
  onChange: (mapping: AudienceColumnMapping) => void;
};

const labels: Record<(typeof audienceCsvFields)[number], string> = {
  name: "name",
  phone: "phone",
  gender: "gender",
  tag: "tag",
  location: "location",
  product_interest: "product_interest",
  customer_type: "customer_type",
  notes: "notes"
};

export function AudienceColumnMappingStep({ headers, mapping, onChange }: AudienceColumnMappingStepProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {audienceCsvFields.map((field) => (
          <label key={field} className="block">
            <span className="text-xs font-semibold text-text-muted">
              {labels[field]}
              {field === "phone" || field === "name" ? <span className="text-coral"> *</span> : null}
            </span>
            <Select
              className="mt-1 border-border bg-white px-3 py-2 text-text"
              value={mapping[field] ?? ""}
              onChange={(event) => onChange({ ...mapping, [field]: event.target.value || undefined })}
            >
              <option value="">Not mapped</option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
      {!mapping.phone ? <p className="text-sm text-coral">Map the phone column before validating contacts.</p> : null}
    </div>
  );
}
