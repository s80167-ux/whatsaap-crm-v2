import { Archive, Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "../../../../components/Button";
import type { MessageTemplate } from "../types/template.types";
import { TemplateStatusBadge } from "./TemplateStatusBadge";

type TemplateListTableProps = {
  templates: MessageTemplate[];
  onEdit: (template: MessageTemplate) => void;
  onDuplicate: (template: MessageTemplate) => void;
  onArchive: (template: MessageTemplate) => void;
  onDelete: (template: MessageTemplate) => void;
};

export function TemplateListTable({ templates, onEdit, onDuplicate, onArchive, onDelete }: TemplateListTableProps) {
  if (templates.length === 0) {
    return (
      <div className="workspace-empty-state px-4 py-8">
        <p className="text-sm font-semibold text-text">No templates found</p>
        <p className="mt-1 text-sm text-text-muted">Try a different search term or category.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {templates.map((template) => (
          <article key={template.id} className="app-card p-3 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-text">{template.name}</h3>
                <p className="mt-1 text-xs text-text-muted">{template.category}</p>
              </div>
              <TemplateStatusBadge status={template.status} />
            </div>
            {template.description ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-text-muted">{template.description}</p> : null}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted">
              <span>{template.variables.length} variables</span>
              <span>Updated {formatDate(template.updated_at)}</span>
            </div>
            <TemplateActions
              template={template}
              mobile
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          </article>
        ))}
      </div>

      <div className="workspace-table-wrap hidden sm:block">
        <table className="workspace-table workspace-table-compact">
          <thead>
            <tr>
              <th>Template Name</th>
              <th>Category</th>
              <th>Variables Count</th>
              <th>Last Updated</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} className="table-row">
                <td>
                  <div>
                    <p className="font-semibold text-text">{template.name}</p>
                    {template.description ? <p className="mt-1 line-clamp-1 text-xs text-text-muted">{template.description}</p> : null}
                  </div>
                </td>
                <td className="text-text-muted">{template.category}</td>
                <td>{template.variables.length}</td>
                <td>{formatDate(template.updated_at)}</td>
                <td><TemplateStatusBadge status={template.status} /></td>
                <td>
                  <TemplateActions
                    template={template}
                    onEdit={onEdit}
                    onDuplicate={onDuplicate}
                    onArchive={onArchive}
                    onDelete={onDelete}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type TemplateActionsProps = {
  template: MessageTemplate;
  mobile?: boolean;
  onEdit: (template: MessageTemplate) => void;
  onDuplicate: (template: MessageTemplate) => void;
  onArchive: (template: MessageTemplate) => void;
  onDelete: (template: MessageTemplate) => void;
};

function TemplateActions({
  template,
  mobile = false,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete
}: TemplateActionsProps) {
  return (
    <div className={mobile ? "mt-3 grid grid-cols-2 gap-2" : "flex flex-wrap gap-2"}>
      <Button size={mobile ? "sm" : "icon"} variant="ghost" className="border border-border bg-card text-text hover:bg-muted hover:text-primary" aria-label={`Edit ${template.name}`} onClick={() => onEdit(template)}>
        {mobile ? "Edit" : <Pencil size={16} />}
      </Button>
      <Button size={mobile ? "sm" : "icon"} variant="ghost" className="border border-border bg-card text-text hover:bg-muted hover:text-primary" aria-label={`Duplicate ${template.name}`} onClick={() => onDuplicate(template)}>
        {mobile ? "Duplicate" : <Copy size={16} />}
      </Button>
      <Button size={mobile ? "sm" : "icon"} variant="ghost" className="border border-border bg-card text-text hover:bg-muted hover:text-primary" aria-label={`Archive ${template.name}`} onClick={() => onArchive(template)}>
        {mobile ? "Archive" : <Archive size={16} />}
      </Button>
      <Button size={mobile ? "sm" : "icon"} variant="ghost" className="border border-border bg-card text-coral hover:bg-muted hover:text-coral" aria-label={`Delete ${template.name}`} onClick={() => onDelete(template)}>
        {mobile ? "Delete" : <Trash2 size={16} />}
      </Button>
    </div>
  );
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
