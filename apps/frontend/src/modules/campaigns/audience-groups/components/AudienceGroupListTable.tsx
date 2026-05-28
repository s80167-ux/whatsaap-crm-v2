import { Archive, Database, Eye, Trash2 } from "lucide-react";
import { Button } from "../../../../components/Button";
import { PanelPagination, usePanelPagination } from "../../../../components/PanelPagination";
import type { AudienceGroup } from "../types/audienceGroup.types";

type AudienceGroupListTableProps = {
  groups: AudienceGroup[];
  loading?: boolean;
  onView: (group: AudienceGroup) => void;
  onDelete: (group: AudienceGroup) => void;
  onSaveAsCrm?: (group: AudienceGroup) => void;
  onArchive?: (group: AudienceGroup) => void;
  onDeleteDetails?: (group: AudienceGroup) => void;
  canManageStorage?: boolean;
  crmSaveDisabledReason?: string | null;
};

export function AudienceGroupListTable({
  groups,
  loading = false,
  onView,
  onDelete,
  onSaveAsCrm,
  onArchive,
  onDeleteDetails,
  canManageStorage = false,
  crmSaveDisabledReason = null
}: AudienceGroupListTableProps) {
  const groupPagination = usePanelPagination(groups);

  if (loading) {
    return <div className="app-card p-5 text-sm text-text-muted">Loading Audience Groups...</div>;
  }

  if (groups.length === 0) {
    return (
      <div className="border border-dashed border-border bg-background-tint p-8 text-center">
        <p className="text-sm font-semibold text-text">No Audience Groups yet</p>
        <p className="mt-1 text-sm text-text-muted">Create an Audience Group before creating campaigns.</p>
      </div>
    );
  }

  return (
    <>
      <div className="workspace-table-wrap">
        <table className="workspace-table workspace-table-compact min-w-[980px]">
          <thead>
            <tr>
              <Th>Group Name</Th>
              <Th>Import Status</Th>
              <Th>CRM Status</Th>
              <Th>Storage Status</Th>
              <Th>Total</Th>
              <Th>Valid</Th>
              <Th>Linked CRM</Th>
              <Th>Created At</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {groupPagination.visibleItems.map((group) => (
              <tr key={group.id} className="border-b border-border">
                <Td>
                  <div>
                    <p className="font-semibold text-text">{group.name}</p>
                    {group.description ? <p className="mt-1 line-clamp-1 text-xs text-text-muted">{group.description}</p> : null}
                  </div>
                </Td>
                <Td>
                  <StatusBadge label={group.status} />
                </Td>
                <Td>
                  <StatusBadge label={formatCrmStatus(group.crm_save_status ?? "not_saved")} tone={group.crm_save_status === "saved" ? "success" : "muted"} />
                </Td>
                <Td>
                  <StatusBadge label={formatStorageStatus(group.storage_status ?? "active")} tone={group.storage_status === "archived" ? "warning" : group.storage_status === "deleted_details" ? "danger" : "success"} />
                </Td>
                <Td>{group.total_rows}</Td>
                <Td>{group.valid_count}</Td>
                <Td>{group.crm_saved_count ?? group.linked_crm_count}</Td>
                <Td>{formatDate(group.created_at)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="icon" variant="ghost" className="border border-border bg-card text-text hover:bg-muted hover:text-primary" aria-label="View Audience Group" onClick={() => onView(group)}>
                      <Eye size={16} />
                    </Button>
                    {canManageStorage && onSaveAsCrm ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="border border-border bg-card text-text hover:bg-muted hover:text-primary disabled:opacity-50"
                        aria-label={crmSaveDisabledReason ?? "Save as CRM Contacts"}
                        title={crmSaveDisabledReason ?? "Save as CRM Contacts"}
                        disabled={Boolean(crmSaveDisabledReason) || group.storage_status === "deleted_details"}
                        onClick={() => onSaveAsCrm(group)}
                      >
                        <Database size={16} />
                      </Button>
                    ) : null}
                    {canManageStorage && onArchive ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="border border-border bg-card text-text hover:bg-muted hover:text-primary disabled:opacity-50"
                        aria-label="Archive Audience"
                        title="Archive Audience"
                        disabled={group.storage_status !== "active"}
                        onClick={() => onArchive(group)}
                      >
                        <Archive size={16} />
                      </Button>
                    ) : null}
                    {canManageStorage && onDeleteDetails ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="border border-border bg-card text-coral hover:bg-muted hover:text-coral disabled:opacity-50"
                        aria-label="Delete Audience Details"
                        title="Delete Audience Details"
                        disabled={group.storage_status === "deleted_details"}
                        onClick={() => onDeleteDetails(group)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    ) : null}
                    <Button size="icon" variant="ghost" className="border border-border bg-card text-coral hover:bg-muted hover:text-coral" aria-label="Delete Audience Group" onClick={() => onDelete(group)}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PanelPagination
        page={groupPagination.page}
        pageCount={groupPagination.pageCount}
        pageSize={groupPagination.pageSize}
        totalItems={groupPagination.totalItems}
        onPageChange={groupPagination.setPage}
      />
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td>{children}</td>;
}

function StatusBadge({ label, tone = "muted" }: { label: string; tone?: "muted" | "success" | "warning" | "danger" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
        : tone === "danger"
          ? "border-coral/30 bg-coral/10 text-coral"
          : "border-border bg-background-tint text-text-muted";

  return <span className={`inline-flex border px-2 py-1 text-xs font-semibold capitalize ${toneClass}`}>{label}</span>;
}

function formatCrmStatus(value: string) {
  return value.replace(/_/g, " ");
}

function formatStorageStatus(value: string) {
  return value === "deleted_details" ? "Details Deleted" : value;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}
