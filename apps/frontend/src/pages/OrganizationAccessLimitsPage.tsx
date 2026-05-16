import clsx from "clsx";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, CheckCircle2, Gauge, MessageSquare, Megaphone, Sparkles, SlidersHorizontal } from "lucide-react";
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
  const aiMessageAssistEnabled = accessLimits?.modules.find((module) => module.moduleKey === "ai_message_assist")?.isEnabled ?? false;
  const [maxWhatsappAccounts, setMaxWhatsappAccounts] = useState("1");
  const [historySyncDays, setHistorySyncDays] = useState("7");
  const [maxUsers, setMaxUsers] = useState("");
  const [aiDailyCredits, setAiDailyCredits] = useState("100");
  const [aiMonthlyCredits, setAiMonthlyCredits] = useState("1000");
  const [localCampaignsEnabled, setLocalCampaignsEnabled] = useState(false);
  const [localAiMessageAssistEnabled, setLocalAiMessageAssistEnabled] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!accessLimits) {
      return;
    }

    setMaxWhatsappAccounts(String(accessLimits.limits.maxWhatsappAccounts));
    setHistorySyncDays(String(accessLimits.limits.historySyncDays));
    setMaxUsers(accessLimits.limits.maxUsers == null ? "" : String(accessLimits.limits.maxUsers));
    setAiDailyCredits(String(accessLimits.limits.aiDailyCredits ?? 100));
    setAiMonthlyCredits(String(accessLimits.limits.aiMonthlyCredits ?? 1000));
    setLocalCampaignsEnabled(campaignsEnabled);
    setLocalAiMessageAssistEnabled(aiMessageAssistEnabled);
  }, [accessLimits, campaignsEnabled, aiMessageAssistEnabled]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateOrganizationAccessLimits(selectedOrganizationId, {
        campaignsEnabled: localCampaignsEnabled,
        aiMessageAssistEnabled: localAiMessageAssistEnabled,
        maxWhatsappAccounts: Number(maxWhatsappAccounts),
        historySyncDays: Number(historySyncDays),
        maxUsers: maxUsers.trim() ? Number(maxUsers) : null,
        aiDailyCredits: Number(aiDailyCredits),
        aiMonthlyCredits: Number(aiMonthlyCredits)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organization-access-limits", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaigns", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaigns", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "ai_message_assist", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "ai_message_assist", "current"] }),
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

  const currentWhatsappUsage = accessLimits?.usage.whatsappAccounts ?? 0;
  const maxWhatsappValue = Number(maxWhatsappAccounts) || 0;
  const aiToday = accessLimits?.usage.ai?.today;
  const aiMonth = accessLimits?.usage.ai?.month;
  const aiDailyLimit = Number(aiDailyCredits) || 0;
  const aiMonthlyLimit = Number(aiMonthlyCredits) || 0;
  const whatsappUsageTone = getUsageAlertTone(currentWhatsappUsage, maxWhatsappValue);
  const aiTodayUsageTone = getUsageAlertTone(aiToday?.creditUnits ?? 0, aiDailyLimit);
  const aiMonthUsageTone = getUsageAlertTone(aiMonth?.creditUnits ?? 0, aiMonthlyLimit);
  const disabled = accessLimitsQuery.isLoading || updateMutation.isPending;

  return (
    <section className="space-y-4">
      <Card elevated className="!p-5 space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Super Admin</p>
            <h2 className="mt-2 section-title">Organization Access & Limits</h2>
            <p className="mt-1.5 max-w-3xl section-copy">
              Manage feature access, visible usage, and organization-level limits from one standard control page.
            </p>
          </div>
          <Button className="shrink-0" disabled={disabled} onClick={() => updateMutation.mutate()}>
            Save changes
          </Button>
        </div>
        {accessLimitsQuery.isError ? (
          <div className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            Unable to load access and limits for this organization.
          </div>
        ) : null}
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card elevated className="!p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">
              <SlidersHorizontal size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-soft">Organization</p>
              <h3 className="mt-1 text-base font-semibold text-text">{selectedOrganization?.name ?? selectedOrganizationName ?? "Selected organization"}</h3>
              {selectedOrganization?.status ? (
                <span className="mt-2 inline-flex border border-border bg-background-tint px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-soft">
                  {selectedOrganization.status}
                </span>
              ) : null}
            </div>
          </div>
        </Card>

        <Card elevated className="!p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">
              <Gauge size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-soft">Control Standard</p>
              <h3 className="mt-1 text-base font-semibold text-text">Access, usage, limits</h3>
              <p className="mt-1.5 text-xs leading-5 text-text-muted">
                Each feature uses the same pattern: status first, live usage second, editable quota last.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-soft">Feature Access & Usage</p>
        <h3 className="mt-1 text-lg font-semibold text-text">Organization feature controls</h3>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <FeatureControlCard
          title="WhatsApp CRM"
          category="Core Feature"
          description="Inbox, account linking, QR pairing, contact sync, conversation sync, and message sending."
          statusLabel="Available"
          statusTone="success"
          icon={<MessageSquare size={17} />}
          stats={[
            { label: "Connections", value: `${currentWhatsappUsage} / ${maxWhatsappValue}`, tone: whatsappUsageTone },
            { label: "Sync window", value: `${historySyncDays} days` }
          ]}
        />
        <FeatureControlCard
          title="Campaigns"
          category="Optional Module"
          description="WhatsApp customer campaign management for this organization."
          statusLabel={localCampaignsEnabled ? "Enabled" : "Disabled"}
          statusTone={localCampaignsEnabled ? "success" : "muted"}
          icon={<Megaphone size={17} />}
          action={
            <Button
              variant={localCampaignsEnabled ? "secondary" : "primary"}
              size="sm"
              disabled={disabled}
              onClick={() => setLocalCampaignsEnabled((enabled) => !enabled)}
            >
              <CheckCircle2 size={16} />
              {localCampaignsEnabled ? "Enabled" : "Disabled"}
            </Button>
          }
        />
        <FeatureControlCard
          title="AI Message Assist"
          category="Optional Module"
          description="DeepSeek-backed rewrite and review tools in campaign and template composers."
          statusLabel={localAiMessageAssistEnabled ? "Enabled" : "Disabled"}
          statusTone={localAiMessageAssistEnabled ? "success" : "muted"}
          icon={<Sparkles size={17} />}
          action={
            <Button
              variant={localAiMessageAssistEnabled ? "secondary" : "primary"}
              size="sm"
              disabled={disabled}
              onClick={() => setLocalAiMessageAssistEnabled((enabled) => !enabled)}
            >
              <CheckCircle2 size={16} />
              {localAiMessageAssistEnabled ? "Enabled" : "Disabled"}
            </Button>
          }
          stats={[
            { label: "Today", value: `${aiToday?.creditUnits ?? 0} / ${aiDailyLimit} credits`, tone: aiTodayUsageTone },
            { label: "This month", value: `${aiMonth?.creditUnits ?? 0} / ${aiMonthlyLimit} credits`, tone: aiMonthUsageTone },
            { label: "DeepSeek calls", value: String(aiMonth?.deepseekRequests ?? 0) },
            { label: "Tokens", value: formatNumber(aiMonth?.totalTokens ?? 0) }
          ]}
        />
      </div>

      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-soft">Limits & Quotas</p>
        <h3 className="mt-1 text-lg font-semibold text-text">Editable organization limits</h3>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card elevated className="!p-4 space-y-4">
          <FeatureSectionHeader icon={<MessageSquare size={17} />} title="WhatsApp and team limits" />
          <div className="grid gap-3 lg:grid-cols-3">
            <LimitField
              label="Max WhatsApp connections"
              description="Set 0 to prevent new WhatsApp account linking."
              value={maxWhatsappAccounts}
              min={0}
              max={20}
              onChange={setMaxWhatsappAccounts}
              usage={`${currentWhatsappUsage} / ${maxWhatsappValue}`}
              usageTone={currentWhatsappUsage >= maxWhatsappValue ? "danger" : "muted"}
            />
            <label className="block">
              <span className="text-sm font-medium text-text">Historical sync days</span>
              <Select
                className="mt-2 border-border bg-card"
                value={historySyncDays}
                onChange={(event) => setHistorySyncDays(event.target.value)}
              >
                {historySyncOptions.map((option) => (
                  <option key={option} value={option}>{option} days</option>
                ))}
              </Select>
              <span className="mt-2 block text-xs leading-5 text-text-muted">Default lookback window for historical WhatsApp sync.</span>
            </label>
            <LimitField
              label="Max users"
              description="Leave blank for no explicit user cap."
              value={maxUsers}
              min={1}
              max={500}
              placeholder="No explicit limit"
              onChange={setMaxUsers}
            />
          </div>
        </Card>

        <Card elevated className="!p-4 space-y-4">
          <FeatureSectionHeader icon={<Bot size={17} />} title="AI usage limits" />
          <div className="grid gap-3 sm:grid-cols-2">
            <LimitField
              label="Daily AI credits"
              description="Blocks AI requests after today's org usage reaches this number."
              value={aiDailyCredits}
              min={0}
              max={100000}
              onChange={setAiDailyCredits}
              usage={`${aiToday?.creditUnits ?? 0} used today`}
              usageTone={(aiToday?.creditUnits ?? 0) >= aiDailyLimit ? "danger" : "muted"}
            />
            <LimitField
              label="Monthly AI credits"
              description="Blocks AI requests after this month's org usage reaches this number."
              value={aiMonthlyCredits}
              min={0}
              max={1000000}
              onChange={setAiMonthlyCredits}
              usage={`${aiMonth?.creditUnits ?? 0} used this month`}
              usageTone={(aiMonth?.creditUnits ?? 0) >= aiMonthlyLimit ? "danger" : "muted"}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <UsageStat label="Requests today" value={formatNumber(aiToday?.requests ?? 0)} />
            <UsageStat label="Month requests" value={formatNumber(aiMonth?.requests ?? 0)} />
            <UsageStat label="Month tokens" value={formatNumber(aiMonth?.totalTokens ?? 0)} />
          </div>
        </Card>
      </div>

      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} onClose={() => setNotice(null)} />
    </section>
  );
}

function FeatureControlCard({
  action,
  category,
  description,
  icon,
  stats = [],
  statusLabel,
  statusTone,
  title
}: {
  action?: ReactNode;
  category: string;
  description: string;
  icon: ReactNode;
  stats?: Array<{ label: string; tone?: UsageAlertTone; value: string }>;
  statusLabel: string;
  statusTone: "success" | "muted";
  title: string;
}) {
  return (
    <Card elevated className="!p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">
              {icon}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-soft">{category}</p>
              <h3 className="mt-0.5 text-lg font-semibold leading-6 text-text">{title}</h3>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-text-muted">{description}</p>
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          {!action ? <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge> : null}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
      {stats.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {stats.map((stat) => (
            <UsageStat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function FeatureSectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">
        {icon}
      </span>
      <h3 className="text-base font-semibold text-text">{title}</h3>
    </div>
  );
}

function LimitField({
  description,
  label,
  max,
  min,
  onChange,
  placeholder,
  usage,
  usageTone = "muted",
  value
}: {
  description: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  placeholder?: string;
  usage?: string;
  usageTone?: "danger" | "muted";
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-text">{label}</span>
      <Input
        className="mt-2 border-border bg-card"
        min={min}
        max={max}
        placeholder={placeholder}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="mt-1.5 block text-xs leading-5 text-text-muted">{description}</span>
      {usage ? (
        <span className={clsx("mt-1.5 block text-xs font-medium", usageTone === "danger" ? "text-destructive" : "text-text-soft")}>
          Current usage: {usage}
        </span>
      ) : null}
    </label>
  );
}

function StatusBadge({ children, tone }: { children: ReactNode; tone: "success" | "muted" }) {
  return (
    <span
      className={clsx(
        "inline-flex min-h-[1.55rem] items-center border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]",
        tone === "success"
          ? "border-success/20 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
function UsageStat({ label, tone = "normal", value }: { label: string; tone?: UsageAlertTone; value: string }) {
  return (
    <div
      className={clsx(
        "border px-2.5 py-2",
        tone === "critical"
          ? "border-destructive/30 bg-destructive/10"
          : tone === "warning"
            ? "border-warning/30 bg-warning/10"
            : "border-border bg-background-tint"
      )}
    >
      <p
        className={clsx(
          "text-[10px] font-medium uppercase tracking-[0.1em]",
          tone === "critical"
            ? "text-destructive"
            : tone === "warning"
              ? "text-warning"
              : "text-text-soft"
        )}
      >
        {label}
      </p>
      <div className="mt-0.5 flex items-center gap-1.5">
        {tone !== "normal" ? <AlertTriangle size={14} className={tone === "critical" ? "text-destructive" : "text-warning"} /> : null}
        <p
          className={clsx(
            "text-sm font-semibold",
            tone === "critical"
              ? "font-bold text-destructive"
              : tone === "warning"
                ? "text-warning"
                : "text-text"
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

type UsageAlertTone = "normal" | "warning" | "critical";

function getUsageAlertTone(used: number, limit: number): UsageAlertTone {
  if (limit <= 0) {
    return "normal";
  }

  const ratio = used / limit;
  if (ratio >= 1) {
    return "critical";
  }

  if (ratio >= 0.8) {
    return "warning";
  }

  return "normal";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-MY").format(value);
}
