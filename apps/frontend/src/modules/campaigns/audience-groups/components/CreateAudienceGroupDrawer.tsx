import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { listCampaignOptOuts } from "../../../../api/campaignSafety";
import { Button } from "../../../../components/Button";
import { Input, Select } from "../../../../components/Input";
import { PopupOverlay } from "../../../../components/PopupOverlay";
import type {
  AudienceColumnMapping,
  AudienceColumnMappingSuggestion,
  AudienceCsvField,
  AudienceGroup,
  AudienceSourceType,
  AudienceValidationResult
} from "../types/audienceGroup.types";
import { audienceSourceOptions } from "../types/audienceGroup.types";
import {
  parseAudienceCsv,
  suggestAudienceColumnMapping,
  validateAudienceRows
} from "../utils/audienceCsvValidation";
import { buildAudienceMappingFromSuggestions, resolveAudienceMappingChange } from "../utils/audienceColumnMapping";
import {
  createAudienceGroup,
  fetchCrmPhoneLookup,
  importAudienceContacts
} from "../services/audienceGroupService";
import { AudienceColumnMappingStep } from "./AudienceColumnMappingStep";
import { AudienceCsvUploadStep } from "./AudienceCsvUploadStep";
import { AudienceErrorReportButton } from "./AudienceErrorReportButton";
import { AudienceValidationSummary } from "./AudienceValidationSummary";

type CreateAudienceGroupDrawerProps = {
  open: boolean;
  organizationId?: string | null;
  onClose: () => void;
  onCreated: (group: AudienceGroup, result: AudienceValidationResult) => void;
  onNotice: (message: string, variant?: "success" | "error") => void;
};

const steps = [
  "Group Details",
  "Upload CSV",
  "Column Mapping",
  "Validate Contacts",
  "Review Summary",
  "Confirm Import"
];

export function CreateAudienceGroupDrawer({
  open,
  organizationId,
  onClose,
  onCreated,
  onNotice
}: CreateAudienceGroupDrawerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState<AudienceSourceType>("not_sure");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ReturnType<typeof parseAudienceCsv>["rows"]>([]);
  const [mapping, setMapping] = useState<AudienceColumnMapping>({});
  const [mappingSuggestions, setMappingSuggestions] = useState<AudienceColumnMappingSuggestion[]>([]);
  const [manuallyChangedFields, setManuallyChangedFields] = useState<Set<AudienceCsvField>>(new Set());
  const [result, setResult] = useState<AudienceValidationResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const canContinue = useMemo(() => {
    if (stepIndex === 0) {
      return name.trim().length > 0;
    }

    if (stepIndex === 1) {
      return rows.length > 0;
    }

    if (stepIndex === 2) {
      return Boolean(mapping.phone);
    }

    if (stepIndex === 3) {
      return Boolean(mapping.phone) && rows.length > 0;
    }

    if (stepIndex === 4 || stepIndex === 5) {
      return Boolean(result);
    }

    return true;
  }, [mapping.phone, name, result, rows.length, stepIndex]);

  function reset() {
    setStepIndex(0);
    setName("");
    setDescription("");
    setSourceType("not_sure");
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setMappingSuggestions([]);
    setManuallyChangedFields(new Set());
    setResult(null);
    setIsBusy(false);
  }

  function closeDrawer() {
    reset();
    onClose();
  }

  function handleCsvLoaded(nextFileName: string, content: string) {
    const parsed = parseAudienceCsv(content);

    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      onNotice("CSV must include a header row and at least one contact row.", "error");
      return;
    }

    const suggested = suggestAudienceColumnMapping(parsed.headers, parsed.rows);

    setFileName(nextFileName);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(buildAudienceMappingFromSuggestions(suggested.suggestions));
    setMappingSuggestions(suggested.suggestions);
    setManuallyChangedFields(new Set());
    setResult(null);
  }

  function handleMappingChange(field: AudienceCsvField, sourceHeader?: string) {
    const resolved = resolveAudienceMappingChange(mapping, field, sourceHeader);
    setMapping(resolved.mapping);
    setManuallyChangedFields((current) => new Set(current).add(field));
    setResult(null);

    if (resolved.clearedField) {
      onNotice(
        `Moved "${sourceHeader}" to ${field.replace(/_/g, " ")} and cleared it from ${resolved.clearedField.replace(/_/g, " ")}.`,
        "success"
      );
    }
  }

  async function runValidation() {
    if (!mapping.phone) {
      onNotice("Map the phone column before validating contacts.", "error");
      return;
    }

    setIsBusy(true);

    try {
      const crmPhones = await fetchCrmPhoneLookup(organizationId);
      const optOuts = await listCampaignOptOuts({ organizationId, limit: 5000 });
      const validationResult = validateAudienceRows({
        headers,
        rows,
        mapping,
        crmPhones,
        optedOutPhones: new Set(optOuts.map((item) => item.normalized_phone))
      });
      setResult(validationResult);
      setStepIndex(4);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to validate CSV.", "error");
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmImport() {
    if (!result) {
      return;
    }

    setIsBusy(true);

    try {
      const group = await createAudienceGroup({
        name: name.trim(),
        description: description.trim() || null,
        organizationId,
        sourceType,
        permissionStatus: "not_verified_by_system",
        riskLevel: audienceSourceOptions.find((option) => option.value === sourceType)?.riskLevel ?? "high",
        totalRows: result.totalRows,
        validCount: result.validContacts,
        invalidCount: result.invalidContacts,
        duplicateCount: result.duplicatesInCsv + result.duplicatesInAudienceGroup,
        optOutCount: result.optOutBlocked,
        suppressedCount: result.suppressedContacts,
        linkedCrmCount: result.linkedCrmContacts
      });

      const imported = await importAudienceContacts({
        audienceGroupId: group.id,
        organizationId,
        contacts: result.contacts
      });

      onCreated(imported, result);
      reset();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to import Audience Group.", "error");
    } finally {
      setIsBusy(false);
    }
  }

  function goNext() {
    if (stepIndex === 3) {
      void runValidation();
      return;
    }

    if (stepIndex === 5) {
      void confirmImport();
      return;
    }

    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  return (
    <PopupOverlay
      open={open}
      onClose={closeDrawer}
      title="Create Audience Group"
      description="Upload, map, validate, and import recipients before campaign creation."
      panelClassName="max-w-[min(58rem,calc(100vw-2rem))]"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {steps.map((step, index) => (
            <span
              key={step}
              className={`inline-flex items-center border px-2.5 py-1 text-xs font-semibold ${
                index === stepIndex ? "border-primary bg-primary/5 text-primary" : "border-border bg-background-tint text-text-soft"
              }`}
            >
              {index + 1}. {step}
            </span>
          ))}
        </div>

        {stepIndex === 0 ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-text-muted">Audience Group Name</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 border-border bg-card px-3 py-2 text-text"
                placeholder="Example: Raya VIP Customers"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-text-muted">Description optional</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="input-base mt-1 min-h-24 border-border bg-card px-3 py-2 text-text"
                placeholder="Short note for your team"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-text-muted">Declared Audience Source</span>
              <Select value={sourceType} onChange={(event) => setSourceType(event.target.value as AudienceSourceType)} className="mt-1">
                {audienceSourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-xs leading-5 text-text-muted">
                Permission for this uploaded audience cannot be verified by the system. Please declare the source so we can recommend safer campaign settings.
              </p>
            </label>
          </div>
        ) : null}

        {stepIndex === 1 ? <AudienceCsvUploadStep fileName={fileName} onCsvLoaded={handleCsvLoaded} /> : null}

        {stepIndex === 2 ? (
          <AudienceColumnMappingStep
            headers={headers}
            mapping={mapping}
            suggestions={mappingSuggestions}
            manuallyChangedFields={manuallyChangedFields}
            onChange={handleMappingChange}
          />
        ) : null}

        {stepIndex === 3 ? (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">Run validation before import. Invalid, duplicate, and opted-out rows will not become active recipients.</p>
            <div className="border border-border bg-background-tint p-4">
              <p className="text-sm font-semibold text-text">Ready to validate {rows.length} CSV rows.</p>
              <p className="mt-1 text-sm text-text-muted">
                Validation will normalize phone numbers, detect duplicates, link existing CRM Contacts when possible, and exclude invalid or suppressed recipients from the sendable list.
              </p>
              <div className="mt-3 grid gap-2 text-xs text-text-muted sm:grid-cols-2">
                <span className="border border-border bg-card px-3 py-2">Phone column: {mapping.phone ?? "Not mapped"}</span>
                <span className="border border-border bg-card px-3 py-2">Name column: {mapping.name ?? "Not mapped"}</span>
                <span className="border border-border bg-card px-3 py-2">Permission: Not verified by system</span>
                <span className="border border-border bg-card px-3 py-2">Source: {audienceSourceOptions.find((option) => option.value === sourceType)?.label ?? "Not sure"}</span>
              </div>
            </div>
          </div>
        ) : null}

        {stepIndex === 4 ? (
          <div className="space-y-4">
            <AudienceValidationSummary result={result} />
            <div className="border border-border bg-background-tint p-4 text-sm leading-6 text-text-muted">
              <p className="font-semibold text-text">Audience Upload Review</p>
              <p className="mt-2">Permission: Not verified by system</p>
              <p>Declared source: {audienceSourceOptions.find((option) => option.value === sourceType)?.label ?? "Not sure"}</p>
              <p>Audience risk: {(audienceSourceOptions.find((option) => option.value === sourceType)?.riskLevel ?? "high").toUpperCase()}</p>
              <p>Previously suppressed / opted-out numbers: {result?.suppressedContacts ?? 0}</p>
            </div>
            <AudienceErrorReportButton result={result} />
          </div>
        ) : null}

        {stepIndex === 5 ? (
          <div className="space-y-4">
            <AudienceValidationSummary result={result} />
            <div className="border border-border bg-background-tint p-3">
              <p className="text-sm font-semibold text-text">Audience will be saved for campaign use only.</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Invalid, duplicate, and previously suppressed numbers stay excluded from the sendable list. Admins can sync contact identity later from the action icon in each Audience Group row.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <Button variant="secondary" onClick={() => setStepIndex((current) => Math.max(current - 1, 0))} disabled={stepIndex === 0 || isBusy}>
            <ArrowLeft size={16} />
            Back
          </Button>
          <Button onClick={goNext} disabled={!canContinue || isBusy}>
            {isBusy ? <Loader2 className="animate-spin" size={16} /> : stepIndex === steps.length - 1 ? <Check size={16} /> : <ArrowRight size={16} />}
            {stepIndex === 3 ? "Validate Contacts" : stepIndex === steps.length - 1 ? "Confirm Import" : "Continue"}
          </Button>
        </div>
      </div>
    </PopupOverlay>
  );
}
