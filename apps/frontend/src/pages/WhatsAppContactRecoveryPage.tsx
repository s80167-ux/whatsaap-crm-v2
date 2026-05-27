import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Card } from "../components/Card";
import { Select } from "../components/Input";
import { WhatsAppContactRecoveryPanel } from "../components/WhatsAppContactRecoveryPanel";
import { useOrganizations, useWhatsAppAccounts } from "../hooks/useAdmin";
import { getStoredUser } from "../lib/auth";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";

export function WhatsAppContactRecoveryPage() {
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const currentUser = getStoredUser();
  const isSuperAdmin = dashboardContext.isSuperAdmin;
  const selectedOrganizationId = isSuperAdmin
    ? dashboardContext.selectedOrganizationId
    : currentUser?.organizationId ?? "";
  const setSelectedOrganizationId = isSuperAdmin
    ? dashboardContext.setSelectedOrganizationId
    : (_organizationId: string) => {};
  const activeOrganizationId = isSuperAdmin ? selectedOrganizationId || null : currentUser?.organizationId ?? null;
  const { data: organizations = [] } = useOrganizations();
  const { data: accounts = [], isFetching } = useWhatsAppAccounts(activeOrganizationId);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
      return;
    }

    if (selectedAccountId && !accounts.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId(accounts[0]?.id ?? "");
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  return (
    <section className="space-y-6">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),340px] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Contact Recovery</p>
            <h2 className="mt-3 section-title">WhatsApp Contact Recovery</h2>
            <p className="section-copy mt-2">
              Run strict contact recovery, preview dry-run impact, and review audit logs for unknown or incomplete WhatsApp contacts.
            </p>
          </div>
          <div className="workspace-subtle p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Strict mode</p>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              High-confidence records are restored, medium-confidence records go to repair queue, and weak matches remain untouched.
            </p>
          </div>
        </div>
      </Card>

      <Card elevated className="workspace-block p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {isSuperAdmin ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Organization</p>
              <Select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>
                <option value="">Select organization</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </Select>
            </div>
          ) : null}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">WhatsApp account</p>
            <Select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} disabled={isFetching || accounts.length === 0}>
              <option value="">{isFetching ? "Loading accounts..." : "Select WhatsApp account"}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} {account.phone_number_normalized ? `(${account.phone_number_normalized})` : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {!activeOrganizationId ? (
          <p className="mt-4 rounded-xl border border-border bg-background-tint/60 px-4 py-4 text-sm text-text-soft">
            Select an organization to view WhatsApp accounts.
          </p>
        ) : null}

        {activeOrganizationId && accounts.length === 0 && !isFetching ? (
          <p className="mt-4 rounded-xl border border-border bg-background-tint/60 px-4 py-4 text-sm text-text-soft">
            No WhatsApp account found for this organization.
          </p>
        ) : null}
      </Card>

      {selectedAccount ? (
        <Card elevated className="workspace-block p-5 sm:p-6">
          <WhatsAppContactRecoveryPanel
            accountId={selectedAccount.id}
            accountName={selectedAccount.name}
          />
        </Card>
      ) : null}
    </section>
  );
}
