import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageSquare, Megaphone, SlidersHorizontal } from "lucide-react";
import { Navigate, useOutletContext } from "react-router-dom";
import { updateOrganizationAccessLimits } from "../api/admin";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { Toast } from "../components/Toast";
import { useOrganizationAccessLimits, useOrganizations } from "../hooks/useAdmin";
import { getStoredUser } from "../lib/auth";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";

const historySyncOptions = [7, 30, 90, 365];

export function OrganizationAccessLimitsPage() {
  const user = getStoredUser();
  const isSuperAdmin = user?.role === "super_admin";
  const queryClient = useQueryClient();
  const { selectedOrganizationId, selectedOrganizationName } = useOutletContext<DashboardOutletContext>();
  const { data: organizations = [] } = useOrganizations();
  const accessLimitsQuery = useOrganizationAccessLimits(selectedOrganizationId || null, isSuperAdmin && Boolean(selectedOrganizationId));
  const accessLimits = accessLimitsQuery.data;
  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId]
  );
  const campaignsEnabled = accessLimits?.modules.find((module) => module.moduleKey === "campaigns")?.isEnabled ?? false;
  const [maxWhatsappAccounts, setMaxWhatsappAccounts] = useState("1");
  const [historySyncDays, setHistorySyncDays] = useState("7");
  const [maxUsers, setMaxUsers] = useState("");
  const [localCampaignsEnabled, setLocalCampaignsEnabled] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!accessLimits) {
      return;
    }

    setMaxWhatsappAccounts(String(accessLimits.limits.maxWhatsappAccounts));
    setHistorySyncDays(String(accessLimits.limits.historySyncDays));
    setMaxUsers(accessLimits.limits.maxUsers == null ? "" : String(accessLimits.limits.maxUsers));
    setLocalCampaignsEnabled(campaignsEnabled);
  }, [accessLimits, campaignsEnabled]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateOrganizationAccessLimits(selectedOrganizationId, {
        campaignsEnabled: localCampaignsEnabled,
        maxWhatsappAccounts: Number(maxWhatsappAccounts),
        historySyncDays: Number(historySyncDays),
        maxUsers: maxUsers.trim() ? Number(maxUsers) : null
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organization-access-limits", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaigns", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaigns", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-modules", selectedOrganizationId] })
      ]);
      setNotice({
        message: `Access and limits updated for ${selectedOrganizationName ?? "the selected organization"}.`,
        variant: "success"
      });
    },
    onError: (error) => {
      setNotice({
        message: error instanceof Error ? error.message : "Unable to update access and limits.",
        variant: "error"
      });
    }
  });

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!selectedOrganizationId) {
    return (
      <section className="space-y-6">
        <Card elevated>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Super Admin</p>
          <h2 className="mt-3 section-title">Organization Access & Limits</h2>
          <p className="mt-2 section-copy">Select an organization from the sidebar to manage access and limits.</p>
        </Card>
      </section>
    );
  }

  const currentUsage = accessLimits?.usage.whatsappAccounts ?? 0;
  const maxWhatsappValue = Number(maxWhatsappAccounts) || 0;

  return (
    <section className="space-y-6">
      <Card elevated className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Super Admin</p>
            <h2 className="mt-3 section-title">Organization Access & Limits</h2>
            <p className="mt-2 max-w-3xl section-copy">
              Manage default CRM access, optional modules, and organization-level usage limits from one place.
            </p>
          </div>
          <Button
            className="shrink-0"
            disabled={accessLimitsQuery.isLoading || updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            Save changes
          </Button>
        </div>
        {accessLimitsQuery.isError ? (
          <div className="border border-coral/20 bg-coral/10 px-4 py-3 text-sm font-medium text-coral">
            Unable to load access and limits for this organization.
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card elevated>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">
              <SlidersHorizontal size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Organization</p>
              <h3 className="mt-2 text-xl font-semibold text-text">{selectedOrganization?.name ?? selectedOrganizationName ?? "Selected organization"}</h3>
              {selectedOrganization?.status ? (
                <span className="mt-3 inline-flex border border-border bg-background-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">
                  {selectedOrganization.status}
                </span>
              ) : null}
            </div>
          </div>
        </Card>

        <Card elevated>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
              <MessageSquare size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Core Features</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold text-text">WhatsApp CRM</h3>
                <span className="inline-flex border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Available by default
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-text-muted">
                WhatsApp Inbox, account linking, QR pairing, contact sync, conversation sync, and message sending are core CRM features. Access is controlled through connection limits.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card elevated className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Limits</p>
          <h3 className="mt-2 text-xl font-semibold text-text">Usage controls</h3>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="text-sm font-semibold text-text">Max WhatsApp connections</span>
            <Input
              className="mt-2 border-border bg-white"
              min={0}
              max={20}
              type="number"
              value={maxWhatsappAccounts}
              onChange={(event) => setMaxWhatsappAccounts(event.target.value)}
            />
            <span className="mt-2 block text-xs leading-5 text-text-muted">Set 0 to prevent new WhatsApp account linking.</span>
            <span className={clsx("mt-2 block text-xs font-semibold", currentUsage >= maxWhatsappValue ? "text-coral" : "text-text-soft")}>
              Current usage: {currentUsage} / {maxWhatsappValue}
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-text">Historical sync days</span>
            <Select
              className="mt-2 border-border bg-white"
              value={historySyncDays}
              onChange={(event) => setHistorySyncDays(event.target.value)}
            >
              {historySyncOptions.map((option) => (
                <option key={option} value={option}>{option} days</option>
              ))}
            </Select>
            <span className="mt-2 block text-xs leading-5 text-text-muted">Default lookback window for historical WhatsApp sync.</span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-text">Max users</span>
            <Input
              className="mt-2 border-border bg-white"
              min={1}
              max={500}
              placeholder="No explicit limit"
              type="number"
              value={maxUsers}
              onChange={(event) => setMaxUsers(event.target.value)}
            />
            <span className="mt-2 block text-xs leading-5 text-text-muted">Leave blank for no explicit user cap.</span>
          </label>
        </div>
      </Card>

      <Card elevated>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">
                <Megaphone size={17} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Optional Modules</p>
                <h3 className="mt-1 text-xl font-semibold text-text">Campaigns</h3>
              </div>
              <span
                className={clsx(
                  "inline-flex border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                  localCampaignsEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-600"
                )}
              >
                {localCampaignsEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
              Enable WhatsApp customer campaign management for this organization.
            </p>
          </div>
          <Button
            variant={localCampaignsEnabled ? "secondary" : "primary"}
            disabled={accessLimitsQuery.isLoading || updateMutation.isPending}
            onClick={() => setLocalCampaignsEnabled((enabled) => !enabled)}
          >
            <CheckCircle2 size={16} />
            {localCampaignsEnabled ? "Enabled" : "Disabled"}
          </Button>
        </div>
      </Card>

      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} />
    </section>
  );
}
