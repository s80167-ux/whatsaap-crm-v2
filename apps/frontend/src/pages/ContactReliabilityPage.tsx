import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye, GitMerge, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import {
  applyContactSuggestion,
  getContactReliabilitySummary,
  getContactReliabilityTimeline,
  getDuplicateContactGroups,
  getMergePreview,
  getRiskyContacts,
  getUnknownContacts,
  performReliabilityMerge,
  recalculateContactReliability,
  type DuplicateContactGroup,
  type MergePreview,
  type RiskyContact,
  type UnknownContact
} from "../api/contactReliability";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { PopupOverlay } from "../components/PopupOverlay";
import { getStoredUser } from "../lib/auth";
import { getRiskFlagLabel as getDisplayRiskFlagLabel, getStatusLabel } from "../lib/displayLabels";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";

type ActiveTab = "risky" | "unknown" | "duplicates" | "timeline";

type Notice = {
  type: "success" | "error";
  message: string;
};

type TranslationFn = ReturnType<typeof useTranslation>["t"];

function formatDate(value: string | null | undefined, language: string, t: TranslationFn) {
  if (!value) return t("contactReliability.noActivity");
  return new Intl.DateTimeFormat(language === "ms" ? "ms-MY" : "en-MY", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function levelClass(level: string) {
  if (level === "verified" || level === "strong") return "border-success/20 bg-success/10 text-success";
  if (level === "partial") return "border-warning/20 bg-warning/10 text-warning";
  return "border-destructive/20 bg-destructive/10 text-destructive";
}

export function getReliabilityStatusLabel(status: string, t: TranslationFn) {
  const translated = t(`contactReliability.status.${status.toLowerCase()}`);
  return translated === `contactReliability.status.${status.toLowerCase()}` ? getStatusLabel(status, t) : translated;
}

function getSuggestedActionLabel(action: string, t: TranslationFn) {
  const key = `contactReliability.suggestedActions.${action.toLowerCase()}`;
  const translated = t(key);
  return translated === key ? humanize(action) : translated;
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

function normalizeName(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function canApplySuggestedName(contact: UnknownContact) {
  if (contact.suggested_action !== "update_name" || !contact.best_available_name) {
    return false;
  }

  const currentName = normalizeName(contact.display_name)?.toLowerCase();
  const suggestedName = normalizeName(contact.best_available_name)?.toLowerCase();
  return Boolean(suggestedName && suggestedName !== currentName);
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneClass =
    tone === "good"
      ? "border-success/20 bg-success/10"
      : tone === "warn"
        ? "border-warning/20 bg-warning/10"
        : tone === "bad"
          ? "border-destructive/20 bg-destructive/10"
          : "border-border bg-card";

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
    </div>
  );
}

function ScoreBadge({ contact }: { contact: Pick<RiskyContact, "confidence_score" | "confidence_level"> }) {
  const { t } = useTranslation();

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${levelClass(contact.confidence_level)}`}>
      {contact.confidence_score} - {getReliabilityStatusLabel(contact.confidence_level, t)}
    </span>
  );
}

export function ContactReliabilityPage() {
  const { t, i18n } = useTranslation();
  const user = getStoredUser();
  const { selectedOrganizationId, isSuperAdmin } = useOutletContext<DashboardOutletContext>();
  const organizationId = isSuperAdmin ? selectedOrganizationId || null : user?.organizationId ?? null;
  const canRead = user?.role === "super_admin" || user?.role === "org_admin" || user?.role === "manager";
  const canWrite = user?.role === "super_admin" || user?.permissionKeys?.includes("contacts.write");
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>("risky");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [search, setSearch] = useState("");
  const [timelineContactId, setTimelineContactId] = useState("");
  const [mergeSelection, setMergeSelection] = useState<{
    group: DuplicateContactGroup;
    sourceContactId: string;
    targetContactId: string;
    preview?: MergePreview | null;
    confirmed: boolean;
  } | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["contact-reliability-summary", organizationId],
    queryFn: () => getContactReliabilitySummary({ organizationId }),
    enabled: canRead && (!isSuperAdmin || Boolean(organizationId))
  });

  const riskyQuery = useQuery({
    queryKey: ["contact-reliability-risky", organizationId, search],
    queryFn: () => getRiskyContacts({ organizationId, search, limit: 80 }),
    enabled: canRead && (!isSuperAdmin || Boolean(organizationId))
  });

  const unknownQuery = useQuery({
    queryKey: ["contact-reliability-unknown", organizationId],
    queryFn: () => getUnknownContacts({ organizationId, limit: 80 }),
    enabled: canRead && (!isSuperAdmin || Boolean(organizationId))
  });

  const duplicatesQuery = useQuery({
    queryKey: ["contact-reliability-duplicates", organizationId],
    queryFn: () => getDuplicateContactGroups({ organizationId, limit: 80 }),
    enabled: canRead && (!isSuperAdmin || Boolean(organizationId))
  });

  const timelineQuery = useQuery({
    queryKey: ["contact-reliability-timeline", organizationId, timelineContactId],
    queryFn: () => getContactReliabilityTimeline({ organizationId, contactId: timelineContactId }),
    enabled: canRead && Boolean(timelineContactId) && (!isSuperAdmin || Boolean(organizationId))
  });

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["contact-reliability"] });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["contact-reliability-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["contact-reliability-risky"] }),
      queryClient.invalidateQueries({ queryKey: ["contact-reliability-unknown"] }),
      queryClient.invalidateQueries({ queryKey: ["contact-reliability-duplicates"] }),
      queryClient.invalidateQueries({ queryKey: ["contact-reliability-timeline"] })
    ]);
  };

  const applyMutation = useMutation({
    mutationFn: applyContactSuggestion,
    onSuccess: async () => {
      setNotice({ type: "success", message: t("contactReliability.notices.repairApplied") });
      await refreshAll();
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : t("contactReliability.notices.applyRepairFailed") })
  });

  const previewMutation = useMutation({
    mutationFn: getMergePreview,
    onSuccess: (preview) => {
      setMergeSelection((current) => current ? { ...current, preview, confirmed: false } : current);
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : t("contactReliability.notices.mergePreviewFailed") })
  });

  const mergeMutation = useMutation({
    mutationFn: performReliabilityMerge,
    onSuccess: async () => {
      setNotice({ type: "success", message: t("contactReliability.notices.contactsMerged") });
      setMergeSelection(null);
      await refreshAll();
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : t("contactReliability.notices.mergeFailed") })
  });

  const recalculateMutation = useMutation({
    mutationFn: recalculateContactReliability,
    onSuccess: async () => {
      setNotice({ type: "success", message: t("contactReliability.notices.summaryRefreshed") });
      await refreshAll();
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : t("contactReliability.notices.recalculateFailed") })
  });

  const riskyContacts = riskyQuery.data ?? [];
  const unknownContacts = unknownQuery.data ?? [];
  const duplicateGroups = duplicatesQuery.data ?? [];
  const summary = summaryQuery.data;

  const filteredRiskyContacts = useMemo(
    () => riskyContacts.filter((contact) => contact.risk_flags.length > 0 || ["weak", "broken", "partial"].includes(contact.confidence_level)),
    [riskyContacts]
  );
  const riskyPagination = usePanelPagination(filteredRiskyContacts);
  const unknownPagination = usePanelPagination(unknownContacts);

  if (!canRead) {
    return (
      <div className="workspace-block p-6">
        <h1 className="text-xl font-semibold text-text">{t("contactReliability.title")}</h1>
        <p className="mt-2 text-sm text-text-muted">{t("contactReliability.noAccess")}</p>
      </div>
    );
  }

  if (isSuperAdmin && !organizationId) {
    return (
      <div className="workspace-block p-6">
        <h1 className="text-xl font-semibold text-text">{t("contactReliability.title")}</h1>
        <p className="mt-2 text-sm text-text-muted">{t("contactReliability.chooseOrganization")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{t("contactReliability.title")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-text">{t("contactReliability.title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            {t("contactReliability.subtitle")}
          </p>
        </div>
        <Button
          className="w-fit px-4 py-2 text-sm"
          onClick={() => recalculateMutation.mutate({ organizationId })}
          disabled={recalculateMutation.isPending}
        >
          <RefreshCw size={16} className={recalculateMutation.isPending ? "animate-spin" : ""} />
          <span className="ml-2">{t("contactReliability.recalculate")}</span>
        </Button>
      </div>

      {notice ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${notice.type === "success" ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("contactReliability.stats.totalContacts")} value={summary?.total_contacts ?? "..."} />
        <StatCard label={t("contactReliability.stats.verified")} value={summary?.verified_count ?? "..."} tone="good" />
        <StatCard label={t("contactReliability.stats.partial")} value={summary?.partial_count ?? "..."} tone="warn" />
        <StatCard label={t("contactReliability.stats.weakBroken")} value={(summary?.weak_count ?? 0) + (summary?.broken_count ?? 0) || "..."} tone="bad" />
        <StatCard label={t("contactReliability.stats.unknownNames")} value={summary?.unknown_name_count ?? "..."} tone="warn" />
        <StatCard label={t("contactReliability.stats.missingPhones")} value={summary?.missing_phone_count ?? "..."} tone="warn" />
        <StatCard label={t("contactReliability.stats.duplicateGroups")} value={duplicateGroups.length} tone="bad" />
        <StatCard label={t("contactReliability.stats.identityConflicts")} value={summary?.identity_conflict_count ?? "..."} tone="bad" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {[
          ["risky", t("contactReliability.tabs.risky")],
          ["unknown", t("contactReliability.tabs.unknown")],
          ["duplicates", t("contactReliability.tabs.duplicates")],
          ["timeline", t("contactReliability.tabs.timeline")]
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${activeTab === key ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text"}`}
            onClick={() => setActiveTab(key as ActiveTab)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "risky" ? (
        <section className="space-y-3">
          <div className="flex max-w-md items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Search size={16} className="text-text-soft" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("contactReliability.searchPlaceholder")} className="border-0 bg-transparent px-0 py-0" />
          </div>
          <div className="workspace-table-wrap">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>{t("contactReliability.table.contact")}</th>
                  <th>{t("contactReliability.table.phone")}</th>
                  <th>{t("contactReliability.table.score")}</th>
                  <th>{t("contactReliability.table.riskFlags")}</th>
                  <th>{t("contactReliability.table.lastActivity")}</th>
                  <th>{t("contactReliability.table.owner")}</th>
                  <th>{t("contactReliability.table.action")}</th>
                </tr>
              </thead>
              <tbody>
                {riskyPagination.visibleItems.map((contact) => (
                  <tr key={contact.contact_id}>
                    <td>
                      <div className="font-semibold text-text">{contact.display_name || t("contactReliability.unknownContact")}</div>
                      <div className="text-xs text-text-muted">{t("contactReliability.identityConversationCount", { identities: contact.identity_count, conversations: contact.conversation_count })}</div>
                    </td>
                    <td>{contact.primary_phone_normalized || contact.primary_phone_e164 || t("contactReliability.missing")}</td>
                    <td><ScoreBadge contact={contact} /></td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {contact.risk_flags.map((flag) => (
                          <span key={flag} className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-text-muted">{getDisplayRiskFlagLabel(flag, t)}</span>
                        ))}
                      </div>
                    </td>
                    <td>{formatDate(contact.last_message_at, i18n.language, t)}</td>
                    <td>{contact.owner_user_id ? t("contactReliability.assigned") : t("contactReliability.unassigned")}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setTimelineContactId(contact.contact_id); setActiveTab("timeline"); }}>
                          <Eye size={14} />
                          <span className="ml-1">{t("contactReliability.timeline")}</span>
                        </Button>
                        {canWrite && contact.risk_flags[0] ? (
                          <Button variant="ghost" className="border border-border px-2 py-1 text-xs" onClick={() => applyMutation.mutate({ contactId: contact.contact_id, organizationId, action: "ignore_flag", flag: contact.risk_flags[0] })}>
                            {t("contactReliability.ignore")}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PanelPagination page={riskyPagination.page} pageCount={riskyPagination.pageCount} pageSize={riskyPagination.pageSize} totalItems={riskyPagination.totalItems} onPageChange={riskyPagination.setPage} />
        </section>
      ) : null}

      {activeTab === "unknown" ? (
        <section>
          <div className="workspace-table-wrap">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>{t("contactReliability.table.currentName")}</th>
                  <th>{t("contactReliability.table.suggestedName")}</th>
                  <th>{t("contactReliability.table.phoneJid")}</th>
                  <th>{t("contactReliability.table.source")}</th>
                  <th>{t("contactReliability.table.score")}</th>
                  <th>{t("contactReliability.table.suggestedAction")}</th>
                  <th>{t("contactReliability.table.action")}</th>
                </tr>
              </thead>
              <tbody>
                {unknownPagination.visibleItems.map((contact: UnknownContact) => {
                  const showApplyName = canApplySuggestedName(contact);

                  return (
                    <tr key={contact.contact_id}>
                      <td>{contact.display_name || t("contactReliability.unknownContact")}</td>
                      <td>{contact.best_available_name || t("contactReliability.needsReview")}</td>
                      <td>{contact.primary_phone_e164 || contact.whatsapp_jids[0] || t("contactReliability.missing")}</td>
                      <td>{contact.profile_names[0] || contact.push_names[0] || t("contactReliability.whatsappIdentity")}</td>
                      <td>{contact.confidence_score}</td>
                      <td>{getSuggestedActionLabel(contact.suggested_action, t)}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {canWrite && showApplyName ? (
                            <Button className="px-2 py-1 text-xs" onClick={() => applyMutation.mutate({ contactId: contact.contact_id, organizationId, action: "update_name", displayName: contact.best_available_name })}>
                              <CheckCircle2 size={14} />
                              <span className="ml-1">{t("contactReliability.applyName")}</span>
                            </Button>
                          ) : null}
                          {canWrite ? (
                            <Button variant="ghost" className="border border-border px-2 py-1 text-xs" onClick={() => applyMutation.mutate({ contactId: contact.contact_id, organizationId, action: "ignore_flag", flag: contact.risk_flags[0] ?? "needs_manual_review" })}>
                              {t("contactReliability.ignore")}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PanelPagination page={unknownPagination.page} pageCount={unknownPagination.pageCount} pageSize={unknownPagination.pageSize} totalItems={unknownPagination.totalItems} onPageChange={unknownPagination.setPage} />
        </section>
      ) : null}

      {activeTab === "duplicates" ? (
        <section className="space-y-3">
          {duplicateGroups.length === 0 ? (
            <div className="workspace-block p-5 text-sm text-text-muted">{t("contactReliability.empty.noDuplicateGroups")}</div>
          ) : (
            duplicateGroups.map((group) => (
              <div key={group.group_key} className="workspace-block p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{getDisplayRiskFlagLabel(group.reason, t)}</p>
                    <h2 className="mt-1 text-lg font-semibold text-text">{group.normalized_phone ?? group.group_key}</h2>
                    <p className="mt-1 text-sm text-text-muted">{t("contactReliability.recommendedTarget", { target: group.recommended_target_contact_id ?? t("contactReliability.reviewManually") })}</p>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-md border border-warning/20 bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">
                    <AlertTriangle size={14} />
                    <span className="ml-1">{t("contactReliability.confidence", { confidence: group.confidence })}</span>
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.contacts.map((contact) => (
                    <div key={contact.contact_id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text">{contact.display_name || t("contactReliability.unknownContact")}</p>
                          <p className="mt-1 text-xs text-text-muted">{contact.primary_phone_normalized || contact.primary_phone_e164 || t("contactReliability.riskFlags.missing_phone")}</p>
                        </div>
                        <ScoreBadge contact={contact} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canWrite && group.recommended_target_contact_id && group.recommended_target_contact_id !== contact.contact_id ? (
                          <Button
                            className="px-2 py-1 text-xs"
                            onClick={() => {
                              const selection = {
                                group,
                                sourceContactId: contact.contact_id,
                                targetContactId: group.recommended_target_contact_id!,
                                preview: null,
                                confirmed: false
                              };
                              setMergeSelection(selection);
                              previewMutation.mutate({
                                groupKey: group.group_key,
                                organizationId,
                                sourceContactId: selection.sourceContactId,
                                targetContactId: selection.targetContactId
                              });
                            }}
                          >
                            <GitMerge size={14} />
                            <span className="ml-1">{t("contactReliability.previewMerge")}</span>
                          </Button>
                        ) : null}
                        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setTimelineContactId(contact.contact_id); setActiveTab("timeline"); }}>
                          {t("contactReliability.timeline")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      ) : null}

      {activeTab === "timeline" ? (
        <section className="space-y-3">
          <div className="flex max-w-xl gap-2">
            <Input value={timelineContactId} onChange={(event) => setTimelineContactId(event.target.value)} placeholder={t("contactReliability.pasteContactId")} className="px-3 py-2" />
            <Button variant="secondary" className="px-3 py-2" onClick={() => timelineQuery.refetch()} disabled={!timelineContactId}>
              <Search size={15} />
            </Button>
          </div>
          <div className="workspace-block p-4">
            {timelineQuery.isFetching ? (
              <p className="text-sm text-text-muted">{t("contactReliability.loadingTimeline")}</p>
            ) : (timelineQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-text-muted">{t("contactReliability.empty.searchContactTimeline")}</p>
            ) : (
              <div className="space-y-3">
                {(timelineQuery.data ?? []).map((event, index) => (
                  <div key={`${event.event_type}-${event.occurred_at}-${index}`} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-text">{getDisplayRiskFlagLabel(event.event_type, t)}</p>
                      <p className="text-xs text-text-muted">{formatDate(event.occurred_at, i18n.language, t)}</p>
                    </div>
                    <p className="mt-1 text-xs text-text-soft">{t("contactReliability.sourceWithValue", { source: event.source })}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <PopupOverlay
        open={Boolean(mergeSelection)}
        onClose={() => setMergeSelection(null)}
        title={t("contactReliability.mergePreview.title")}
        description={t("contactReliability.mergePreview.description")}
        panelClassName="max-w-[min(44rem,calc(100vw-2rem))]"
      >
        {mergeSelection ? (
          <div className="space-y-4">
            {!mergeSelection.preview || previewMutation.isPending ? (
              <p className="text-sm text-text-muted">{t("contactReliability.mergePreview.building")}</p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{t("contactReliability.table.source")}</p>
                    <p className="mt-2 text-sm text-text">{String(mergeSelection.preview.source_contact?.display_name ?? mergeSelection.sourceContactId)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{t("contactReliability.mergePreview.target")}</p>
                    <p className="mt-2 text-sm text-text">{String(mergeSelection.preview.target_contact?.display_name ?? mergeSelection.targetContactId)}</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <StatCard label={t("contactReliability.mergePreview.identities")} value={mergeSelection.preview.identities_to_move} />
                  <StatCard label={t("contactReliability.mergePreview.conversations")} value={mergeSelection.preview.conversations_to_move} />
                  <StatCard label={t("contactReliability.mergePreview.messages")} value={mergeSelection.preview.messages_affected_count} />
                </div>
                {mergeSelection.preview.warnings.length > 0 ? (
                  <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                    {mergeSelection.preview.warnings.map((warning) => <p key={warning}>{getDisplayRiskFlagLabel(warning, t)}</p>)}
                  </div>
                ) : null}
                {mergeSelection.preview.blocking_errors.length > 0 ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {mergeSelection.preview.blocking_errors.map((error) => <p key={error}>{getDisplayRiskFlagLabel(error, t)}</p>)}
                  </div>
                ) : null}
                <label className="flex items-start gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={mergeSelection.confirmed}
                    onChange={(event) => setMergeSelection((current) => current ? { ...current, confirmed: event.target.checked } : current)}
                  />
                  <span>{t("contactReliability.mergePreview.confirmText")}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="px-4 py-2 text-sm"
                    disabled={!mergeSelection.confirmed || mergeSelection.preview.blocking_errors.length > 0 || mergeMutation.isPending}
                    onClick={() => mergeMutation.mutate({
                      organizationId,
                      sourceContactId: mergeSelection.sourceContactId,
                      targetContactId: mergeSelection.targetContactId,
                      note: "Merged from Contact Reliability dashboard"
                    })}
                  >
                    <ShieldCheck size={16} />
                    <span className="ml-2">{mergeMutation.isPending ? t("contactReliability.mergePreview.merging") : t("contactReliability.mergePreview.confirmMerge")}</span>
                  </Button>
                  <Button variant="secondary" className="px-4 py-2 text-sm" onClick={() => setMergeSelection(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </PopupOverlay>
    </div>
  );
}
