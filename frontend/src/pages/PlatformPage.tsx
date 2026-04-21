import { Card } from "../components/Card";
import { usePlatformAuditLogs, usePlatformHealth, usePlatformOrganizations, usePlatformUsage } from "../hooks/useDashboard";

export function PlatformPage() {
  const { data: organizations = [], isLoading: organizationsLoading } = usePlatformOrganizations();
  const { data: usage, isLoading: usageLoading } = usePlatformUsage();
  const { data: health, isLoading: healthLoading } = usePlatformHealth();
  const { data: auditLogs = [], isLoading: auditLogsLoading } = usePlatformAuditLogs();

  return (
    <section className="space-y-6">
      <Card elevated>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Platform</p>
        <h2 className="mt-3 section-title">Super admin overview</h2>
        <p className="mt-2 section-copy">Cross-tenant visibility for organization health, usage, and operational scale.</p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-4">
        <Card elevated>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Inbound</p>
          <p className="mt-4 text-4xl font-semibold text-text">{usage?.totals.inbound_messages ?? (usageLoading ? "..." : "0")}</p>
        </Card>
        <Card elevated>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Outbound</p>
          <p className="mt-4 text-4xl font-semibold text-text">{usage?.totals.outbound_messages ?? (usageLoading ? "..." : "0")}</p>
        </Card>
        <Card elevated>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Active contacts</p>
          <p className="mt-4 text-4xl font-semibold text-text">{usage?.totals.active_contacts ?? (usageLoading ? "..." : "0")}</p>
        </Card>
        <Card elevated>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Connected accounts</p>
          <p className="mt-4 text-4xl font-semibold text-text">{usage?.totals.connected_whatsapp_accounts ?? (usageLoading ? "..." : "0")}</p>
        </Card>
      </div>

      <Card elevated>
        <h3 className="text-lg font-semibold text-text">Organizations</h3>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white/80">
          <table className="min-w-full bg-white/80">
            <thead className="bg-background-tint text-left text-xs uppercase tracking-[0.2em] text-text-soft">
              <tr>
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Slug</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {organizationsLoading ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-text-muted" colSpan={4}>
                    Loading organizations...
                  </td>
                </tr>
              ) : (
                organizations.map((organization) => (
                  <tr key={organization.id} className="table-row text-sm text-text-muted">
                    <td className="px-5 py-4 font-medium text-text">{organization.name}</td>
                    <td className="px-5 py-4">{organization.slug}</td>
                    <td className="px-5 py-4 uppercase tracking-[0.16em] text-text-soft">{organization.status}</td>
                    <td className="px-5 py-4">{new Date(organization.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card elevated>
          <h3 className="text-lg font-semibold text-text">Connector accounts</h3>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white/80">
            <table className="min-w-full bg-white/80">
              <thead className="bg-background-tint text-left text-xs uppercase tracking-[0.2em] text-text-soft">
                <tr>
                  <th className="px-5 py-4">Account</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Owner</th>
                  <th className="px-5 py-4">Heartbeat</th>
                  <th className="px-5 py-4">Last session</th>
                </tr>
              </thead>
              <tbody>
                {healthLoading ? (
                  <tr>
                    <td className="px-5 py-6 text-sm text-text-muted" colSpan={5}>
                      Loading connector diagnostics...
                    </td>
                  </tr>
                ) : (
                  (health?.accounts ?? []).map((account) => (
                    <tr key={account.id} className="table-row text-sm text-text-muted">
                      <td className="px-5 py-4 font-medium text-text">{account.label ?? account.id}</td>
                      <td className="px-5 py-4 uppercase tracking-[0.16em] text-text-soft">{account.connection_status}</td>
                      <td className="px-5 py-4">{account.connector_owner_id ?? "--"}</td>
                      <td className="px-5 py-4">
                        {account.connector_heartbeat_at ? new Date(account.connector_heartbeat_at).toLocaleString() : "--"}
                      </td>
                      <td className="px-5 py-4">
                        {account.latest_session_connected_at
                          ? new Date(account.latest_session_connected_at).toLocaleString()
                          : account.latest_session_started_at
                            ? new Date(account.latest_session_started_at).toLocaleString()
                            : "--"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card elevated>
          <h3 className="text-lg font-semibold text-text">Recent connector events</h3>
          <div className="mt-4 space-y-3">
            {healthLoading ? (
              <p className="text-sm text-text-muted">Loading connector events...</p>
            ) : (
              (health?.recent_events ?? []).slice(0, 8).map((event, index) => (
                <div key={`${event.whatsapp_account_id}-${event.created_at}-${index}`} className="rounded-2xl border border-border bg-white/80 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-text">{event.event_type}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-text-soft">{event.severity ?? "info"}</p>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">{event.whatsapp_account_id}</p>
                  <p className="mt-2 text-xs text-text-muted">{new Date(event.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card elevated>
        <h3 className="text-lg font-semibold text-text">Recent audit logs</h3>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white/80">
          <table className="min-w-full bg-white/80">
            <thead className="bg-background-tint text-left text-xs uppercase tracking-[0.2em] text-text-soft">
              <tr>
                <th className="px-5 py-4">Action</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Entity</th>
                <th className="px-5 py-4">Organization</th>
                <th className="px-5 py-4">Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLogsLoading ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-text-muted" colSpan={5}>
                    Loading audit logs...
                  </td>
                </tr>
              ) : (
                auditLogs.slice(0, 12).map((log) => (
                  <tr key={log.id} className="table-row text-sm text-text-muted">
                    <td className="px-5 py-4 font-medium text-text">{log.action}</td>
                    <td className="px-5 py-4 uppercase tracking-[0.16em] text-text-soft">{log.actor_role ?? "--"}</td>
                    <td className="px-5 py-4">
                      {log.entity_type}
                      {log.entity_id ? `:${log.entity_id}` : ""}
                    </td>
                    <td className="px-5 py-4">{log.organization_id ?? "--"}</td>
                    <td className="px-5 py-4">{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
