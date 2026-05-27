import { useQuery } from "@tanstack/react-query";
import { Button } from "./Button";
import type { WhatsAppContactRecoverySummary } from "../api/admin";
import {
  fetchWhatsAppContactRecoveryAudit,
  runWhatsAppContactRecovery,
  type WhatsAppContactRecoveryAuditLog
} from "../api/whatsAppContactRecovery";
import { useState } from "react";

type Props = {
  accountId: string;
  accountName: string;
  onClose?: () => void;
  onCompleted?: (summary: WhatsAppContactRecoverySummary, dryRun: boolean) => void;
};

function formatAction(action: string) {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuditTime(value?: string | null) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString();
}

function RecoverySummaryGrid({ summary }: { summary: WhatsAppContactRecoverySummary }) {
  const items = [
    ["Scanned", summary.scanned],
    ["Recovered", summary.recovered],
    ["Repair queue", summary.sentToRepairQueue],
    ["Profile jobs", summary.profilePictureJobsQueued],
    ["Skipped", summary.skipped],
    ["Errors", summary.errors]
  ];

  return (
    <div className="grid gap-2 text-sm text-text sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-border bg-background-tint/70 px-3 py-2">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-text-soft">{label}</p>
          <p className="mt-1 text-lg font-semibold text-text">{value}</p>
        </div>
      ))}
    </div>
  );
}

function AuditRow({ row }: { row: WhatsAppContactRecoveryAuditLog }) {
  return (
    <div className="rounded-xl border border-border bg-card/80 px-3 py-3 text-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-text">{formatAction(row.action)}</p>
          <p className="mt-1 text-text-soft">{row.source}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-semibold text-text">
            {typeof row.confidence_score === "number" ? `${row.confidence_score}%` : "No score"}
          </p>
          <p className="mt-1 text-text-soft">{formatAuditTime(row.created_at)}</p>
        </div>
      </div>
      {row.reason ? <p className="mt-2 leading-5 text-text-muted">{row.reason}</p> : null}
    </div>
  );
}

export function WhatsAppContactRecoveryPanel({ accountId, accountName, onClose, onCompleted }: Props) {
  const [summary, setSummary] = useState<WhatsAppContactRecoverySummary | null>(null);
  const [dryRunResult, setDryRunResult] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const auditQuery = useQuery({
    queryKey: ["whatsapp-contact-recovery-audit", accountId],
    queryFn: () => fetchWhatsAppContactRecoveryAudit(accountId, 20),
    enabled: Boolean(accountId)
  });

  async function runRecovery(dryRun: boolean) {
    setIsRunning(true);
    setNotice(null);
    try {
      const result = await runWhatsAppContactRecovery(accountId, { limit: 100, dryRun });
      setSummary(result.summary);
      setDryRunResult(result.dryRun);
      onCompleted?.(result.summary, result.dryRun);
      await auditQuery.refetch();
      setNotice(result.dryRun ? "Dry run complete. No contact was updated." : "Recovery complete. Review the summary and audit log below.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to run contact recovery");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="workspace-form-panel space-y-4 p-4">
      <div>
        <p className="text-sm leading-6 text-text-soft">
          Scan incomplete WhatsApp contacts for <strong>{accountName}</strong>. The resolver keeps strict matching: high-confidence results are restored, medium-confidence items go to repair queue, and low-confidence items are skipped.
        </p>
        {notice ? <p className="mt-3 text-sm text-text-muted">{notice}</p> : null}
      </div>

      {summary ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">{dryRunResult ? "Dry Run Summary" : "Recovery Summary"}</p>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
              {dryRunResult ? "Preview" : "Applied"}
            </span>
          </div>
          <RecoverySummaryGrid summary={summary} />
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-text">Recent Recovery Audit</p>
          <Button variant="ghost" size="sm" disabled={auditQuery.isFetching} onClick={() => auditQuery.refetch()}>
            {auditQuery.isFetching ? "Refreshing..." : "Refresh audit"}
          </Button>
        </div>
        {auditQuery.data?.length ? (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {auditQuery.data.map((row) => <AuditRow key={row.id} row={row} />)}
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-background-tint/60 px-3 py-4 text-sm text-text-soft">
            No recovery audit log yet for this account.
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={isRunning} onClick={onClose}>
          Close
        </Button>
        <Button variant="secondary" disabled={isRunning} onClick={() => runRecovery(true)}>
          {isRunning ? "Running..." : "Dry Run"}
        </Button>
        <Button disabled={isRunning} onClick={() => runRecovery(false)}>
          {isRunning ? "Recovering..." : "Run Recovery"}
        </Button>
      </div>
    </div>
  );
}
