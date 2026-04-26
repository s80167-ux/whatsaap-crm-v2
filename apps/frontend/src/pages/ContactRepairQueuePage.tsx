import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  fetchContactRepairProposals,
  approveContactRepairProposal,
  rejectContactRepairProposal,
  type ContactRepairProposal
} from "../api/admin";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";

export function ContactRepairQueuePage() {
  const currentUser = getStoredUser();
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const isSuperAdmin = currentUser?.role === "super_admin";

  const activeOrganizationId = isSuperAdmin
    ? dashboardContext.selectedOrganizationId || null
    : currentUser?.organizationId ?? null;

  const [items, setItems] = useState<ContactRepairProposal[]>([]);
  const [selected, setSelected] = useState<ContactRepairProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!activeOrganizationId) {
      setItems([]);
      setSelected(null);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchContactRepairProposals({
        organizationId: activeOrganizationId,
        status: "pending"
      });
      setItems(data);
      setSelected(data[0] ?? null);
    } catch (err: any) {
      setError(err?.message || "Failed to load repair proposals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [activeOrganizationId]);

  async function approve() {
    if (!selected || !activeOrganizationId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      await approveContactRepairProposal({
        proposalId: selected.id,
        organizationId: activeOrganizationId
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to approve repair");
    } finally {
      setActionLoading(false);
    }
  }

  async function reject() {
    if (!selected || !activeOrganizationId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      await rejectContactRepairProposal({
        proposalId: selected.id,
        organizationId: activeOrganizationId
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to reject repair");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-[320px_1fr] gap-4 p-4">
      <div className="border rounded-xl p-3 space-y-2 overflow-y-auto max-h-[80vh]">
        {!activeOrganizationId ? (
          <p className="text-sm text-gray-400">Select organization first</p>
        ) : loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">No pending issues</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelected(item)}
              className={`p-3 rounded-lg cursor-pointer border ${
                selected?.id === item.id ? "bg-blue-50 border-blue-400" : ""
              }`}
            >
              <div className="font-semibold text-sm">
                {item.contact_display_name || item.primary_phone_normalized}
              </div>
              <div className="text-xs text-gray-500">{item.reason}</div>
              <div className="text-[10px] text-gray-400">{item.confidence}</div>
            </div>
          ))
        )}
      </div>

      <div className="border rounded-xl p-4">
        {selected ? (
          <>
            <h2 className="font-bold text-lg mb-2">Repair Preview</h2>

            {error && (
              <div className="mb-3 text-sm text-red-500">{error}</div>
            )}

            <div className="mb-3 text-sm">
              <b>Contact:</b>{" "}
              {selected.contact_display_name || selected.primary_phone_normalized}
            </div>

            <div className="mb-3">
              <b>Reason:</b> {selected.reason}
            </div>

            <div className="mb-3">
              <b>Proposed Action:</b> {selected.proposed_action}
            </div>

            <div className="mb-3">
              <b>Repair Plan:</b>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                {JSON.stringify(selected.repair_plan, null, 2)}
              </pre>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={approve}
                disabled={actionLoading}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              >
                {actionLoading ? "Processing..." : "Approve & Apply"}
              </button>

              <button
                onClick={reject}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </>
        ) : (
          <p>No proposal selected</p>
        )}
      </div>
    </div>
  );
}
