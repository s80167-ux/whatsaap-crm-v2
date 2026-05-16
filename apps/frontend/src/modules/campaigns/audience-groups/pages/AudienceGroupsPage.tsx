import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { Button } from "../../../../components/Button";
import { Card } from "../../../../components/Card";
import { Toast } from "../../../../components/Toast";
import type { DashboardOutletContext } from "../../../../layouts/DashboardLayout";
import type { AudienceGroup, AudienceValidationResult } from "../types/audienceGroup.types";
import {
  deleteAudienceGroup,
  fetchAudienceGroups
} from "../services/audienceGroupService";
import { AudienceGroupListTable } from "../components/AudienceGroupListTable";
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

  const queryKey = useMemo(() => ["audience-groups", organizationId] as const, [organizationId]);
  const shouldFetch = !outletContext.isSuperAdmin || Boolean(organizationId);
  const { data: groups = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchAudienceGroups(organizationId),
    enabled: shouldFetch
  });

  const deleteMutation = useMutation({
    mutationFn: (group: AudienceGroup) => deleteAudienceGroup(group.id, organizationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      showNotice("Audience Group deleted.");
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to delete Audience Group.", "error")
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
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Audience group list</p>
            <p className="mt-2 text-sm text-text-muted">CSV recipient lists are separate from CRM Contacts unless you opt in during import.</p>
          </div>
          <AudienceGroupListTable
            groups={groups}
            loading={isLoading}
            onView={(group) => showNotice(`${group.name} contact detail view will be expanded after Phase 1.`)}
            onDelete={handleDelete}
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
          setSuccessGroup(null);
          showNotice("Audience Group is visible in the list.");
        }}
        onPhaseTwoNotice={() => showNotice("Campaign creation with Audience Groups will be available in Phase 2.")}
      />
      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} />
    </section>
  );
}
