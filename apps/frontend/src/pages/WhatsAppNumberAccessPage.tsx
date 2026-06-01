import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, RefreshCw, Save, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { PopupOverlay } from "../components/PopupOverlay";
import { updateWhatsAppAccountAccess } from "../api/admin";
import { useWhatsAppAccountAccess, useWhatsAppAccountAccessDetail } from "../hooks/useAdmin";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";
import type {
  UserSummary,
  WhatsAppAccountAccessAccount,
  WhatsAppAccountAccessRole
} from "../types/admin";

type AccessDraft = {
  organizationUserId: string;
  accessRole: WhatsAppAccountAccessRole;
  canView: boolean;
  canReply: boolean;
  canCreateSales: boolean;
  canEditSales: boolean;
  isActive: boolean;
};

const ROLE_OPTIONS: WhatsAppAccountAccessRole[] = ["owner", "manager", "agent", "viewer"];

function formatConnectionStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "connected") {
    return "bg-success/15 text-success";
  }
  if (["pairing", "reconnecting", "qr_required", "new"].includes(normalized)) {
    return "bg-warning/15 text-warning";
  }
  return "bg-muted text-text-muted";
}

function getUserLabel(user: UserSummary) {
  return user.full_name || user.email || user.id;
}

function buildAccessDrafts(account: WhatsAppAccountAccessAccount, users: UserSummary[], accessList: AccessDraft[]) {
  const accessByUserId = new Map(accessList.map((access) => [access.organizationUserId, access]));

  return users.map<AccessDraft>((user) => {
    const existing = accessByUserId.get(user.id);

    if (existing) {
      return existing;
    }

    const isCreator = account.created_by === user.id;

    return {
      organizationUserId: user.id,
      accessRole: isCreator ? "owner" : "agent",
      canView: true,
      canReply: true,
      canCreateSales: true,
      canEditSales: isCreator,
      isActive: isCreator
    };
  });
}

export function WhatsAppNumberAccessPanel({
  showHeader = true,
  selectedAccountId,
  open,
  onClose,
  hideOverviewTable = false
}: {
  showHeader?: boolean;
  selectedAccountId?: string | null;
  open?: boolean;
  onClose?: () => void;
  hideOverviewTable?: boolean;
}) {
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const currentUser = getStoredUser();
  const isSuperAdmin = dashboardContext.isSuperAdmin;
  const activeOrganizationId = isSuperAdmin
    ? dashboardContext.selectedOrganizationId || null
    : currentUser?.organizationId ?? null;
  const queryClient = useQueryClient();
  const { data: overview, isFetching, refetch } = useWhatsAppAccountAccess(activeOrganizationId, Boolean(activeOrganizationId));
  const [internalSelectedAccount, setInternalSelectedAccount] = useState<WhatsAppAccountAccessAccount | null>(null);
  const [drafts, setDrafts] = useState<AccessDraft[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const accounts = overview?.accounts ?? [];
  const overviewUsers = overview?.users ?? [];
  const selectedAccount = useMemo(() => {
    if (selectedAccountId) {
      return accounts.find((account) => account.id === selectedAccountId) ?? internalSelectedAccount;
    }

    return internalSelectedAccount;
  }, [accounts, internalSelectedAccount, selectedAccountId]);
  const detailQuery = useWhatsAppAccountAccessDetail(selectedAccount?.id ?? null, Boolean(selectedAccount));
  const detailUsers = detailQuery.data?.users?.length ? detailQuery.data.users : overviewUsers;
  const accountPagination = usePanelPagination(accounts);
  const detailUserPagination = usePanelPagination(detailUsers);
  const activeOwnerCount = drafts.filter((draft) => draft.isActive && draft.accessRole === "owner").length;
  const showStandaloneChrome = !hideOverviewTable;

  function handleClose(options?: { clearNotice?: boolean }) {
    if (options?.clearNotice ?? true) {
      setNotice(null);
    }
    if (!selectedAccountId) {
      setInternalSelectedAccount(null);
    }
    onClose?.();
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) {
        throw new Error("Select a WhatsApp account first.");
      }

      return updateWhatsAppAccountAccess(
        selectedAccount.id,
        drafts.map((draft) => ({
          organizationUserId: draft.organizationUserId,
          accessRole: draft.accessRole,
          canView: draft.canView,
          canReply: draft.canReply,
          canCreateSales: draft.canCreateSales,
          canEditSales: draft.canEditSales,
          isActive: draft.isActive
        }))
      );
    },
    onSuccess: async () => {
      setNotice("WhatsApp Number Access updated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-account-access"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-account-access-detail", selectedAccount?.id] })
      ]);
      handleClose({ clearNotice: false });
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Unable to update WhatsApp Number Access.");
    }
  });

  useEffect(() => {
    if (!selectedAccount || !detailQuery.data) {
      return;
    }

    const nextAccessList = detailQuery.data.accessList.map<AccessDraft>((access) => ({
      organizationUserId: access.organization_user_id,
      accessRole: access.access_role,
      canView: access.can_view,
      canReply: access.can_reply,
      canCreateSales: access.can_create_sales,
      canEditSales: access.can_edit_sales,
      isActive: access.is_active
    }));

    setDrafts(buildAccessDrafts(detailQuery.data.account, detailQuery.data.users, nextAccessList));
  }, [detailQuery.data, selectedAccount]);

  useEffect(() => {
    if (!selectedAccountId) {
      return;
    }

    const matchedAccount = accounts.find((account) => account.id === selectedAccountId);

    if (matchedAccount) {
      setInternalSelectedAccount(matchedAccount);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccountLabel = useMemo(() => {
    if (!selectedAccount) {
      return "";
    }

    return `${selectedAccount.name}${selectedAccount.phone_number ? ` · ${selectedAccount.phone_number}` : ""}`;
  }, [selectedAccount]);

  function updateDraft(userId: string, patch: Partial<AccessDraft>) {
    setDrafts((current) => {
      const hasOtherActiveOwner = current.some((draft) =>
        draft.organizationUserId !== userId && draft.isActive && draft.accessRole === "owner"
      );

      return current.map((draft) => {
        if (draft.organizationUserId !== userId) {
          return draft;
        }

        const nextDraft = {
          ...draft,
          ...patch
        };

        if (patch.accessRole === "owner") {
          nextDraft.isActive = true;
          nextDraft.canEditSales = true;
        }

        if (patch.isActive === true && !hasOtherActiveOwner && nextDraft.accessRole !== "owner") {
          nextDraft.accessRole = "owner";
          nextDraft.canEditSales = true;
        }

        return nextDraft;
      });
    });
  }

  return (
    <div className="space-y-6">
      {showStandaloneChrome ? (showHeader ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Setup</p>
            <h1 className="mt-3 section-title">WhatsApp Number Access</h1>
            <p className="section-copy mt-2">Assign users to this WhatsApp number while keeping Conversation handler, Sales owner, and Contact owner as operational ownership.</p>
          </div>
          <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={16} />
            {isFetching ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text">WhatsApp Number Access</h2>
            <p className="mt-1 text-sm text-text-muted">Assign users to this WhatsApp number.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={16} />
            {isFetching ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      )) : null}

      {showStandaloneChrome && notice ? <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-text-muted">{notice}</div> : null}

      {!hideOverviewTable && !activeOrganizationId ? (
        <Card className="p-5">
          <p className="text-sm font-semibold text-text">Select an organization first.</p>
        </Card>
      ) : !hideOverviewTable && accounts.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm font-semibold text-text">No WhatsApp accounts yet.</p>
        </Card>
      ) : !hideOverviewTable ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <h2 className="text-base font-semibold text-text">WhatsApp numbers</h2>
          </div>
          <div className="workspace-table-wrap">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Phone number</th>
                  <th>Connection status</th>
                  <th>Owner</th>
                  <th>Users with access</th>
                  <th>Manage</th>
                </tr>
              </thead>
              <tbody>
                {accountPagination.visibleItems.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <div className="flex min-w-0 items-center gap-2">
                        <KeyRound size={16} className="shrink-0 text-primary" />
                        <span className="truncate font-semibold text-text">{account.name}</span>
                      </div>
                    </td>
                    <td>{account.phone_number ?? account.phone_number_normalized ?? "Not set"}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusTone(account.status)}`}>
                        {formatConnectionStatus(account.status)}
                      </span>
                    </td>
                    <td>{account.owner_name ?? "Not assigned"}</td>
                    <td>{account.access_count}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setNotice(null);
                          setInternalSelectedAccount(account);
                        }}
                      >
                        <Users size={15} />
                        Manage Access
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PanelPagination page={accountPagination.page} pageCount={accountPagination.pageCount} pageSize={accountPagination.pageSize} totalItems={accountPagination.totalItems} onPageChange={accountPagination.setPage} className="mx-4 mb-4" />
        </Card>
      ) : null}

      <PopupOverlay
        open={open ?? Boolean(selectedAccount)}
        onClose={handleClose}
        title="Assign users to this WhatsApp number"
        description={selectedAccountLabel}
        panelClassName="max-w-5xl"
      >
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-6">
          {detailQuery.isFetching ? (
            <p className="text-sm text-text-muted">Loading access list...</p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-text-muted md:grid-cols-3">
                <p><span className="font-semibold text-text">Conversation handler</span> remains the current chat operator.</p>
                <p><span className="font-semibold text-text">Sales owner</span> remains the deal/KPI owner.</p>
                <p><span className="font-semibold text-text">Contact owner</span> remains the relationship owner.</p>
              </div>

              <div className="workspace-table-wrap">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Active</th>
                      <th>Role</th>
                      <th>View</th>
                      <th>Reply</th>
                      <th>Create sales</th>
                      <th>Edit sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailUserPagination.visibleItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-sm text-text-muted">
                          No assignable users found.
                        </td>
                      </tr>
                    ) : null}
                    {detailUserPagination.visibleItems.map((user) => {
                      const draft = drafts.find((item) => item.organizationUserId === user.id);

                      if (!draft) {
                        return null;
                      }

                      const userLabel = getUserLabel(user);
                      const activeInputId = `whatsapp-access-active-${user.id}`;
                      const roleSelectId = `whatsapp-access-role-${user.id}`;
                      const permissionLabelByKey: Record<"canView" | "canReply" | "canCreateSales" | "canEditSales", string> = {
                        canView: "View permission",
                        canReply: "Reply permission",
                        canCreateSales: "Create sales permission",
                        canEditSales: "Edit sales permission",
                      };

                      return (
                        <tr key={user.id}>
                          <td>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-text">{userLabel}</p>
                              <p className="text-xs text-text-muted">{user.role}</p>
                            </div>
                          </td>
                          <td>
                            <label htmlFor={activeInputId} className="sr-only">
                              Activate access for {userLabel}
                            </label>
                            <input
                              id={activeInputId}
                              type="checkbox"
                              checked={draft.isActive}
                              onChange={(event) => updateDraft(user.id, { isActive: event.target.checked })}
                            />
                          </td>
                          <td>
                            <label htmlFor={roleSelectId} className="sr-only">
                              Access role for {userLabel}
                            </label>
                            <select
                              id={roleSelectId}
                              className="min-h-9 rounded-lg border border-border bg-input px-2 text-sm text-text"
                              value={draft.accessRole}
                              onChange={(event) => updateDraft(user.id, { accessRole: event.target.value as WhatsAppAccountAccessRole })}
                              disabled={!draft.isActive}
                            >
                              {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                          </td>
                          {(["canView", "canReply", "canCreateSales", "canEditSales"] as const).map((key) => (
                            <td key={key}>
                              <label htmlFor={`whatsapp-access-${key}-${user.id}`} className="sr-only">
                                {permissionLabelByKey[key]} for {userLabel}
                              </label>
                              <input
                                id={`whatsapp-access-${key}-${user.id}`}
                                type="checkbox"
                                checked={draft[key]}
                                disabled={!draft.isActive}
                                onChange={(event) => updateDraft(user.id, { [key]: event.target.checked })}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PanelPagination page={detailUserPagination.page} pageCount={detailUserPagination.pageCount} pageSize={detailUserPagination.pageSize} totalItems={detailUserPagination.totalItems} onPageChange={detailUserPagination.setPage} />

              {activeOwnerCount < 1 ? (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  At least one active owner is required.
                </p>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="secondary" onClick={() => handleClose()}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || activeOwnerCount < 1 || detailQuery.isFetching}
          >
            <Save size={16} />
            {saveMutation.isPending ? "Saving" : "Save access"}
          </Button>
        </div>
      </PopupOverlay>
    </div>
  );
}

export function WhatsAppNumberAccessPage() {
  return <WhatsAppNumberAccessPanel />;
}
