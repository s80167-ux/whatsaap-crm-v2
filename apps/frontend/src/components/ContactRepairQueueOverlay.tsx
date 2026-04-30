import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Wrench, X } from "lucide-react";
import {
  approveContactRepairProposal,
  fetchContactRepairProposals,
  rejectContactRepairProposal,
  type ContactRepairProposal
} from "../api/admin";
import { Button } from "./Button";
import { PopupOverlay } from "./PopupOverlay";

type ActionNotice = {
  type: "success" | "error";
  title: string;
  message: string;
};

function getProposalLabel(proposal: ContactRepairProposal) {
  return proposal.contact_display_name || proposal.primary_phone_normalized || proposal.primary_phone_e164 || "Unnamed contact";
}

export function ContactRepairQueueOverlay({
  open,
  onClose,
  organizationId,
  preferredContactId,
  onChanged
}: {
  open: boolean;
  onClose: () => void;
  organizationId?: string | null;
  preferredContactId?: string | null;
  onChanged?: () => Promise<void> | void;
}) {
  const [items, setItems] = useState<ContactRepairProposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  async function load() {
    if (!organizationId) {
      setItems([]);
      setSelectedId(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchContactRepairProposals({
        organizationId,
        status: "pending"
      });
      setItems(data);
      const preferred = preferredContactId ? data.find((item) => item.contact_id === preferredContactId) : null;
      setSelectedId(preferred?.id ?? data[0]?.id ?? null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load repair proposals";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    void load();
  }, [open, organizationId, preferredContactId]);

  async function handleApprove() {
    if (!selected || !organizationId || actionLoading) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      await approveContactRepairProposal({
        proposalId: selected.id,
        organizationId
      });
      await load();
      await onChanged?.();
      setNotice({
        type: "success",
        title: "Repair applied",
        message: `${getProposalLabel(selected)} has been updated.`
      });
    } catch (approveError) {
      const message = approveError instanceof Error ? approveError.message : "Failed to approve repair";
      setError(message);
      setNotice({
        type: "error",
        title: "Repair failed",
        message
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!selected || !organizationId || actionLoading) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      await rejectContactRepairProposal({
        proposalId: selected.id,
        organizationId
      });
      await load();
      await onChanged?.();
      setNotice({
        type: "success",
        title: "Proposal rejected",
        message: `${getProposalLabel(selected)} was removed from the queue.`
      });
    } catch (rejectError) {
      const message = rejectError instanceof Error ? rejectError.message : "Failed to reject repair";
      setError(message);
      setNotice({
        type: "error",
        title: "Reject failed",
        message
      });
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <PopupOverlay
      open={open}
      onClose={onClose}
      title="Repair queue"
      description="Review pending contact repair proposals without leaving the contact dashboard."
      panelClassName="max-w-[min(40rem,calc(100vw-2rem))]"
    >
      {notice ? (
        <div
          className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-1">{notice.message}</p>
        </div>
      ) : null}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {organizationId ? `${items.length} pending proposal${items.length === 1 ? "" : "s"}` : "Select an organization first."}
        </p>
        <Button
          variant="secondary"
          className="px-3 py-2 text-xs"
          onClick={() => void load()}
          disabled={!organizationId || loading || actionLoading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span className="ml-2">Refresh queue</span>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-2xl border border-border bg-background-tint/60 p-3">
          {!organizationId ? (
            <p className="text-sm text-text-muted">Select an organization before reviewing repairs.</p>
          ) : loading ? (
            <p className="text-sm text-text-muted">Loading pending proposals...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-text-muted">No pending issues right now.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  selectedId === item.id
                    ? "border-primary bg-white shadow-soft"
                    : "border-border bg-white/80 hover:border-primary/30 hover:bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Wrench size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">{getProposalLabel(item)}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-text-muted">{item.reason}</p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">
                      Confidence {item.confidence}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-soft">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Repair preview</p>
                <h3 className="mt-2 text-lg font-semibold text-text">{getProposalLabel(selected)}</h3>
              </div>

              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-background-tint/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Reason</p>
                  <p className="mt-2 text-sm text-text">{selected.reason}</p>
                </div>
                <div className="rounded-xl border border-border bg-background-tint/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Proposed action</p>
                  <p className="mt-2 text-sm text-text">{selected.proposed_action}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-slate-950 p-3 text-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">Repair plan</p>
                <pre className="mt-3 overflow-x-auto text-xs leading-6 text-slate-100">
                  {JSON.stringify(selected.repair_plan, null, 2)}
                </pre>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button className="px-4 py-2 text-sm" onClick={handleApprove} disabled={actionLoading}>
                  <Check size={15} />
                  <span className="ml-2">{actionLoading ? "Processing..." : "Approve & apply"}</span>
                </Button>
                <Button
                  variant="secondary"
                  className="px-4 py-2 text-sm text-coral hover:text-coral"
                  onClick={handleReject}
                  disabled={actionLoading}
                >
                  <X size={15} />
                  <span className="ml-2">Reject</span>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Choose a pending proposal to inspect the repair plan.</p>
          )}
        </div>
      </div>
    </PopupOverlay>
  );
}
