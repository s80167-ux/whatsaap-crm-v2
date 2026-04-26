import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  fetchContactRepairProposals,
  approveContactRepairProposal,
  rejectContactRepairProposal,
  type ContactRepairProposal
} from "../api/admin";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";

type ActionNotice = {
  type: "success" | "error";
  title: string;
  message: string;
  redirectOnBackdrop?: boolean;
};

export function ContactRepairQueuePage() {
  const navigate = useNavigate();
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
  const [notice, setNotice] = useState<ActionNotice | null>(null);

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
      const message = err?.message || "Failed to load repair proposals";
      setError(message);
      setNotice({
        type: "error",
        title: "Unable to load repair queue",
        message
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [activeOrganizationId]);

  function closeNoticeFromBackdrop() {
    if (notice?.type === "success" && notice.redirectOnBackdrop) {
      navigate("/contacts");
      return;
    }

    setNotice(null);
  }

  async function approve() {
    if (!selected || !activeOrganizationId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const contactName = selected.contact_display_name || selected.primary_phone_normalized || "Selected contact";
      await approveContactRepairProposal({
        proposalId: selected.id,
        organizationId: activeOrganizationId
      });
      await load();
      setNotice({
        type: "success",
        title: "Repair applied successfully",
        message: `${contactName} has been repaired and updated. Click outside this popup to go to Contacts.`,
        redirectOnBackdrop: true
      });
    } catch (err: any) {
      const message = err?.message || "Failed to approve repair";
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

  async function reject() {
    if (!selected || !activeOrganizationId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const contactName = selected.contact_display_name || selected.primary_phone_normalized || "Selected contact";
      await rejectContactRepairProposal({
        proposalId: selected.id,
        organizationId: activeOrganizationId
      });
      await load();
      setNotice({
        type: "success",
        title: "Proposal rejected",
        message: `${contactName} repair proposal has been rejected.`
      });
    } catch (err: any) {
      const message = err?.message || "Failed to reject repair";
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
    <div className="relative grid grid-cols-[320px_1fr] gap-4 p-4">
      {notice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
          onClick={closeNoticeFromBackdrop}
        >
          <div
            className={`w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl ${
              notice.type === "success" ? "border-green-200" : "border-red-200"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                  notice.type === "success"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {notice.type === "success" ? "✓" : "!"}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-gray-900">{notice.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{notice.message}</p>
                {notice.type === "success" && notice.redirectOnBackdrop && (
                  <p className="mt-2 text-xs text-gray-400">Click backdrop to open Contacts.</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              {notice.type === "success" && notice.redirectOnBackdrop && (
                <button
                  type="button"
                  onClick={() => navigate("/contacts")}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Go to Contacts
                </button>
              )}
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
