import React, { useState } from "react";
import axios from "axios";

export default function AuditLogPanel({ contactId }: { contactId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchLogs() {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/admin/audit-logs?entityType=contact&entityId=${contactId}`);
      setLogs(res.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button className="btn btn-secondary mb-2" onClick={fetchLogs} disabled={loading || !contactId}>
        {loading ? "Loading..." : "Show Audit Log"}
      </button>
      {error && <div className="text-red-600">Error: {error}</div>}
      {logs.length > 0 && (
        <div className="bg-gray-50 p-2 rounded text-xs max-h-64 overflow-y-auto">
          {logs.map((log, idx) => (
            <div key={log.id || idx} className="mb-2 border-b last:border-b-0 pb-2">
              <div><b>Action:</b> {log.action}</div>
              <div><b>When:</b> {log.created_at}</div>
              <div><b>By:</b> {log.actor_name || log.actor_auth_user_id}</div>
              <div><b>Before:</b> <pre>{JSON.stringify(log.metadata?.before, null, 2)}</pre></div>
              <div><b>After:</b> <pre>{JSON.stringify(log.metadata?.after, null, 2)}</pre></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
