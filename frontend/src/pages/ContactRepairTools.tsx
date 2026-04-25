
import React, { useState } from "react";
import axios from "axios";
import AuditLogPanel from "../components/AuditLogPanel";

export default function ContactRepairTools() {
  const [contactId, setContactId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRefresh(dryRun: boolean) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.post(`/admin/contacts/${contactId}/refresh`, {
        dry_run: dryRun,
        confirm: !dryRun
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCorrection(override: any, dryRun: boolean) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.post(`/admin/contacts/${contactId}/corrections/apply`, {
        override,
        dry_run: dryRun,
        confirm: !dryRun
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Contact Repair Tools</h2>
      <input
        className="border p-2 w-full mb-2"
        placeholder="Contact ID"
        value={contactId}
        onChange={e => setContactId(e.target.value)}
      />
      <div className="flex gap-2 mb-4">
        <button className="btn" disabled={loading || !contactId} onClick={() => handleRefresh(true)}>
          Preview Refresh
        </button>
        <button className="btn btn-primary" disabled={loading || !contactId} onClick={() => handleRefresh(false)}>
          Confirm Refresh
        </button>
      </div>
      <div className="flex gap-2 mb-4">
        <button
          className="btn"
          disabled={loading || !contactId}
          onClick={() => handleCorrection({ displayName: "Manual Name", lockAnchor: true, clearAvatar: false }, true)}
        >
          Preview Correction
        </button>
        <button
          className="btn btn-primary"
          disabled={loading || !contactId}
          onClick={() => handleCorrection({ displayName: "Manual Name", lockAnchor: true, clearAvatar: false }, false)}
        >
          Confirm Correction
        </button>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div className="text-red-600">Error: {error}</div>}
      {result && (
        <pre className="bg-gray-100 p-2 mt-2 overflow-x-auto text-xs">{JSON.stringify(result, null, 2)}</pre>
      )}

      {contactId && <AuditLogPanel contactId={contactId} />}
    </div>
  );
}
