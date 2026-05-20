import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye, GitMerge, RefreshCw, Search, ShieldCheck, Wrench } from "lucide-react";
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
import type { DashboardOutletContext } from "../layouts/DashboardLayout";

type ActiveTab = "risky" | "unknown" | "duplicates" | "timeline";

type Notice = {
  type: "success" | "error";
  message: string;
};

function formatDate(value?: string | null) {
  if (!value) return "No activity";
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function levelClass(level: string) {
  if (level === "verified" || level === "strong") return "border-success/20 bg-success/10 text-success";
  if (level === "partial") return "border-warning/20 bg-warning/10 text-warning";
  return "border-destructive/20 bg-destructive/10 text-destructive";
}

function flagLabel(flag: string) {
  return flag.replace(/_/g, " ");
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
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
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${levelClass(contact.confidence_level)}`}>
      {contact.confidence_score} · {contact.confidence_level}
    </span>
  );
}

export function ContactReliabilityPage() {
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
      setNotice({ type: "success", message: "Repair action applied." });
      await refreshAll();
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to apply repair action." })
  });

  const previewMutation = useMutation({
    mutationFn: getMergePreview,
    onSuccess: (preview) => {
      setMergeSelection((current) => current ? { ...current, preview, confirmed: false } : current);
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to create merge preview." })
  });

  const mergeMutation = useMutation({
    mutationFn: performReliabilityMerge,
    onSuccess: async () => {
      setNotice({ type: "success", message: "Contacts merged safely." });
      setMergeSelection(null);
      await refreshAll();
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to merge contacts." })
  });

  const recalculateMutation = useMutation({
    mutationFn: recalculateContactReliability,
    onSuccess: async () => {
      setNotice({ type: "success", message: "Reliability summary refreshed." });
      await refreshAll();
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to recalculate reliability." })
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
        <h1 className="text-xl font-semibold text-text">Contact Reliability</h1>
        <p className="mt-2 text-sm text-text-muted">You do not have access to the reliability dashboard.</p>
      </div>
    );
  }

  if (isSuperAdmin && !organizationId) {
    return (
      <div className="workspace-block p-6">
        <h1 className="text-xl font-semibold text-text">Contact Reliability</h1>
        <p className="mt-2 text-sm text-text-muted">Choose an organization from the sidebar to review contact reliability.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Contact Reliability</p>
          <h1 className="mt-2 text-2xl font-semibold text-text">Contact Reliability</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Detect unknown contacts, duplicate identities and risky profiles before they break your inbox.
          </p>
        </div>
        <Button
          className="w-fit px-4 py-2 text-sm"
          onClick={() => recalculateMutation.mutate({ organizationId })}
          disabled={recalculateMutation.isPending}
        >
          <RefreshCw size={16} className={recalculateMutation.isPending ? "animate-spin" : ""} />
          <span className="ml-2">Recalculate</span>
        </Button>
      </div>

      {notice ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${notice.type === "success" ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Contacts" value={summary?.total_contacts ?? "..."} />
        <StatCard label="Verified" value={summary?.verified_count ?? "..."} tone="good" />
        <StatCard label="Partial" value={summary?.partial_count ?? "..."} tone="warn" />
        <StatCard label="Weak/Broken" value={(summary?.weak_count ?? 0) + (summary?.broken_count ?? 0) || "..."} tone="bad" />
        <StatCard label="Unknown Names" value={summary?.unknown_name_count ?? "..."} tone="warn" />
        <StatCard label="Missing Phones" value={summary?.missing_phone_count ?? "..."} tone="warn" />
        <StatCard label="Duplicate Groups" value={duplicateGroups.length} tone="bad" />
        <StatCard label="Identity Conflicts" value={summary?.identity_conflict_count ?? "..."} tone="bad" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {[
          ["risky", "Risky Contacts"],
          ["unknown", "Unknown Contacts"],
          ["duplicates", "Duplicate Candidates"],
          ["timeline", "Timeline / Lookup"]
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
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, or JID" className="border-0 bg-transparent px-0 py-0" />
          </div>
          <div className="workspace-table-wrap">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Score</th>
                  <th>Risk Flags</th>
                  <th>Last Activity</th>
                  <th>Owner</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {riskyPagination.visibleItems.map((contact) => (
                  <tr key={contact.contact_id}>
                    <td>
                      <div className="font-semibold text-text">{contact.display_name || "Unknown contact"}</div>
                      <div className="text-xs text-text-muted">{contact.identity_count} identities · {contact.conversation_count} conversations</div>
                    </td>
                    <td>{contact.primary_phone_normalized || contact.primary_phone_e164 || "Missing"}</td>
                    <td><ScoreBadge contact={contact} /></td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {contact.risk_flags.map((flag) => (
                          <span key={flag} className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-text-muted">{flagLabel(flag)}</span>
                        ))}
                      </div>
                    </td>
                    <td>{formatDate(contact.last_message_at)}</td>
                    <td>{contact.owner_user_id ? "Assigned" : "Unassigned"}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setTimelineContactId(contact.contact_id); setActiveTab("timeline"); }}>
                          <Eye size={14} />
                          <span className="ml-1">Timeline</span>
                        </Button>
                        {canWrite && contact.risk_flags[0] ? (
                          <Button variant="ghost" className="border border-border px-2 py-1 text-xs" onClick={() => applyMutation.mutate({ contactId: contact.contact_id, organizationId, action: "ignore_flag", flag: contact.risk_flags[0] })}>
                            Ignore
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
                  <th>Current Name</th>
                  <th>Suggested Name</th>
                  <th>Phone/JID</th>
                  <th>Source</th>
                  <th>Score</th>
                  <th>Suggested Action</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {unknownPagination.visibleItems.map((contact: UnknownContact) => (
                  <tr key={contact.contact_id}>
                    <td>{contact.display_name || "Unknown contact"}</td>
                    <td>{contact.best_available_name || "Needs review"}</td>
                    <td>{contact.primary_phone_e164 || contact.whatsapp_jids[0] || "Missing"}</td>
                    <td>{contact.profile_names[0] || contact.push_names[0] || "WhatsApp identity"}</td>
                    <td>{contact.confidence_score}</td>
                    <td>{humanize(contact.suggested_action)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {canWrite && contact.best_available_name ? (
                          <Button className="px-2 py-1 text-xs" onClick={() => applyMutation.mutate({ contactId: contact.contact_id, organizationId, action: "update_name", displayName: contact.best_available_name })}>
                            <CheckCircle2 size={14} />
                            <span className="ml-1">Apply name</span>
                          </Button>
                        ) : null}
                        {canWrite ? (
                          <Button variant="ghost" className="border border-border px-2 py-1 text-xs" onClick={() => applyMutation.mutate({ contactId: contact.contact_id, organizationId, action: "ignore_flag", flag: contact.risk_flags[0] ?? "needs_manual_review" })}>
                            Ignore
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PanelPagination page={unknownPagination.page} pageCount={unknownPagination.pageCount} pageSize={unknownPagination.pageSize} totalItems={unknownPagination.totalItems} onPageChange={unknownPagination.setPage} />
        </section>
      ) : null}

      {activeTab === "duplicates" ? (
        <section className="space-y-3">
          {duplicateGroups.length === 0 ? (
            <div className="workspace-block p-5 text-sm text-text-muted">No duplicate phone groups found.</div>
          ) : (
            duplicateGroups.map((group) => (
              <div key={group.group_key} className="workspace-block p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{humanize(group.reason)}</p>
                    <h2 className="mt-1 text-lg font-semibold text-text">{group.normalized_phone ?? group.group_key}</h2>
                    <p className="mt-1 text-sm text-text-muted">Recommended target: {group.recommended_target_contact_id ?? "Review manually"}</p>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-md border border-warning/20 bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">
                    <AlertTriangle size={14} />
                    <span className="ml-1">{group.confidence} confidence</span>
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.contacts.map((contact) => (
                    <div key={contact.contact_id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text">{contact.display_name || "Unknown contact"}</p>
                          <p className="mt-1 text-xs text-text-muted">{contact.primary_phone_normalized || contact.primary_phone_e164 || "Missing phone"}</p>
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
                            <span className="ml-1">Preview merge</span>
                          </Button>
                        ) : null}
                        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setTimelineContactId(contact.contact_id); setActiveTab("timeline"); }}>
                          Timeline
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
            <Input value={timelineContactId} onChange={(event) => setTimelineContactId(event.target.value)} placeholder="Paste contact ID" className="px-3 py-2" />
            <Button variant="secondary" className="px-3 py-2" onClick={() => timelineQuery.refetch()} disabled={!timelineContactId}>
              <Search size={15} />
            </Button>
          </div>
          <div className="workspace-block p-4">
            {timelineQuery.isFetching ? (
              <p className="text-sm text-text-muted">Loading timeline...</p>
            ) : (timelineQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-text-muted">Search a contact to view available source events.</p>
            ) : (
              <div className="space-y-3">
                {(timelineQuery.data ?? []).map((event, index) => (
                  <div key={`${event.event_type}-${event.occurred_at}-${index}`} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-text">{humanize(event.event_type)}</p>
                      <p className="text-xs text-text-muted">{formatDate(event.occurred_at)}</p>
                    </div>
                    <p className="mt-1 text-xs text-text-soft">Source: {event.source}</p>
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
        title="Merge preview"
        description="Review what will move before confirming the merge."
        panelClassName="max-w-[min(44rem,calc(100vw-2rem))]"
      >
        {mergeSelection ? (
          <div className="space-y-4">
            {!mergeSelection.preview || previewMutation.isPending ? (
              <p className="text-sm text-text-muted">Building merge preview...</p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Source</p>
                    <p className="mt-2 text-sm text-text">{String(mergeSelection.preview.source_contact?.display_name ?? mergeSelection.sourceContactId)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Target</p>
                    <p className="mt-2 text-sm text-text">{String(mergeSelection.preview.target_contact?.display_name ?? mergeSelection.targetContactId)}</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <StatCard label="Identities" value={mergeSelection.preview.identities_to_move} />
                  <StatCard label="Conversations" value={mergeSelection.preview.conversations_to_move} />
                  <StatCard label="Messages" value={mergeSelection.preview.messages_affected_count} />
                </div>
                {mergeSelection.preview.warnings.length > 0 ? (
                  <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                    {mergeSelection.preview.warnings.map((warning) => <p key={warning}>{humanize(warning)}</p>)}
                  </div>
                ) : null}
                {mergeSelection.preview.blocking_errors.length > 0 ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {mergeSelection.preview.blocking_errors.map((error) => <p key={error}>{humanize(error)}</p>)}
                  </div>
                ) : null}
                <label className="flex items-start gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={mergeSelection.confirmed}
                    onChange={(event) => setMergeSelection((current) => current ? { ...current, confirmed: event.target.checked } : current)}
                  />
                  <span>I understand this will merge source contact into target contact.</span>
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
                    <span className="ml-2">{mergeMutation.isPending ? "Merging..." : "Confirm merge"}</span>
                  </Button>
                  <Button variant="secondary" className="px-4 py-2 text-sm" onClick={() => setMergeSelection(null)}>
                    Cancel
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
