import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { fetchAutoReplySettings, updateAutoReplySettings } from "../api/crm";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { InboxSubTabs } from "../components/InboxSubTabs";
import { Input, Select } from "../components/Input";
import { useQuickReplies } from "../hooks/useQuickReplies";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" }
];

function toTimeInput(value?: string | null) {
  return (value ?? "09:00").slice(0, 5);
}

export function InboxAutoReplyPage() {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const activeOrganizationId = isSuperAdmin
    ? dashboardContext.selectedOrganizationId || null
    : currentUser?.organizationId ?? null;
  const canManage = Boolean(currentUser?.role === "super_admin" || currentUser?.permissionKeys.includes("org.manage_settings"));
  const canLoad = !isSuperAdmin || Boolean(activeOrganizationId);

  const { data: quickReplies = [] } = useQuickReplies({
    organizationId: activeOrganizationId,
    includeInactive: false,
    enabled: canLoad && canManage
  });
  const { data: settings, isLoading } = useQuery({
    queryKey: ["auto-reply-settings", activeOrganizationId ?? "none"],
    queryFn: () => fetchAutoReplySettings({ organizationId: activeOrganizationId }),
    enabled: canLoad && canManage
  });

  const [isEnabled, setIsEnabled] = useState(false);
  const [quickReplyTemplateId, setQuickReplyTemplateId] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kuala_Lumpur");
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(true);
  const [businessHoursStart, setBusinessHoursStart] = useState("09:00");
  const [businessHoursEnd, setBusinessHoursEnd] = useState("18:00");
  const [businessDays, setBusinessDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [outsideHoursEnabled, setOutsideHoursEnabled] = useState(true);
  const [noReplyEnabled, setNoReplyEnabled] = useState(false);
  const [noReplyDelayMinutes, setNoReplyDelayMinutes] = useState("30");
  const [firstMessageEnabled, setFirstMessageEnabled] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState("240");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setIsEnabled(settings.is_enabled);
    setQuickReplyTemplateId(settings.quick_reply_template_id ?? "");
    setTimezone(settings.timezone);
    setBusinessHoursEnabled(settings.business_hours_enabled);
    setBusinessHoursStart(toTimeInput(settings.business_hours_start));
    setBusinessHoursEnd(toTimeInput(settings.business_hours_end));
    setBusinessDays(settings.business_days);
    setOutsideHoursEnabled(settings.outside_hours_enabled);
    setNoReplyEnabled(settings.no_reply_enabled);
    setNoReplyDelayMinutes(String(settings.no_reply_delay_minutes));
    setFirstMessageEnabled(settings.first_message_enabled);
    setCooldownMinutes(String(settings.cooldown_minutes));
  }, [settings]);

  const selectedTemplate = useMemo(
    () => quickReplies.find((template) => template.id === quickReplyTemplateId) ?? null,
    [quickReplies, quickReplyTemplateId]
  );

  function toggleBusinessDay(day: number) {
    setBusinessDays((current) => {
      if (current.includes(day)) {
        return current.filter((value) => value !== day);
      }

      return [...current, day].sort((left, right) => left - right);
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!activeOrganizationId) {
      setNotice("Choose an organization before saving auto replies.");
      return;
    }

    if (isEnabled && !quickReplyTemplateId) {
      setNotice("Select a template before enabling auto replies.");
      return;
    }

    if (businessDays.length === 0) {
      setNotice("Select at least one working day.");
      return;
    }

    setIsSaving(true);
    try {
      await updateAutoReplySettings({
        organizationId: activeOrganizationId,
        isEnabled,
        quickReplyTemplateId: quickReplyTemplateId || null,
        timezone,
        businessHoursEnabled,
        businessHoursStart,
        businessHoursEnd,
        businessDays,
        outsideHoursEnabled,
        noReplyEnabled,
        noReplyDelayMinutes: Number(noReplyDelayMinutes),
        firstMessageEnabled,
        cooldownMinutes: Number(cooldownMinutes)
      });
      await queryClient.invalidateQueries({ queryKey: ["auto-reply-settings"] });
      setNotice("Auto reply settings saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save auto reply settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card elevated>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Inbox</p>
              <h1 className="mt-3 section-title">Auto replies</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                Send a selected template automatically outside working hours, after delayed no-reply windows, or on first contact.
              </p>
            </div>
            <InboxSubTabs
              tabs={[
                { to: "/inbox", label: "Conversations" },
                { to: "/inbox/replies", label: "Template library" }
              ]}
            />
          </div>
          {notice ? <p className="mt-4 text-sm text-primary">{notice}</p> : null}
        </Card>
      </motion.div>

      {!canManage ? (
        <Card elevated>
          <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-sm text-text-muted">
            Organization settings permission is required to manage auto replies.
          </div>
        </Card>
      ) : !canLoad ? (
        <Card elevated>
          <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-sm text-text-muted">
            Choose an organization from the sidebar to configure auto replies.
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card elevated>
            <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text">Reply automation</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Auto replies only use active templates from the Inbox template library.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-text">
                <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
                Enabled
              </label>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="block lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Template</span>
                <Select
                  value={quickReplyTemplateId}
                  onChange={(event) => setQuickReplyTemplateId(event.target.value)}
                  className="mt-2"
                  disabled={isLoading || quickReplies.length === 0}
                >
                  <option value="">{quickReplies.length === 0 ? "Create an active template first" : "Select auto reply template"}</option>
                  {quickReplies.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Timezone</span>
                <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-2" />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Cooldown minutes</span>
                <Input
                  type="number"
                  min={0}
                  max={10080}
                  value={cooldownMinutes}
                  onChange={(event) => setCooldownMinutes(event.target.value)}
                  className="mt-2"
                />
              </label>
            </div>

            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-border bg-background-tint p-4">
                <label className="flex items-start gap-3 text-sm font-semibold text-text">
                  <input type="checkbox" checked={businessHoursEnabled} onChange={(event) => setBusinessHoursEnabled(event.target.checked)} />
                  <span>
                    Working hours
                    <span className="mt-1 block text-sm font-normal leading-6 text-text-muted">
                      Outside-hours replies use this schedule.
                    </span>
                  </span>
                </label>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Input type="time" value={businessHoursStart} onChange={(event) => setBusinessHoursStart(event.target.value)} disabled={!businessHoursEnabled} />
                  <Input type="time" value={businessHoursEnd} onChange={(event) => setBusinessHoursEnd(event.target.value)} disabled={!businessHoursEnabled} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {DAYS.map((day) => (
                    <label key={day.value} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-muted">
                      <input
                        type="checkbox"
                        checked={businessDays.includes(day.value)}
                        onChange={() => toggleBusinessDay(day.value)}
                        disabled={!businessHoursEnabled}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <label className="rounded-xl border border-border bg-background-tint p-4 text-sm text-text-muted">
                  <span className="flex items-start gap-3 font-semibold text-text">
                    <input type="checkbox" checked={outsideHoursEnabled} onChange={(event) => setOutsideHoursEnabled(event.target.checked)} />
                    Outside working hours
                  </span>
                  <span className="mt-2 block leading-6">Reply immediately when a customer writes outside the selected working days or hours.</span>
                </label>

                <label className="rounded-xl border border-border bg-background-tint p-4 text-sm text-text-muted">
                  <span className="flex items-start gap-3 font-semibold text-text">
                    <input type="checkbox" checked={noReplyEnabled} onChange={(event) => setNoReplyEnabled(event.target.checked)} />
                    No reply delay
                  </span>
                  <span className="mt-2 block leading-6">Queue the template when no outgoing reply appears within the selected delay.</span>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={noReplyDelayMinutes}
                    onChange={(event) => setNoReplyDelayMinutes(event.target.value)}
                    className="mt-3"
                    disabled={!noReplyEnabled}
                  />
                </label>

                <label className="rounded-xl border border-border bg-background-tint p-4 text-sm text-text-muted">
                  <span className="flex items-start gap-3 font-semibold text-text">
                    <input type="checkbox" checked={firstMessageEnabled} onChange={(event) => setFirstMessageEnabled(event.target.checked)} />
                    First customer message
                  </span>
                  <span className="mt-2 block leading-6">Send the template when a new conversation receives its first customer message.</span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="submit" disabled={isSaving || isLoading} className="px-5 py-2.5">
                Save auto replies
              </Button>
            </div>
          </Card>

          <Card elevated>
            <h2 className="text-lg font-semibold text-text">Template preview</h2>
            {selectedTemplate ? (
              <div className="mt-4 space-y-3 text-sm text-text-muted">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{selectedTemplate.category || "Uncategorized"}</p>
                  <p className="mt-1 text-base font-semibold text-text">{selectedTemplate.title}</p>
                </div>
                <p className="whitespace-pre-wrap rounded-xl border border-border bg-background-tint p-4 leading-6">
                  {selectedTemplate.body}
                </p>
                <p>Variables with default values are filled automatically. Contact name and phone number are available as template variables.</p>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-text-muted">Select an active template to preview the auto reply body.</p>
            )}
          </Card>
        </form>
      )}
    </section>
  );
}
