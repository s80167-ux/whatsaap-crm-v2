import clsx from "clsx";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Gauge,
  Mail,
  Megaphone,
  MessageSquare,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users
} from "lucide-react";
import { Navigate, useOutletContext } from "react-router-dom";
import { updateOrganizationAccessLimits } from "../api/admin";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { Toast } from "../components/Toast";
import { useOrganizationAccessLimits, useOrganizations } from "../hooks/useAdmin";
import { getStoredUser } from "../lib/auth";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import type { ModuleKey } from "../types/modules";

const historySyncOptions = [7, 30, 90, 365];

type AccessFormState = {
  campaignEnabled: boolean;
  campaignWhatsAppEnabled: boolean;
  campaignEmailEnabled: boolean;
  aiMessageAssistEnabled: boolean;
  inboxEnabled: boolean;
  crmEnabled: boolean;
  salesEnabled: boolean;
  maxWhatsappAccounts: string;
  historySyncDays: string;
  maxUsers: string;
  aiDailyCredits: string;
  aiMonthlyCredits: string;
  campaignMonthlyCount: string;
  campaignRecipientsPerCampaign: string;
  campaignTemplatesCount: string;
  campaignAudienceSegments: string;
  campaignScheduledCount: string;
  campaignWhatsAppMessagesPerDay: string;
  campaignWhatsAppMessagesPerMonth: string;
  campaignWhatsAppRecipientsPerBroadcast: string;
  campaignWhatsAppDelaySecondsMin: string;
  campaignWhatsAppDelaySecondsMax: string;
  campaignWhatsAppMaxConnectors: string;
  campaignWhatsAppRequireApproval: boolean;
  campaignEmailEmailsPerDay: string;
  campaignEmailEmailsPerMonth: string;
  campaignEmailRecipientsPerBlast: string;
  campaignEmailVerifiedDomains: string;
  campaignEmailRequireUnsubscribe: boolean;
};

const initialFormState: AccessFormState = {
  campaignEnabled: false,
  campaignWhatsAppEnabled: false,
  campaignEmailEnabled: false,
  aiMessageAssistEnabled: false,
  inboxEnabled: true,
  crmEnabled: true,
  salesEnabled: true,
  maxWhatsappAccounts: "1",
  historySyncDays: "7",
  maxUsers: "",
  aiDailyCredits: "100",
  aiMonthlyCredits: "1000",
  campaignMonthlyCount: "20",
  campaignRecipientsPerCampaign: "1000",
  campaignTemplatesCount: "25",
  campaignAudienceSegments: "10",
  campaignScheduledCount: "10",
  campaignWhatsAppMessagesPerDay: "500",
  campaignWhatsAppMessagesPerMonth: "10000",
  campaignWhatsAppRecipientsPerBroadcast: "1000",
  campaignWhatsAppDelaySecondsMin: "3",
  campaignWhatsAppDelaySecondsMax: "15",
  campaignWhatsAppMaxConnectors: "3",
  campaignWhatsAppRequireApproval: false,
  campaignEmailEmailsPerDay: "0",
  campaignEmailEmailsPerMonth: "0",
  campaignEmailRecipientsPerBlast: "0",
  campaignEmailVerifiedDomains: "0",
  campaignEmailRequireUnsubscribe: true
};

export function OrganizationCampaignAccessLimitsPage() {
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
  const moduleStatusMap = useMemo(
    () => new Map((accessLimits?.modules ?? []).map((module) => [module.moduleKey, module.isEnabled] as const)),
    [accessLimits?.modules]
  );
  const [form, setForm] = useState<AccessFormState>(initialFormState);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!accessLimits) {
      return;
    }

    setForm({
      campaignEnabled: getModuleEnabled(moduleStatusMap, "campaign"),
      campaignWhatsAppEnabled: getModuleEnabled(moduleStatusMap, "campaign.whatsapp"),
      campaignEmailEnabled: getModuleEnabled(moduleStatusMap, "campaign.email"),
      aiMessageAssistEnabled: getModuleEnabled(moduleStatusMap, "ai_message_assist"),
      inboxEnabled: getModuleEnabled(moduleStatusMap, "inbox"),
      crmEnabled: getModuleEnabled(moduleStatusMap, "crm"),
      salesEnabled: getModuleEnabled(moduleStatusMap, "sales"),
      maxWhatsappAccounts: String(accessLimits.limits.maxWhatsappAccounts),
      historySyncDays: String(accessLimits.limits.historySyncDays),
      maxUsers: accessLimits.limits.maxUsers == null ? "" : String(accessLimits.limits.maxUsers),
      aiDailyCredits: String(accessLimits.limits.aiDailyCredits),
      aiMonthlyCredits: String(accessLimits.limits.aiMonthlyCredits),
      campaignMonthlyCount: String(accessLimits.limits.campaignMonthlyCount),
      campaignRecipientsPerCampaign: String(accessLimits.limits.campaignRecipientsPerCampaign),
      campaignTemplatesCount: String(accessLimits.limits.campaignTemplatesCount),
      campaignAudienceSegments: String(accessLimits.limits.campaignAudienceSegments),
      campaignScheduledCount: String(accessLimits.limits.campaignScheduledCount),
      campaignWhatsAppMessagesPerDay: String(accessLimits.limits.campaignWhatsAppMessagesPerDay),
      campaignWhatsAppMessagesPerMonth: String(accessLimits.limits.campaignWhatsAppMessagesPerMonth),
      campaignWhatsAppRecipientsPerBroadcast: String(accessLimits.limits.campaignWhatsAppRecipientsPerBroadcast),
      campaignWhatsAppDelaySecondsMin: String(accessLimits.limits.campaignWhatsAppDelaySecondsMin),
      campaignWhatsAppDelaySecondsMax: String(accessLimits.limits.campaignWhatsAppDelaySecondsMax),
      campaignWhatsAppMaxConnectors: String(accessLimits.limits.campaignWhatsAppMaxConnectors),
      campaignWhatsAppRequireApproval: accessLimits.limits.campaignWhatsAppRequireApproval,
      campaignEmailEmailsPerDay: String(accessLimits.limits.campaignEmailEmailsPerDay),
      campaignEmailEmailsPerMonth: String(accessLimits.limits.campaignEmailEmailsPerMonth),
      campaignEmailRecipientsPerBlast: String(accessLimits.limits.campaignEmailRecipientsPerBlast),
      campaignEmailVerifiedDomains: String(accessLimits.limits.campaignEmailVerifiedDomains),
      campaignEmailRequireUnsubscribe: accessLimits.limits.campaignEmailRequireUnsubscribe
    });
  }, [accessLimits, moduleStatusMap]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateOrganizationAccessLimits(selectedOrganizationId, {
        campaignEnabled: form.campaignEnabled,
        campaignWhatsAppEnabled: form.campaignWhatsAppEnabled,
        campaignEmailEnabled: form.campaignEmailEnabled,
        aiMessageAssistEnabled: form.aiMessageAssistEnabled,
        inboxEnabled: form.inboxEnabled,
        crmEnabled: form.crmEnabled,
        salesEnabled: form.salesEnabled,
        maxWhatsappAccounts: Number(form.maxWhatsappAccounts),
        historySyncDays: Number(form.historySyncDays),
        maxUsers: form.maxUsers.trim() ? Number(form.maxUsers) : null,
        aiDailyCredits: Number(form.aiDailyCredits),
        aiMonthlyCredits: Number(form.aiMonthlyCredits),
        campaignMonthlyCount: Number(form.campaignMonthlyCount),
        campaignRecipientsPerCampaign: Number(form.campaignRecipientsPerCampaign),
        campaignTemplatesCount: Number(form.campaignTemplatesCount),
        campaignAudienceSegments: Number(form.campaignAudienceSegments),
        campaignScheduledCount: Number(form.campaignScheduledCount),
        campaignWhatsAppMessagesPerDay: Number(form.campaignWhatsAppMessagesPerDay),
        campaignWhatsAppMessagesPerMonth: Number(form.campaignWhatsAppMessagesPerMonth),
        campaignWhatsAppRecipientsPerBroadcast: Number(form.campaignWhatsAppRecipientsPerBroadcast),
        campaignWhatsAppDelaySecondsMin: Number(form.campaignWhatsAppDelaySecondsMin),
        campaignWhatsAppDelaySecondsMax: Number(form.campaignWhatsAppDelaySecondsMax),
        campaignWhatsAppMaxConnectors: Number(form.campaignWhatsAppMaxConnectors),
        campaignWhatsAppRequireApproval: form.campaignWhatsAppRequireApproval,
        campaignEmailEmailsPerDay: Number(form.campaignEmailEmailsPerDay),
        campaignEmailEmailsPerMonth: Number(form.campaignEmailEmailsPerMonth),
        campaignEmailRecipientsPerBlast: Number(form.campaignEmailRecipientsPerBlast),
        campaignEmailVerifiedDomains: Number(form.campaignEmailVerifiedDomains),
        campaignEmailRequireUnsubscribe: form.campaignEmailRequireUnsubscribe
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organization-access-limits", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaign", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaign", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaign.whatsapp", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaign.whatsapp", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaign.email", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaign.email", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaigns", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "campaigns", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "ai_message_assist", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "ai_message_assist", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "inbox", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "inbox", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "crm", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "crm", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "sales", selectedOrganizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-module-status", "sales", "current"] }),
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

  const disabled = accessLimitsQuery.isLoading || updateMutation.isPending;
  const currentWhatsappUsage = accessLimits?.usage.whatsappAccounts ?? 0;
  const maxWhatsappValue = Number(form.maxWhatsappAccounts) || 0;
  const aiToday = accessLimits?.usage.ai.today;
  const aiMonth = accessLimits?.usage.ai.month;
  const campaignUsage = accessLimits?.usage.campaign;
  const aiTodayUsageTone = getUsageAlertTone(aiToday?.creditUnits ?? 0, Number(form.aiDailyCredits) || 0);
  const aiMonthUsageTone = getUsageAlertTone(aiMonth?.creditUnits ?? 0, Number(form.aiMonthlyCredits) || 0);
  const whatsappUsageTone = getUsageAlertTone(currentWhatsappUsage, maxWhatsappValue);
  const whatsappCampaignsDisabled = !form.campaignEnabled;

  return (
    <section className="space-y-4">
      <Card elevated className="!p-5 space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Super Admin</p>
            <h2 className="mt-2 section-title">Organization Access & Limits</h2>
            <p className="mt-1.5 max-w-3xl section-copy">
              Manage module access, campaign limits, WhatsApp operational limits, and placeholder Email controls from one standard page.
            </p>
          </div>
          <Button className="shrink-0" disabled={disabled} onClick={() => updateMutation.mutate()}>
            Save changes
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        <SummaryCard
          icon={<SlidersHorizontal size={16} />}
          eyebrow="Organization"
          title={selectedOrganization?.name ?? selectedOrganizationName ?? "Selected organization"}
          description={selectedOrganization?.status ?? "Access, modules, and limits"}
        />
        <SummaryCard
          icon={<Gauge size={16} />}
          eyebrow="Control Standard"
          title="Modules, limits, usage"
          description="Parent Campaign access controls WhatsApp and Email visibility. Email remains placeholder-only even when enabled."
        />
      </div>

      <SectionHeading eyebrow="Modules" title="Organization modules" />
      <div className="grid gap-3 xl:grid-cols-3">
        <FeatureToggleCard
          title="Inbox Module"
          category="Optional Module"
          description="Enable Inbox to manage WhatsApp and future channel conversations."
          icon={<MessageSquare size={17} />}
          statusLabel={form.inboxEnabled ? "Enabled" : "Disabled"}
          statusTone={form.inboxEnabled ? "success" : "muted"}
          action={
            <Button variant={form.inboxEnabled ? "secondary" : "primary"} size="sm" disabled={disabled} onClick={() => setForm((current) => ({ ...current, inboxEnabled: !current.inboxEnabled }))}>
              <CheckCircle2 size={16} />
              {form.inboxEnabled ? "Enabled" : "Disabled"}
            </Button>
          }
        />
        <FeatureToggleCard
          title="CRM Module"
          category="Optional Module"
          description="Enable CRM to manage Contacts, Reports and Data Export."
          icon={<Users size={17} />}
          statusLabel={form.crmEnabled ? "Enabled" : "Disabled"}
          statusTone={form.crmEnabled ? "success" : "muted"}
          action={
            <Button variant={form.crmEnabled ? "secondary" : "primary"} size="sm" disabled={disabled} onClick={() => setForm((current) => ({ ...current, crmEnabled: !current.crmEnabled }))}>
              <CheckCircle2 size={16} />
              {form.crmEnabled ? "Enabled" : "Disabled"}
            </Button>
          }
        />
        <FeatureToggleCard
          title="Sales Module"
          category="Optional Module"
          description="Enable Sales to manage leads, pipeline and sales tracking."
          icon={<TrendingUp size={17} />}
          statusLabel={form.salesEnabled ? "Enabled" : "Disabled"}
          statusTone={form.salesEnabled ? "success" : "muted"}
          action={
            <Button variant={form.salesEnabled ? "secondary" : "primary"} size="sm" disabled={disabled} onClick={() => setForm((current) => ({ ...current, salesEnabled: !current.salesEnabled }))}>
              <CheckCircle2 size={16} />
              {form.salesEnabled ? "Enabled" : "Disabled"}
            </Button>
          }
        />
        <FeatureToggleCard
          title="Campaign Module"
          category="Parent Module"
          description="Controls whether Campaign appears in navigation for the organization."
          icon={<Megaphone size={17} />}
          statusLabel={form.campaignEnabled ? "Enabled" : "Disabled"}
          statusTone={form.campaignEnabled ? "success" : "muted"}
          action={
            <Button variant={form.campaignEnabled ? "secondary" : "primary"} size="sm" disabled={disabled} onClick={() => setForm((current) => ({ ...current, campaignEnabled: !current.campaignEnabled }))}>
              <CheckCircle2 size={16} />
              {form.campaignEnabled ? "Enabled" : "Disabled"}
            </Button>
          }
        />
        <FeatureToggleCard
          title="Campaign > WhatsApp"
          category="Submodule"
          description="Controls access to the functional WhatsApp campaign pages and create broadcast flow."
          icon={<Megaphone size={17} />}
          statusLabel={form.campaignEnabled ? (form.campaignWhatsAppEnabled ? "Enabled" : "Disabled") : "Parent Disabled"}
          statusTone={form.campaignEnabled && form.campaignWhatsAppEnabled ? "success" : "muted"}
          action={
            <Button variant={form.campaignWhatsAppEnabled ? "secondary" : "primary"} size="sm" disabled={disabled || whatsappCampaignsDisabled} onClick={() => setForm((current) => ({ ...current, campaignWhatsAppEnabled: !current.campaignWhatsAppEnabled }))}>
              <CheckCircle2 size={16} />
              {form.campaignWhatsAppEnabled ? "Enabled" : "Disabled"}
            </Button>
          }
        />
        <FeatureToggleCard
          title="Campaign > Email"
          category="Submodule"
          description="Controls visibility of the Email placeholder module. Email sending remains unavailable."
          icon={<Mail size={17} />}
          statusLabel={form.campaignEnabled ? (form.campaignEmailEnabled ? "Enabled" : "Disabled") : "Parent Disabled"}
          statusTone={form.campaignEnabled && form.campaignEmailEnabled ? "success" : "muted"}
          action={
            <Button variant={form.campaignEmailEnabled ? "secondary" : "primary"} size="sm" disabled={disabled || !form.campaignEnabled} onClick={() => setForm((current) => ({ ...current, campaignEmailEnabled: !current.campaignEmailEnabled }))}>
              <CheckCircle2 size={16} />
              {form.campaignEmailEnabled ? "Enabled" : "Disabled"}
            </Button>
          }
          stats={[{ label: "Delivery", value: "Coming Soon" }]}
        />
      </div>

      <SectionHeading eyebrow="Campaign" title="Generic campaign limits" />
      <LimitGridCard icon={<Megaphone size={17} />} title="Campaign quotas">
        <LimitField label="Monthly campaigns" description="Planned monthly campaign quota." value={form.campaignMonthlyCount} min={0} max={100000} disabled={disabled} onChange={(value) => setForm((current) => ({ ...current, campaignMonthlyCount: value }))} />
        <LimitField label="Recipients per campaign" description="Soft cap for a single campaign audience size." value={form.campaignRecipientsPerCampaign} min={0} max={1000000} disabled={disabled} onChange={(value) => setForm((current) => ({ ...current, campaignRecipientsPerCampaign: value }))} />
        <LimitField label="Saved templates" description="How many reusable templates can be stored." value={form.campaignTemplatesCount} min={0} max={10000} disabled={disabled} onChange={(value) => setForm((current) => ({ ...current, campaignTemplatesCount: value }))} />
        <LimitField label="Audience segments" description="How many reusable audience groups can be stored." value={form.campaignAudienceSegments} min={0} max={10000} disabled={disabled} onChange={(value) => setForm((current) => ({ ...current, campaignAudienceSegments: value }))} />
        <LimitField label="Scheduled campaigns" description="How many scheduled campaigns can remain active." value={form.campaignScheduledCount} min={0} max={10000} disabled={disabled} onChange={(value) => setForm((current) => ({ ...current, campaignScheduledCount: value }))} />
      </LimitGridCard>

      <SectionHeading eyebrow="WhatsApp" title="WhatsApp campaign and workspace limits" />
      <div className="grid gap-3 xl:grid-cols-2">
        <Card elevated className="!p-4 space-y-4">
          <FeatureSectionHeader icon={<MessageSquare size={17} />} title="Workspace limits" />
          <div className="grid gap-3 lg:grid-cols-3">
            <LimitField label="Max WhatsApp connections" description="Set 0 to prevent new WhatsApp account linking." value={form.maxWhatsappAccounts} min={0} max={20} disabled={disabled} usage={`${currentWhatsappUsage} / ${maxWhatsappValue}`} usageTone={whatsappUsageTone} onChange={(value) => setForm((current) => ({ ...current, maxWhatsappAccounts: value }))} />
            <label className="block">
              <span className="text-sm font-medium text-text">Historical sync days</span>
              <Select className="mt-2 border-border bg-card" value={form.historySyncDays} disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, historySyncDays: event.target.value }))}>
                {historySyncOptions.map((option) => (
                  <option key={option} value={option}>{option} days</option>
                ))}
              </Select>
              <span className="mt-2 block text-xs leading-5 text-text-muted">Default lookback window for historical WhatsApp sync.</span>
            </label>
            <LimitField label="Max users" description="Leave blank for no explicit user cap." value={form.maxUsers} min={1} max={500} disabled={disabled} placeholder="No explicit limit" onChange={(value) => setForm((current) => ({ ...current, maxUsers: value }))} />
          </div>
        </Card>

        <Card elevated className="!p-4 space-y-4">
          <FeatureSectionHeader icon={<Megaphone size={17} />} title="WhatsApp campaign controls" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <LimitField label="Messages per day" description="Soft daily WhatsApp send limit." value={form.campaignWhatsAppMessagesPerDay} min={0} max={1000000} disabled={disabled || whatsappCampaignsDisabled} onChange={(value) => setForm((current) => ({ ...current, campaignWhatsAppMessagesPerDay: value }))} />
            <LimitField label="Messages per month" description="Soft monthly WhatsApp send limit." value={form.campaignWhatsAppMessagesPerMonth} min={0} max={10000000} disabled={disabled || whatsappCampaignsDisabled} onChange={(value) => setForm((current) => ({ ...current, campaignWhatsAppMessagesPerMonth: value }))} />
            <LimitField label="Recipients per broadcast" description="Soft cap for one WhatsApp broadcast run." value={form.campaignWhatsAppRecipientsPerBroadcast} min={0} max={1000000} disabled={disabled || whatsappCampaignsDisabled} onChange={(value) => setForm((current) => ({ ...current, campaignWhatsAppRecipientsPerBroadcast: value }))} />
            <LimitField label="Delay min seconds" description="Minimum pacing delay between sends." value={form.campaignWhatsAppDelaySecondsMin} min={0} max={3600} disabled={disabled || whatsappCampaignsDisabled} onChange={(value) => setForm((current) => ({ ...current, campaignWhatsAppDelaySecondsMin: value }))} />
            <LimitField label="Delay max seconds" description="Maximum pacing delay between sends." value={form.campaignWhatsAppDelaySecondsMax} min={0} max={3600} disabled={disabled || whatsappCampaignsDisabled} onChange={(value) => setForm((current) => ({ ...current, campaignWhatsAppDelaySecondsMax: value }))} />
            <LimitField label="Max WhatsApp connectors" description="How many connectors can participate in campaign sending." value={form.campaignWhatsAppMaxConnectors} min={0} max={100} disabled={disabled || whatsappCampaignsDisabled} onChange={(value) => setForm((current) => ({ ...current, campaignWhatsAppMaxConnectors: value }))} />
          </div>
          <BooleanField label="Require campaign approval" description="Prepare approval-based campaign governance without changing the current dispatch worker." checked={form.campaignWhatsAppRequireApproval} disabled={disabled || whatsappCampaignsDisabled} onChange={(checked) => setForm((current) => ({ ...current, campaignWhatsAppRequireApproval: checked }))} />
        </Card>
      </div>

      <SectionHeading eyebrow="Email" title="Email placeholder controls" />
      <LimitGridCard icon={<Mail size={17} />} title="Coming Soon placeholder">
        <LimitField label="Emails per day" description="Coming Soon" value={form.campaignEmailEmailsPerDay} min={0} max={1000000} disabled onChange={(value) => setForm((current) => ({ ...current, campaignEmailEmailsPerDay: value }))} />
        <LimitField label="Emails per month" description="Coming Soon" value={form.campaignEmailEmailsPerMonth} min={0} max={10000000} disabled onChange={(value) => setForm((current) => ({ ...current, campaignEmailEmailsPerMonth: value }))} />
        <LimitField label="Recipients per blast" description="Coming Soon" value={form.campaignEmailRecipientsPerBlast} min={0} max={1000000} disabled onChange={(value) => setForm((current) => ({ ...current, campaignEmailRecipientsPerBlast: value }))} />
        <LimitField label="Verified sender domains" description="Coming Soon" value={form.campaignEmailVerifiedDomains} min={0} max={1000} disabled onChange={(value) => setForm((current) => ({ ...current, campaignEmailVerifiedDomains: value }))} />
        <BooleanField label="Require unsubscribe link" description="Coming Soon" checked={form.campaignEmailRequireUnsubscribe} disabled onChange={(checked) => setForm((current) => ({ ...current, campaignEmailRequireUnsubscribe: checked }))} />
      </LimitGridCard>

      <SectionHeading eyebrow="Usage" title="Current usage snapshot" />
      <div className="grid gap-3 xl:grid-cols-5">
        <UsageStat label="WhatsApp sent today" value={formatNumber(campaignUsage?.whatsappSentToday ?? 0)} />
        <UsageStat label="WhatsApp sent this month" value={formatNumber(campaignUsage?.whatsappSentThisMonth ?? 0)} />
        <UsageStat label="WhatsApp failed this month" value={formatNumber(campaignUsage?.whatsappFailedThisMonth ?? 0)} />
        <UsageStat label="Email sent this month" value="Coming Soon" />
        <UsageStat label="Organizations near limit" value="Not tracked" />
      </div>

      <SectionHeading eyebrow="AI" title="AI Message Assist" />
      <div className="grid gap-3 xl:grid-cols-2">
        <FeatureToggleCard
          title="AI Message Assist"
          category="Optional Module"
          description="DeepSeek-backed rewrite and review tools in campaign and template composers."
          icon={<Sparkles size={17} />}
          statusLabel={form.aiMessageAssistEnabled ? "Enabled" : "Disabled"}
          statusTone={form.aiMessageAssistEnabled ? "success" : "muted"}
          action={
            <Button variant={form.aiMessageAssistEnabled ? "secondary" : "primary"} size="sm" disabled={disabled} onClick={() => setForm((current) => ({ ...current, aiMessageAssistEnabled: !current.aiMessageAssistEnabled }))}>
              <CheckCircle2 size={16} />
              {form.aiMessageAssistEnabled ? "Enabled" : "Disabled"}
            </Button>
          }
          stats={[
            { label: "Today", value: `${aiToday?.creditUnits ?? 0} / ${Number(form.aiDailyCredits) || 0} credits`, tone: aiTodayUsageTone },
            { label: "This month", value: `${aiMonth?.creditUnits ?? 0} / ${Number(form.aiMonthlyCredits) || 0} credits`, tone: aiMonthUsageTone },
            { label: "DeepSeek calls", value: String(aiMonth?.deepseekRequests ?? 0) },
            { label: "Tokens", value: formatNumber(aiMonth?.totalTokens ?? 0) }
          ]}
        />

        <Card elevated className="!p-4 space-y-4">
          <FeatureSectionHeader icon={<Bot size={17} />} title="AI usage limits" />
          <div className="grid gap-3 sm:grid-cols-2">
            <LimitField label="Daily AI credits" description="Blocks AI requests after today reaches this number." value={form.aiDailyCredits} min={0} max={100000} disabled={disabled} usage={`${aiToday?.creditUnits ?? 0} used today`} usageTone={aiTodayUsageTone} onChange={(value) => setForm((current) => ({ ...current, aiDailyCredits: value }))} />
            <LimitField label="Monthly AI credits" description="Blocks AI requests after this month reaches this number." value={form.aiMonthlyCredits} min={0} max={1000000} disabled={disabled} usage={`${aiMonth?.creditUnits ?? 0} used this month`} usageTone={aiMonthUsageTone} onChange={(value) => setForm((current) => ({ ...current, aiMonthlyCredits: value }))} />
          </div>
        </Card>
      </div>

      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} onClose={() => setNotice(null)} />
    </section>
  );
}

function getModuleEnabled(map: Map<ModuleKey, boolean>, key: ModuleKey) {
  return map.get(key) ?? false;
}

function SummaryCard({ description, eyebrow, icon, title }: { description: string; eyebrow: string; icon: ReactNode; title: string }) {
  return (
    <Card elevated className="!p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-soft">{eyebrow}</p>
          <h3 className="mt-1 text-base font-semibold text-text">{title}</h3>
          <p className="mt-1.5 text-xs leading-5 text-text-muted">{description}</p>
        </div>
      </div>
    </Card>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-soft">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-semibold text-text">{title}</h3>
    </div>
  );
}

function FeatureToggleCard({ action, category, description, icon, stats = [], statusLabel, statusTone, title }: { action?: ReactNode; category: string; description: string; icon: ReactNode; stats?: Array<{ label: string; tone?: UsageAlertTone; value: string }>; statusLabel: string; statusTone: "success" | "muted"; title: string; }) {
  return (
    <Card elevated className="!p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">{icon}</span>
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
            <UsageStat key={stat.label} label={stat.label} value={stat.value} tone={stat.tone ?? "normal"} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function LimitGridCard({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <Card elevated className="!p-4 space-y-4">
      <FeatureSectionHeader icon={icon} title={title} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{children}</div>
    </Card>
  );
}

function FeatureSectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">{icon}</span>
      <h3 className="text-base font-semibold text-text">{title}</h3>
    </div>
  );
}

function LimitField({ description, disabled = false, label, max, min, onChange, placeholder, usage, usageTone = "normal", value }: { description: string; disabled?: boolean; label: string; max: number; min: number; onChange: (value: string) => void; placeholder?: string; usage?: string; usageTone?: UsageAlertTone; value: string; }) {
  return (
    <label className={clsx("block", disabled && "opacity-70")}>
      <span className="text-sm font-medium text-text">{label}</span>
      <Input className="mt-2 border-border bg-card" min={min} max={max} placeholder={placeholder} type="number" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      <span className="mt-1.5 block text-xs leading-5 text-text-muted">{description}</span>
      {usage ? <span className={clsx("mt-1.5 block text-xs font-medium", usageToneClassMap[usageTone])}>Current usage: {usage}</span> : null}
    </label>
  );
}

function BooleanField({ checked, description, disabled = false, label, onChange }: { checked: boolean; description: string; disabled?: boolean; label: string; onChange: (checked: boolean) => void; }) {
  return (
    <div className={clsx("rounded-2xl border border-border bg-background-tint px-4 py-3", disabled && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text">{label}</p>
          <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
        </div>
        <Button size="sm" variant={checked ? "secondary" : "primary"} disabled={disabled} onClick={() => onChange(!checked)}>
          <CheckCircle2 size={16} />
          {checked ? "Required" : "Optional"}
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ children, tone }: { children: ReactNode; tone: "success" | "muted" }) {
  return <span className={clsx("inline-flex min-h-[1.55rem] items-center border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]", tone === "success" ? "border-success/20 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground")}>{children}</span>;
}

function UsageStat({ label, tone = "normal", value }: { label: string; tone?: UsageAlertTone; value: string }) {
  return (
    <div className={clsx("border px-2.5 py-2", tone === "critical" ? "border-destructive/30 bg-destructive/10" : tone === "warning" ? "border-warning/30 bg-warning/10" : "border-border bg-background-tint")}>
      <p className={clsx("text-[10px] font-medium uppercase tracking-[0.1em]", usageToneClassMap[tone])}>{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        {tone !== "normal" ? <AlertTriangle size={14} className={tone === "critical" ? "text-destructive" : "text-warning"} /> : null}
        <p className={clsx("text-sm font-semibold", tone === "critical" ? "font-bold text-destructive" : tone === "warning" ? "text-warning" : "text-text")}>{value}</p>
      </div>
    </div>
  );
}

type UsageAlertTone = "normal" | "warning" | "critical";

const usageToneClassMap: Record<UsageAlertTone, string> = {
  normal: "text-text-soft",
  warning: "text-warning",
  critical: "text-destructive"
};

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
