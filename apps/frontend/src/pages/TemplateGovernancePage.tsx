import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, GitCompare, History, RefreshCw, RotateCcw, Send, ShieldCheck, XCircle } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import {
  approveTemplateVersion,
  archiveGovernedTemplate,
  createGovernedTemplate,
  createTemplateVersion,
  getGovernedTemplates,
  getTemplateDiff,
  getTemplateGovernanceSettings,
  getTemplateVersions,
  rejectTemplateVersion,
  rollbackTemplateVersion,
  submitTemplateForReview,
  updateTemplateGovernanceSettings,
  type GovernedTemplate,
  type TemplateDiff,
  type TemplateStatus,
  type TemplateType,
  type TemplateVersion
} from "../api/templateGovernance";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { PopupOverlay } from "../components/PopupOverlay";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { CampaignModuleTabs } from "../modules/campaigns/components/CampaignModuleTabs";

type Notice = { type: "success" | "error"; message: string };
type ActiveTab = "templates" | "approval" | "settings";

const statusTone: Record<TemplateStatus, string> = {
  approved: "border-success/20 bg-success/10 text-success",
  pending_review: "border-warning/20 bg-warning/10 text-warning",
  draft: "border-border bg-background-tint text-text-muted",
  rejected: "border-destructive/20 bg-destructive/10 text-destructive",
  archived: "border-border bg-card text-text-soft"
};

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

function StatusBadge({ status }: { status: TemplateStatus }) {
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusTone[status]}`}>{humanize(status)}</span>;
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
    </div>
  );
}

export function TemplateGovernancePage() {
  const { selectedOrganizationId, selectedOrganizationName } = useOutletContext<DashboardOutletContext>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>("templates");
  const [selectedTemplate, setSelectedTemplate] = useState<GovernedTemplate | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<TemplateVersion | null>(null);
  const [diff, setDiff] = useState<TemplateDiff | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [newTemplate, setNewTemplate] = useState({
    title: "",
    body: "",
    category: "",
    changeSummary: "Initial governed version"
  });
  const [versionDraft, setVersionDraft] = useState({
    title: "",
    body: "",
    category: "",
    changeSummary: ""
  });
  const [reviewNote, setReviewNote] = useState("");

  const queryScope = { organizationId: selectedOrganizationId ?? null };
  const templatesQuery = useQuery({
    queryKey: ["template-governance", "templates", selectedOrganizationId],
    queryFn: () => getGovernedTemplates({ ...queryScope, limit: 200 })
  });
  const settingsQuery = useQuery({
    queryKey: ["template-governance", "settings", selectedOrganizationId],
    queryFn: () => getTemplateGovernanceSettings(queryScope)
  });
  const versionsQuery = useQuery({
    queryKey: ["template-governance", "versions", selectedOrganizationId, selectedTemplate?.template_id],
    queryFn: () =>
      selectedTemplate
        ? getTemplateVersions({
            templateId: selectedTemplate.template_id,
            templateType: selectedTemplate.template_type,
            organizationId: selectedOrganizationId
          })
        : Promise.resolve([]),
    enabled: Boolean(selectedTemplate)
  });

  const templates = templatesQuery.data ?? [];
  const pendingTemplates = templates.filter((template) => template.current_status === "pending_review");
  const templatesPagination = usePanelPagination(templates);
  const pendingTemplatesPagination = usePanelPagination(pendingTemplates);
  const versionsPagination = usePanelPagination(versionsQuery.data ?? []);
  const stats = useMemo(
    () => ({
      total: templates.length,
      draft: templates.filter((template) => template.current_status === "draft").length,
      pending: pendingTemplates.length,
      approved: templates.filter((template) => template.current_status === "approved").length,
      rejected: templates.filter((template) => template.current_status === "rejected").length,
      archived: templates.filter((template) => template.current_status === "archived").length,
      multiVersion: templates.filter((template) => Number(template.latest_version_number ?? 0) > 1).length,
      used: templates.filter((template) => Number(template.usage_count ?? 0) > 0 || Number(template.send_count ?? 0) > 0).length
    }),
    [pendingTemplates.length, templates]
  );

  function invalidateGovernance() {
    void queryClient.invalidateQueries({ queryKey: ["template-governance"] });
  }

  function showNotice(type: Notice["type"], message: string) {
    setNotice({ type, message });
  }

  const createTemplateMutation = useMutation({
    mutationFn: () =>
      createGovernedTemplate({
        organizationId: selectedOrganizationId,
        template_type: "campaign_message",
        title: newTemplate.title,
        body: newTemplate.body,
        category: newTemplate.category || null,
        change_summary: newTemplate.changeSummary || null
      }),
    onSuccess: () => {
      setNewTemplate({ title: "", body: "", category: "", changeSummary: "Initial governed version" });
      showNotice("success", "Template version created.");
      invalidateGovernance();
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to create template.")
  });

  const createVersionMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) throw new Error("Select a template first.");
      return createTemplateVersion({
        templateId: selectedTemplate.template_id,
        organizationId: selectedOrganizationId,
        template_type: selectedTemplate.template_type,
        title: versionDraft.title,
        body: versionDraft.body,
        category: versionDraft.category || null,
        change_summary: versionDraft.changeSummary || "New governed version"
      });
    },
    onSuccess: () => {
      showNotice("success", "New draft version created.");
      setVersionDraft({ title: "", body: "", category: "", changeSummary: "" });
      invalidateGovernance();
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to create version.")
  });

  const actionMutation = useMutation({
    mutationFn: async (action: "submit" | "approve" | "reject" | "rollback" | "archive") => {
      if (!selectedTemplate) throw new Error("Select a template first.");
      if (action === "archive") return archiveGovernedTemplate({ templateId: selectedTemplate.template_id, organizationId: selectedOrganizationId });
      if (!selectedVersion) throw new Error("Select a version first.");
      if (action === "submit") {
        return submitTemplateForReview({ templateId: selectedTemplate.template_id, versionId: selectedVersion.version_id, organizationId: selectedOrganizationId });
      }
      if (action === "approve") {
        return approveTemplateVersion({
          templateId: selectedTemplate.template_id,
          versionId: selectedVersion.version_id,
          organizationId: selectedOrganizationId,
          note: reviewNote || null
        });
      }
      if (action === "reject") {
        return rejectTemplateVersion({
          templateId: selectedTemplate.template_id,
          versionId: selectedVersion.version_id,
          organizationId: selectedOrganizationId,
          note: reviewNote || "Rejected in governance review"
        });
      }
      return rollbackTemplateVersion({
        templateId: selectedTemplate.template_id,
        versionId: selectedVersion.version_id,
        organizationId: selectedOrganizationId,
        change_summary: reviewNote || `Rollback from version ${selectedVersion.version_number}`
      });
    },
    onSuccess: () => {
      showNotice("success", "Template governance action completed.");
      setReviewNote("");
      setSelectedVersion(null);
      invalidateGovernance();
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Template governance action failed.")
  });

  const settingsMutation = useMutation({
    mutationFn: (patch: Partial<NonNullable<typeof settingsQuery.data>>) =>
      updateTemplateGovernanceSettings({
        organizationId: selectedOrganizationId,
        ...patch
      }),
    onSuccess: () => {
      showNotice("success", "Governance settings updated.");
      invalidateGovernance();
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to update settings.")
  });

  async function loadDiff(version: TemplateVersion) {
    const compareTo = versionsQuery.data?.find((item) => item.version_number === version.version_number - 1);
    if (!selectedTemplate || !compareTo) {
      showNotice("error", "No previous version is available to compare.");
      return;
    }

    try {
      const result = await getTemplateDiff({
        templateId: selectedTemplate.template_id,
        versionId: version.version_id,
        compareToVersionId: compareTo.version_id,
        organizationId: selectedOrganizationId
      });
      setDiff(result);
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Unable to load diff.");
    }
  }

  function openTemplate(template: GovernedTemplate) {
    setSelectedTemplate(template);
    setSelectedVersion(null);
    setDiff(null);
    setVersionDraft({
      title: template.title,
      body: template.active_body ?? template.active_snapshot?.body ?? "",
      category: template.category ?? "",
      changeSummary: ""
    });
  }

  const settings = settingsQuery.data;

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <CampaignModuleTabs channel="whatsapp" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">WhatsApp Campaigns</p>
          <h1 className="mt-2 text-3xl font-semibold text-text">Template Governance</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Version, approve and roll back campaign messages and quick replies before teams use them with customers.
          </p>
          {selectedOrganizationName ? <p className="mt-1 text-xs text-text-soft">Workspace: {selectedOrganizationName}</p> : null}
        </div>
      </header>

      {notice ? (
        <div className={notice.type === "error" ? "rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" : "rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Templates" value={stats.total} />
        <StatCard label="Draft" value={stats.draft} />
        <StatCard label="Pending Review" value={stats.pending} />
        <StatCard label="Approved" value={stats.approved} />
        <StatCard label="Rejected" value={stats.rejected} />
        <StatCard label="Archived" value={stats.archived} />
        <StatCard label="Multiple Versions" value={stats.multiVersion} />
        <StatCard label="Used In Sends" value={stats.used} />
      </section>

      <div className="flex flex-wrap gap-2">
        {(["templates", "approval", "settings"] as ActiveTab[]).map((tab) => (
          <Button key={tab} variant={activeTab === tab ? "primary" : "secondary"} onClick={() => setActiveTab(tab)}>
            {tab === "templates" ? "Template List" : tab === "approval" ? "Approval Queue" : "Settings"}
          </Button>
        ))}
        <Button variant="secondary" onClick={() => void templatesQuery.refetch()}>
          <RefreshCw size={16} /> Refresh
        </Button>
      </div>

      {activeTab === "templates" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="workspace-table-wrap overflow-x-auto">
            <table className="workspace-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Template Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Active Version</th>
                  <th>Latest Version</th>
                  <th>Last Updated</th>
                  <th>Usage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templatesPagination.visibleItems.map((template) => (
                  <tr key={template.template_id}>
                    <td>
                      <p className="font-semibold text-text">{template.title}</p>
                      <p className="text-xs text-text-muted">{template.category || "No category"}</p>
                    </td>
                    <td>{humanize(template.template_type)}</td>
                    <td><StatusBadge status={template.current_status} /></td>
                    <td>{template.active_version_number ? `v${template.active_version_number}` : "None"}</td>
                    <td>{template.latest_version_number ? `v${template.latest_version_number}` : "None"}</td>
                    <td>{formatDate(template.last_updated_at)}</td>
                    <td>{Number(template.usage_count ?? 0) + Number(template.send_count ?? 0)}</td>
                    <td>
                      <Button variant="secondary" onClick={() => openTemplate(template)}>
                        <History size={14} /> View Versions
                      </Button>
                    </td>
                  </tr>
                ))}
                {!templates.length ? (
                  <tr>
                    <td colSpan={8} className="text-center text-text-muted">
                      {templatesQuery.isLoading ? "Loading templates..." : "No governed templates yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
          <PanelPagination page={templatesPagination.page} pageCount={templatesPagination.pageCount} pageSize={templatesPagination.pageSize} totalItems={templatesPagination.totalItems} onPageChange={templatesPagination.setPage} />

          <section className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <h2 className="text-sm font-semibold text-text">Create Campaign Template</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="workspace-label">Name</span>
                <Input value={newTemplate.title} onChange={(event) => setNewTemplate((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="block">
                <span className="workspace-label">Category</span>
                <Input value={newTemplate.category} onChange={(event) => setNewTemplate((current) => ({ ...current, category: event.target.value }))} />
              </label>
              <label className="block">
                <span className="workspace-label">Message</span>
                <textarea className="input-base min-h-36 w-full" value={newTemplate.body} onChange={(event) => setNewTemplate((current) => ({ ...current, body: event.target.value }))} />
              </label>
              <label className="block">
                <span className="workspace-label">Change Summary</span>
                <Input value={newTemplate.changeSummary} onChange={(event) => setNewTemplate((current) => ({ ...current, changeSummary: event.target.value }))} />
              </label>
              <Button disabled={!newTemplate.title.trim() || !newTemplate.body.trim() || createTemplateMutation.isPending} onClick={() => createTemplateMutation.mutate()}>
                <ShieldCheck size={16} /> Create Versioned Template
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "approval" ? (
        <>
          <section className="workspace-table-wrap overflow-x-auto">
            <table className="workspace-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Latest Version</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingTemplatesPagination.visibleItems.map((template) => (
                  <tr key={template.template_id}>
                    <td>{template.title}</td>
                    <td>{humanize(template.template_type)}</td>
                    <td><StatusBadge status={template.current_status} /></td>
                    <td>{template.latest_version_number ? `v${template.latest_version_number}` : "None"}</td>
                    <td>{formatDate(template.last_updated_at)}</td>
                    <td>
                      <Button variant="secondary" onClick={() => openTemplate(template)}>
                        <Send size={14} /> Review
                      </Button>
                    </td>
                  </tr>
                ))}
                {!pendingTemplates.length ? (
                  <tr>
                    <td colSpan={6} className="text-center text-text-muted">No templates are waiting for review.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
          <PanelPagination page={pendingTemplatesPagination.page} pageCount={pendingTemplatesPagination.pageCount} pageSize={pendingTemplatesPagination.pageSize} totalItems={pendingTemplatesPagination.totalItems} onPageChange={pendingTemplatesPagination.setPage} />
        </>
      ) : null}

      {activeTab === "settings" && settings ? (
        <section className="grid gap-4 md:grid-cols-2">
          {[
            ["approval_required", "Require approval before use"],
            ["lock_approved_templates", "Lock approved templates from direct edit"],
            ["auto_approve_org_admin_templates", "Auto-approve org admin templates"],
            ["allow_agent_custom_templates", "Allow agents to create personal templates"]
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-text shadow-soft">
              {label}
              <input
                type="checkbox"
                checked={Boolean(settings[key as keyof typeof settings])}
                onChange={(event) => settingsMutation.mutate({ [key]: event.target.checked })}
              />
            </label>
          ))}
        </section>
      ) : null}

      <PopupOverlay
        open={Boolean(selectedTemplate)}
        onClose={() => {
          setSelectedTemplate(null);
          setSelectedVersion(null);
          setDiff(null);
        }}
        title={selectedTemplate?.title ?? "Template Versions"}
        description="Review history, create a new version, compare changes, approve or roll back safely."
        panelClassName="max-w-5xl"
      >
        {selectedTemplate ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="workspace-table-wrap overflow-x-auto">
                <table className="workspace-table workspace-table-compact min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Summary</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versionsPagination.visibleItems.map((version) => (
                      <tr key={version.version_id}>
                        <td>v{version.version_number}</td>
                        <td><StatusBadge status={version.status} /></td>
                        <td>{version.change_summary || version.body_preview || "No summary"}</td>
                        <td>{formatDate(version.created_at)}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={() => setSelectedVersion(version)}>Select</Button>
                            <Button variant="secondary" onClick={() => void loadDiff(version)}>
                              <GitCompare size={14} /> Diff
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PanelPagination page={versionsPagination.page} pageCount={versionsPagination.pageCount} pageSize={versionsPagination.pageSize} totalItems={versionsPagination.totalItems} onPageChange={versionsPagination.setPage} />

              {selectedVersion ? (
                <div className="rounded-lg border border-border bg-background-tint p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={selectedVersion.status} />
                    <span className="text-sm font-semibold text-text">v{selectedVersion.version_number}</span>
                  </div>
                  <label className="mt-3 block">
                    <span className="workspace-label">Review note</span>
                    <Input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Optional approval note or rollback summary" />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("submit")}>
                      <Send size={14} /> Submit
                    </Button>
                    <Button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("approve")}>
                      <CheckCircle2 size={14} /> Approve
                    </Button>
                    <Button variant="secondary" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("reject")}>
                      <XCircle size={14} /> Reject
                    </Button>
                    <Button variant="secondary" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("rollback")}>
                      <RotateCcw size={14} /> Rollback
                    </Button>
                    <Button variant="secondary" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("archive")}>
                      <Archive size={14} /> Archive
                    </Button>
                  </div>
                </div>
              ) : null}

              {diff ? (
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-text">Version Diff</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <pre className="max-h-56 overflow-auto rounded-md bg-background-tint p-3 text-xs text-text-muted whitespace-pre-wrap">{diff.body_diff.before}</pre>
                    <pre className="max-h-56 overflow-auto rounded-md bg-background-tint p-3 text-xs text-text-muted whitespace-pre-wrap">{diff.body_diff.after}</pre>
                  </div>
                  <p className="mt-3 text-xs text-text-muted">Added variables: {diff.variable_changes.added.join(", ") || "none"} | Removed: {diff.variable_changes.removed.join(", ") || "none"}</p>
                </div>
              ) : null}
            </div>

            <section className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-text">Create New Version</h3>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="workspace-label">Name</span>
                  <Input value={versionDraft.title} onChange={(event) => setVersionDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="block">
                  <span className="workspace-label">Category</span>
                  <Input value={versionDraft.category} onChange={(event) => setVersionDraft((current) => ({ ...current, category: event.target.value }))} />
                </label>
                <label className="block">
                  <span className="workspace-label">Message</span>
                  <textarea className="input-base min-h-40 w-full" value={versionDraft.body} onChange={(event) => setVersionDraft((current) => ({ ...current, body: event.target.value }))} />
                </label>
                <label className="block">
                  <span className="workspace-label">Change Summary</span>
                  <Input value={versionDraft.changeSummary} onChange={(event) => setVersionDraft((current) => ({ ...current, changeSummary: event.target.value }))} />
                </label>
                <Button disabled={!versionDraft.title.trim() || !versionDraft.body.trim() || createVersionMutation.isPending} onClick={() => createVersionMutation.mutate()}>
                  Create Version
                </Button>
              </div>
            </section>
          </div>
        ) : null}
      </PopupOverlay>
    </div>
  );
}
