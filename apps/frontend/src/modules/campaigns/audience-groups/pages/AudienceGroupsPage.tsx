import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { Button } from "../../../../components/Button";
import { Card } from "../../../../components/Card";
import { PopupOverlay } from "../../../../components/PopupOverlay";
import { Toast } from "../../../../components/Toast";
import type { DashboardOutletContext } from "../../../../layouts/DashboardLayout";
import { canSyncContactIdentity } from "../../../../lib/moduleAccess";
import type { AudienceGroup, AudienceValidationResult, SaveAudiencePreviewSummary } from "../types/audienceGroup.types";
import {
  archiveAudienceGroup,
  deleteAudienceGroupDetails,
  deleteAudienceGroup,
  fetchAudienceGroups,
  previewSaveAudienceAsCrmContacts,
  saveAudienceAsCrmContacts
} from "../services/audienceGroupService";
import { AudienceGroupListTable } from "../components/AudienceGroupListTable";
import { AudienceGroupViewModal } from "../components/AudienceGroupViewModal";
import { AudienceImportSuccessModal } from "../components/AudienceImportSuccessModal";
import { CreateAudienceGroupDrawer } from "../components/CreateAudienceGroupDrawer";
import { CampaignModuleTabs } from "../../components/CampaignModuleTabs";

export function AudienceGroupsPage() {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : null;
  const queryClient = useQueryClient();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [successGroup, setSuccessGroup] = useState<AudienceGroup | null>(null);
  const [successResult, setSuccessResult] = useState<AudienceValidationResult | null>(null);
  const [viewGroup, setViewGroup] = useState<AudienceGroup | null>(null);
  const [storageFilter, setStorageFilter] = useState<"active" | "archived" | "deleted_details" | "all">("active");
  const [savePreviewGroup, setSavePreviewGroup] = useState<AudienceGroup | null>(null);
  const [savePreview, setSavePreview] = useState<SaveAudiencePreviewSummary | null>(null);

  const queryKey = useMemo(() => ["audience-groups", organizationId, storageFilter] as const, [organizationId, storageFilter]);
  const shouldFetch = !outletContext.isSuperAdmin || Boolean(organizationId);
  const { data: groups = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchAudienceGroups({ organizationId, storageStatus: storageFilter }),
    enabled: shouldFetch
  });
  const canManageStorage = outletContext.role === "super_admin" || outletContext.role === "org_admin";
  const syncIdentityAllowed = canSyncContactIdentity({
    role: outletContext.role,
    permissionKeys: outletContext.permissionKeys
  });
  const storageSummary = useMemo(() => ({
    active: groups.filter((group) => (group.storage_status ?? "active") === "active").length,
    archived: groups.filter((group) => group.storage_status === "archived").length,
    deletedDetails: groups.filter((group) => group.storage_status === "deleted_details").length,
    activeRows: groups
      .filter((group) => (group.storage_status ?? "active") === "active")
      .reduce((sum, group) => sum + group.valid_count, 0),
    savedToCrm: groups.reduce((sum, group) => sum + (group.crm_saved_count ?? group.linked_crm_count ?? 0), 0)
  }), [groups]);

  const deleteMutation = useMutation({
    mutationFn: (group: AudienceGroup) => deleteAudienceGroup(group.id, organizationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      showNotice("Audience Group deleted.");
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to delete Audience Group.", "error")
  });

  const previewSaveMutation = useMutation({
    mutationFn: (group: AudienceGroup) => previewSaveAudienceAsCrmContacts(group.id, organizationId),
    onSuccess: (summary, group) => {
      setSavePreviewGroup(group);
      setSavePreview(summary);
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to preview CRM save.", "error")
  });

  const saveAsCrmMutation = useMutation({
    mutationFn: (group: AudienceGroup) => saveAudienceAsCrmContacts(group.id, organizationId),
    onSuccess: async (summary) => {
      await queryClient.invalidateQueries({ queryKey });
      setSavePreviewGroup(null);
      setSavePreview(null);
      showNotice(`Contact identity synced. ${summary.crmCreatedCount} created, ${summary.crmLinkedCount} linked, ${summary.crmSkippedCount} skipped.`);
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to sync contact identity.", "error")
  });

  const archiveMutation = useMutation({
    mutationFn: (group: AudienceGroup) => archiveAudienceGroup(group.id, organizationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      showNotice("Audience archived.");
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to archive audience.", "error")
  });

  const deleteDetailsMutation = useMutation({
    mutationFn: (group: AudienceGroup) => deleteAudienceGroupDetails(group.id, organizationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      showNotice("Audience details deleted. Campaign summary and CRM contacts remain.");
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to delete audience details.", "error")
  });

  function showNotice(message: string, variant: "success" | "error" = "success") {
    setNotice({ message, variant });
  }

  async function handleCreated(group: AudienceGroup, result: AudienceValidationResult) {
    await queryClient.invalidateQueries({ queryKey });
    setIsDrawerOpen(false);
    setSuccessGroup(group);
    setSuccessResult(result);
  }

  function handleDelete(group: AudienceGroup) {
    if (window.confirm(`Delete Audience Group "${group.name}"?`)) {
      deleteMutation.mutate(group);
    }
  }

  function handleSaveAsCrm(group: AudienceGroup) {
    previewSaveMutation.mutate(group);
  }

  function handleArchive(group: AudienceGroup) {
    if (window.confirm("Archive this audience? It will be hidden from active lists but campaign reports will remain available.")) {
      archiveMutation.mutate(group);
    }
  }

  function handleDeleteDetails(group: AudienceGroup) {
    if (window.confirm("This will remove uploaded audience member details to reduce storage. Campaign summary remains. CRM contacts already saved will not be deleted.")) {
      deleteDetailsMutation.mutate(group);
    }
  }

  return (
    <section className="space-y-5">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Audience</p>
            <h2 className="mt-3 section-title">Audience Groups</h2>
            <p className="mt-2 max-w-2xl section-copy">
              Upload, validate and manage recipient lists before creating campaigns.
            </p>
          </div>
          <Button onClick={() => setIsDrawerOpen(true)}>Create Audience Group</Button>
        </div>
      </Card>

      <CampaignModuleTabs channel="whatsapp" />

      {outletContext.isSuperAdmin && !organizationId ? (
        <Card elevated className="p-5 text-sm text-text-muted">
          Choose an organization from the sidebar before managing Audience Groups.
        </Card>
      ) : (
        <Card elevated className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Audience group list</p>
              <p className="mt-2 text-sm text-text-muted">CSV recipient lists stay campaign-first. Sync selected audiences to Contact Identity when replies need stable names and phone numbers.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["active", "archived", "deleted_details", "all"] as const).map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={storageFilter === status ? "primary" : "secondary"}
                  onClick={() => setStorageFilter(status)}
                >
                  {status === "deleted_details" ? "Details Deleted" : status === "all" ? "All" : status[0].toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StorageMetric label="Active audience groups" value={storageSummary.active} />
            <StorageMetric label="Archived audience groups" value={storageSummary.archived} />
            <StorageMetric label="Deleted detail groups" value={storageSummary.deletedDetails} />
            <StorageMetric label="Active audience rows" value={storageSummary.activeRows} />
            <StorageMetric label="Rows linked to identity" value={storageSummary.savedToCrm} />
          </div>
          <AudienceGroupListTable
            groups={groups}
            loading={isLoading}
            onView={setViewGroup}
            onDelete={handleDelete}
            onSaveAsCrm={handleSaveAsCrm}
            onArchive={handleArchive}
            onDeleteDetails={handleDeleteDetails}
            canManageStorage={canManageStorage}
            canSyncIdentity={syncIdentityAllowed}
          />
        </Card>
      )}

      <CreateAudienceGroupDrawer
        open={isDrawerOpen}
        organizationId={organizationId}
        onClose={() => setIsDrawerOpen(false)}
        onCreated={handleCreated}
        onNotice={showNotice}
      />
      <AudienceImportSuccessModal
        open={Boolean(successGroup)}
        group={successGroup}
        result={successResult}
        onClose={() => setSuccessGroup(null)}
        onViewGroup={() => {
          if (successGroup) {
            setViewGroup(successGroup);
          }
          setSuccessGroup(null);
        }}
        onPhaseTwoNotice={() => showNotice("Open Campaigns to create a campaign with this Audience Group.")}
      />
      <AudienceGroupViewModal
        open={Boolean(viewGroup)}
        group={viewGroup}
        organizationId={organizationId}
        onClose={() => setViewGroup(null)}
      />
      <PopupOverlay
        open={Boolean(savePreviewGroup && savePreview)}
        onClose={() => {
          setSavePreviewGroup(null);
          setSavePreview(null);
        }}
        title="Sync Contact Identity?"
        description="This will link valid audience contacts to existing contact identities or create lightweight contact records if not found. This helps Inbox show stable names and phone numbers when customers reply to campaigns."
        panelClassName="max-w-[min(34rem,calc(100vw-2rem))]"
      >
        {savePreview ? (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm">
              <SummaryRow label="Audience group name" value={savePreview.audienceGroupName} />
              <SummaryRow label="Total uploaded" value={savePreview.totalAudienceContacts} />
              <SummaryRow label="Valid recipients" value={savePreview.validContacts} />
              <SummaryRow label="Already linked identities" value={savePreview.alreadyLinkedCrmContacts} />
              <SummaryRow label="Existing contacts to link" value={savePreview.existingContactsToLink} />
              <SummaryRow label="New contacts to create" value={savePreview.estimatedNewContactsToCreate} />
              <SummaryRow label="Skipped invalid" value={savePreview.skippedInvalid} />
              <SummaryRow label="Skipped duplicate" value={savePreview.skippedDuplicate} />
              <SummaryRow label="Skipped opted out" value={savePreview.skippedOptedOut} />
              <SummaryRow label="Source" value="Audience Upload" />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => {
                setSavePreviewGroup(null);
                setSavePreview(null);
              }}>
                Cancel
              </Button>
              <Button
                onClick={() => savePreviewGroup && saveAsCrmMutation.mutate(savePreviewGroup)}
                disabled={saveAsCrmMutation.isPending}
              >
                Confirm Sync
              </Button>
            </div>
          </div>
        ) : null}
      </PopupOverlay>
      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} />
    </section>
  );
}

function StorageMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-background-tint px-3 py-2">
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text">{value.toLocaleString()}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-border bg-background-tint px-3 py-2">
      <span className="text-text-muted">{label}</span>
      <span className="text-right font-semibold text-text">{typeof value === "number" ? value.toLocaleString() : value}</span>
    </div>
  );
}
