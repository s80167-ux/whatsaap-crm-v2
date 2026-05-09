import { Eye, Trash2 } from "lucide-react";
import { Button } from "../../../../components/Button";
import type { AudienceGroup } from "../types/audienceGroup.types";

type AudienceGroupListTableProps = {
  groups: AudienceGroup[];
  loading?: boolean;
  onView: (group: AudienceGroup) => void;
  onDelete: (group: AudienceGroup) => void;
};

export function AudienceGroupListTable({ groups, loading = false, onView, onDelete }: AudienceGroupListTableProps) {
  if (loading) {
    return <div className="border border-border bg-white p-5 text-sm text-text-muted">Loading Audience Groups...</div>;
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
    <div className="overflow-x-auto">
      <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-[0.14em] text-text-soft">
            <Th>Group Name</Th>
            <Th>Status</Th>
            <Th>Total Rows</Th>
            <Th>Valid</Th>
            <Th>Invalid</Th>
            <Th>Duplicates</Th>
            <Th>Opt-out Blocked</Th>
            <Th>Linked CRM</Th>
            <Th>Created At</Th>
            <Th>Action</Th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id} className="border-b border-border">
              <Td>
                <div>
                  <p className="font-semibold text-text">{group.name}</p>
                  {group.description ? <p className="mt-1 line-clamp-1 text-xs text-text-muted">{group.description}</p> : null}
                </div>
              </Td>
              <Td>
                <span className="inline-flex border border-border bg-background-tint px-2 py-1 text-xs font-semibold capitalize text-text-muted">
                  {group.status}
                </span>
              </Td>
              <Td>{group.total_rows}</Td>
              <Td>{group.valid_count}</Td>
              <Td>{group.invalid_count}</Td>
              <Td>{group.duplicate_count}</Td>
              <Td>{group.opt_out_count}</Td>
              <Td>{group.linked_crm_count}</Td>
              <Td>{formatDate(group.created_at)}</Td>
              <Td>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" className="border border-border bg-white text-text hover:text-primary" aria-label="View Audience Group" onClick={() => onView(group)}>
                    <Eye size={16} />
                  </Button>
                  <Button size="icon" variant="ghost" className="border border-border bg-white text-coral hover:text-coral" aria-label="Delete Audience Group" onClick={() => onDelete(group)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-border bg-background-tint px-3 py-3 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-border bg-white px-3 py-3 align-top text-text-muted">{children}</td>;
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
