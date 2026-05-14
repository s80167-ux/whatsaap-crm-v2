import { AlertTriangle, CheckCircle2, Link2, ShieldOff, Users } from "lucide-react";
import type { AudienceValidationResult } from "../types/audienceGroup.types";

type AudienceValidationSummaryProps = {
  result: AudienceValidationResult | null;
};

export function AudienceValidationSummary({ result }: AudienceValidationSummaryProps) {
  if (!result) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted p-4 text-sm text-text-muted">
        Upload and map a CSV file to see validation results.
      </div>
    );
  }

  const metrics = [
    { label: "Total rows", value: result.totalRows, icon: <Users size={16} /> },
    { label: "Valid contacts", value: result.validContacts, icon: <CheckCircle2 size={16} /> },
    { label: "Invalid contacts", value: result.invalidContacts, icon: <AlertTriangle size={16} /> },
    { label: "Duplicates in CSV", value: result.duplicatesInCsv, icon: <AlertTriangle size={16} /> },
    { label: "Duplicates already in Audience Group", value: result.duplicatesInAudienceGroup, icon: <AlertTriangle size={16} /> },
    { label: "Linked CRM Contacts", value: result.linkedCrmContacts, icon: <Link2 size={16} /> },
    { label: "Opt-out blocked", value: result.optOutBlocked, icon: <ShieldOff size={16} /> }
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="app-card p-3 shadow-none">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-text-muted">{metric.label}</p>
              <span className="text-primary">{metric.icon}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-text">{metric.value}</p>
          </div>
        ))}
      </div>

      {result.warnings.length > 0 ? (
        <div className="rounded-2xl border border-warning/20 bg-warning/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-warning">Warnings</p>
          <ul className="mt-2 space-y-1 text-sm text-warning">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
