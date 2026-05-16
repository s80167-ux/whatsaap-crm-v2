import { Search } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "../../../../components/Button";
import { Card } from "../../../../components/Card";
import { Input, Select } from "../../../../components/Input";
import { PanelPagination, usePanelPagination } from "../../../../components/PanelPagination";
import { Toast } from "../../../../components/Toast";
import type { DashboardOutletContext } from "../../../../layouts/DashboardLayout";
import { CampaignModuleTabs } from "../../components/CampaignModuleTabs";
import { templateCategories } from "../constants/templateConstants";
import { getMessageTemplatesQueryKey, useMessageTemplates } from "../hooks/useMessageTemplates";
import {
  archiveMessageTemplate,
  deleteMessageTemplate,
  duplicateMessageTemplate,
  getTemplateStats
} from "../services/templateService";
import type { MessageTemplate, MessageTemplateCategory } from "../types/template.types";
import { TemplateListTable } from "../components/TemplateListTable";
import { TemplateStatsCards } from "../components/TemplateStatsCards";

const templateListPageSize = 5;

export function MessageTemplatesPage() {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : null;
  const shouldFetch = !outletContext.isSuperAdmin || Boolean(organizationId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [templateQuery, setTemplateQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MessageTemplateCategory | "all">("all");
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const { data: templates = [] } = useMessageTemplates(organizationId, shouldFetch);
  const queryKey = getMessageTemplatesQueryKey(organizationId);

  const stats = useMemo(() => getTemplateStats(templates), [templates]);
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = templateQuery.trim().toLowerCase();

    return templates.filter((template) => {
      const matchesCategory = categoryFilter === "all" || template.category === categoryFilter;
      const matchesQuery =
        !normalizedQuery ||
        template.name.toLowerCase().includes(normalizedQuery) ||
        template.content.toLowerCase().includes(normalizedQuery) ||
        (template.description?.toLowerCase().includes(normalizedQuery) ?? false);

      return matchesCategory && matchesQuery;
    });
  }, [categoryFilter, templateQuery, templates]);

  const {
    page,
    pageCount,
    pageSize,
    totalItems,
    visibleItems,
    setPage
  } = usePanelPagination(filteredTemplates, templateListPageSize);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, setPage, templateQuery]);

  const duplicateMutation = useMutation({
    mutationFn: (template: MessageTemplate) => duplicateMessageTemplate(template.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      showNotice("Template duplicated.");
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to duplicate template.", "error")
  });

  const archiveMutation = useMutation({
    mutationFn: (template: MessageTemplate) => archiveMessageTemplate(template.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      showNotice("Template archived.");
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to archive template.", "error")
  });

  const deleteMutation = useMutation({
    mutationFn: (template: MessageTemplate) => deleteMessageTemplate(template.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      showNotice("Template deleted.");
    },
    onError: (error) => showNotice(error instanceof Error ? error.message : "Unable to delete template.", "error")
  });

  function showNotice(message: string, variant: "success" | "error" = "success") {
    setNotice({ message, variant });
  }

  function handleDelete(template: MessageTemplate) {
    if (window.confirm(`Delete template "${template.name}"?`)) {
      deleteMutation.mutate(template);
    }
  }

  return (
    <section className="space-y-5">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Templates</p>
            <h2 className="mt-3 section-title">Message Templates</h2>
            <p className="mt-2 max-w-2xl section-copy">Create and manage reusable WhatsApp blast messages.</p>
          </div>
          <Button className="shrink-0 px-3 sm:px-5" onClick={() => navigate("/campaigns/whatsapp/templates/create")}>
            Create
            <span className="hidden sm:inline"> Template</span>
          </Button>
        </div>
      </Card>

      <TemplateStatsCards stats={stats} />

      <div className="space-y-3">
        <CampaignModuleTabs channel="whatsapp" />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} placeholder="Search templates" className="pl-9" />
          </label>
          <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as MessageTemplateCategory | "all")}>
            <option value="all">All categories</option>
            {templateCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </Select>
        </div>
      </div>

      {outletContext.isSuperAdmin && !organizationId ? (
        <Card elevated className="p-5 text-sm text-text-muted">
          Choose an organization from the sidebar before managing Message Templates.
        </Card>
      ) : (
        <Card elevated className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Template list</p>
              <p className="mt-2 text-sm text-text-muted">Reusable content is stored separately from campaign delivery.</p>
            </div>
            <p className="shrink-0 text-xs font-semibold text-text-muted">{filteredTemplates.length} shown</p>
          </div>
          <TemplateListTable
            templates={visibleItems}
            onEdit={(template) => navigate(`/campaigns/whatsapp/templates/create?edit=${encodeURIComponent(template.id)}`)}
            onDuplicate={(template) => duplicateMutation.mutate(template)}
            onArchive={(template) => archiveMutation.mutate(template)}
            onDelete={handleDelete}
          />
          <PanelPagination page={page} pageCount={pageCount} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} />
        </Card>
      )}

      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} onClose={() => setNotice(null)} />
    </section>
  );
}
