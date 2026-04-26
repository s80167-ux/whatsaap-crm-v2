import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { apiGet } from "../lib/http";

export function SuperAdminAuditLogsPage() {
  const { isSuperAdmin, selectedOrganizationId } = useOutletContext<DashboardOutletContext>();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;

    setLoading(true);
    const query = selectedOrganizationId ? `?organization_id=${selectedOrganizationId}` : "";

    apiGet<{ data: any[] }>(`/super-admin/audit-logs${query}`)
      .then((res) => setLogs(res.data))
      .finally(() => setLoading(false));
  }, [isSuperAdmin, selectedOrganizationId]);

  if (!isSuperAdmin) return <div className="p-6">Access denied</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Audit Logs</h1>

      {loading && <div>Loading...</div>}

      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="border p-3 text-sm">
            <div className="font-medium">{log.action}</div>
            <div>Org: {log.organization_id}</div>
            <div>By: {log.actor_name || log.actor_auth_user_id}</div>
            <div>Time: {new Date(log.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
