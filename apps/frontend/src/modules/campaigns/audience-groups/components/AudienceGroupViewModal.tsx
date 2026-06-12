import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../../components/Button";
import { PanelPagination, usePanelPagination } from "../../../../components/PanelPagination";
import { PopupOverlay } from "../../../../components/PopupOverlay";
import { fetchAudienceGroupContacts } from "../services/audienceGroupService";
import type { AudienceGroup, AudienceValidatedContact } from "../types/audienceGroup.types";

type AudienceContactFilter = "all" | "linked" | "not_linked";

type AudienceGroupViewModalProps = {
  open: boolean;
  group: AudienceGroup | null;
  organizationId?: string | null;
  onClose: () => void;
};

export function AudienceGroupViewModal({ open, group, organizationId, onClose }: AudienceGroupViewModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<AudienceContactFilter>("all");
  const detailsDeleted = group?.storage_status === "deleted_details";

  const {
    data: contacts = [],
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ["audience-group-contacts", group?.id, organizationId],
    queryFn: () => fetchAudienceGroupContacts(group!.id, organizationId),
    enabled: Boolean(open && group && !detailsDeleted)
  });

  useEffect(() => {
    setSearchQuery("");
    setFilter("all");
  }, [group?.id, open]);

  const filteredContacts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return contacts.filter((contact) => {
      if (!matchesFilter(contact, filter)) return false;
      if (!query) return true;

      return [
        contact.name,
        contact.phone_raw,
        contact.phone_normalized,
        contact.gender,
        contact.tag,
        contact.location,
        contact.product_interest,
        contact.customer_type,
        contact.notes,
        ...getValidationIssues(contact)
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [contacts, filter, searchQuery]);

  const pagination = usePanelPagination(filteredContacts, 10);

  useEffect(() => {
    pagination.setPage(1);
  }, [pagination.setPage, filter, searchQuery]);

  if (!group) return null;

  return (
    <PopupOverlay
      open={open}
      onClose={onClose}
      title={group.name}
      description={group.description || "View imported audience recipients and contact identity status."}
      panelClassName="max-w-[min(96rem,calc(100vw-2rem))]"
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <SummaryMetric label="Total rows" value={group.total_rows} />
          <SummaryMetric label="Valid" value={group.valid_count} />
          <SummaryMetric label="Invalid" value={group.invalid_count} />
          <SummaryMetric label="Duplicates" value={group.duplicate_count} />
          <SummaryMetric label="Opted out" value={group.opt_out_count} />
          <SummaryMetric label="Linked identity" value={group.crm_saved_count ?? group.linked_crm_count} />
          <SummaryMetric label="Storage" value={formatLabel(group.storage_status ?? "active")} />
        </div>

        {detailsDeleted ? (
          <EmptyState
            title="Audience details have been deleted"
            description="The group summary and campaign reports remain available, but individual uploaded rows can no longer be viewed."
          />
        ) : (
          <>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="block w-full lg:max-w-md">
                <span className="sr-only">Search audience contacts</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search name, phone, tag, location or notes"
                  className="min-h-11 w-full rounded-xl border border-border bg-card px-4 text-sm text-text outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {CONTACT_FILTERS.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={filter === option.value ? "primary" : "secondary"}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <p className="border border-border bg-background-tint px-4 py-3 text-xs leading-5 text-text-muted">
              The contact table contains valid recipients stored for campaign use. Invalid, duplicate and opted-out rows are shown in the summary above but are not retained as sendable recipients.
            </p>

            {isLoading ? (
              <EmptyState title="Loading audience contacts..." />
            ) : isError ? (
              <div className="border border-coral/30 bg-coral/10 p-5 text-sm text-coral">
                {error instanceof Error ? error.message : "Unable to load audience contacts."}
              </div>
            ) : filteredContacts.length === 0 ? (
              <EmptyState title="No matching contacts" description="Try another search term or identity filter." />
            ) : (
              <>
                <div className="workspace-table-wrap">
                  <table className="workspace-table workspace-table-compact min-w-[1320px]">
                    <thead>
                      <tr>
                        <Th>Name</Th>
                        <Th>Phone</Th>
                        <Th>Gender</Th>
                        <Th>Tag</Th>
                        <Th>Location</Th>
                        <Th>Product Interest</Th>
                        <Th>Customer Type</Th>
                        <Th>Validation</Th>
                        <Th>Identity</Th>
                        <Th>Notes</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.visibleItems.map((contact, index) => {
                        const validationIssues = getValidationIssues(contact);

                        return (
                          <tr key={`${contact.phone_normalized ?? contact.phone_raw}-${contact.rowNumber ?? index}`} className="border-b border-border">
                            <Td><p className="font-semibold text-text">{contact.name || "Unnamed contact"}</p></Td>
                            <Td>
                              <p className="font-medium text-text">{contact.phone_normalized || contact.phone_raw}</p>
                              {contact.phone_normalized && contact.phone_raw !== contact.phone_normalized ? (
                                <p className="mt-1 text-xs text-text-muted">Original: {contact.phone_raw}</p>
                              ) : null}
                            </Td>
                            <Td>{formatLabel(contact.gender)}</Td>
                            <Td>{contact.tag || "—"}</Td>
                            <Td>{contact.location || "—"}</Td>
                            <Td>{contact.product_interest || "—"}</Td>
                            <Td>{contact.customer_type || "—"}</Td>
                            <Td>
                              <StatusBadge label={contact.validation_status} tone={contact.validation_status === "valid" ? "success" : "danger"} />
                              {validationIssues.length > 0 ? (
                                <p className="mt-2 max-w-56 text-xs leading-5 text-coral">{validationIssues.join(", ")}</p>
                              ) : null}
                            </Td>
                            <Td>
                              <StatusBadge
                                label={contact.crm_contact_id ? "Linked" : "Not linked"}
                                tone={contact.crm_contact_id ? "success" : "muted"}
                              />
                            </Td>
                            <Td><p className="max-w-72 whitespace-normal text-sm leading-5 text-text-muted">{contact.notes || "—"}</p></Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <PanelPagination
                  page={pagination.page}
                  pageCount={pagination.pageCount}
                  pageSize={pagination.pageSize}
                  totalItems={pagination.totalItems}
                  onPageChange={pagination.setPage}
                />
              </>
            )}
          </>
        )}

        <div className="flex justify-end border-t border-border pt-4">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </PopupOverlay>
  );
}

const CONTACT_FILTERS: Array<{ value: AudienceContactFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "linked", label: "Linked Identity" },
  { value: "not_linked", label: "Not Linked" }
];

function matchesFilter(contact: AudienceValidatedContact, filter: AudienceContactFilter) {
  if (filter === "linked") return Boolean(contact.crm_contact_id);
  if (filter === "not_linked") return !contact.crm_contact_id;
  return true;
}

function getValidationIssues(contact: AudienceValidatedContact) {
  return Array.isArray(contact.validation_issues) ? contact.validation_issues : [];
}

function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border border-dashed border-border bg-background-tint p-8 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border bg-background-tint px-3 py-3">
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "muted" | "success" | "danger" }) {
  const toneClass = tone === "success"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
    : tone === "danger"
      ? "border-coral/30 bg-coral/10 text-coral"
      : "border-border bg-background-tint text-text-muted";

  return <span className={`inline-flex border px-2 py-1 text-xs font-semibold capitalize ${toneClass}`}>{formatLabel(label)}</span>;
}

function Th({ children }: { children: ReactNode }) {
  return <th>{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td>{children}</td>;
}

function formatLabel(value: string) {
  return value.split("_").join(" ");
}
