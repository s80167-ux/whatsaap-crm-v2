import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { saveRolePermissions } from "../api/admin";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Select } from "../components/Input";
import { useRolePermissions, useRolePermissionsMatrix } from "../hooks/useAdmin";
import { getStoredUser } from "../lib/auth";
import type { RolePermissionEditableRole } from "../types/admin";

const EDITABLE_ROLE_OPTIONS: RolePermissionEditableRole[] = ["org_admin", "manager", "agent", "user"];
const ROLE_PERMISSION_GROUPS = [
  {
    title: "Platform",
    permissions: ["platform.view_usage", "platform.manage_subscriptions", "platform.view_health"]
  },
  {
    title: "Organization",
    permissions: ["org.manage_users", "org.manage_whatsapp_accounts", "org.manage_settings"]
  },
  {
    title: "Contacts",
    permissions: ["contacts.read_all", "contacts.read_assigned", "contacts.write"]
  },
  {
    title: "Conversations",
    permissions: ["conversations.read_all", "conversations.read_assigned", "conversations.assign"]
  },
  {
    title: "Messages",
    permissions: ["messages.send"]
  },
  {
    title: "Sales",
    permissions: ["sales.read_all", "sales.read_assigned", "sales.write"]
  },
  {
    title: "Data",
    permissions: ["data_exports.download"]
  },
  {
    title: "Dashboard",
    permissions: ["dashboard.view_admin", "dashboard.view_agent"]
  }
] as const;
const CRITICAL_ROLE_PERMISSION_KEYS = ["org.manage_users", "org.manage_whatsapp_accounts", "org.manage_settings"] as const;

function arePermissionSetsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((permissionKey) => rightSet.has(permissionKey));
}

export function SuperAdminRolePrivilegesPage() {
  const user = getStoredUser();
  const isSuperAdmin = user?.role === "super_admin";
  const queryClient = useQueryClient();
  const [selectedRolePermissionRole, setSelectedRolePermissionRole] = useState<RolePermissionEditableRole>("org_admin");
  const rolePermissionsMatrixQuery = useRolePermissionsMatrix(isSuperAdmin);
  const rolePermissionsDetailQuery = useRolePermissions(selectedRolePermissionRole, isSuperAdmin);
  const [rolePermissionDraft, setRolePermissionDraft] = useState<string[]>([]);
  const [rolePermissionNotice, setRolePermissionNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSavingRolePermissions, setIsSavingRolePermissions] = useState(false);
  const selectedRolePermissionDetail = rolePermissionsDetailQuery.data;
  const rolePermissionBaseline = selectedRolePermissionDetail?.permissionKeys ?? [];
  const availableRolePermissions = selectedRolePermissionDetail?.availablePermissions ?? rolePermissionsMatrixQuery.data?.availablePermissions ?? [];
  const rolePermissionHasChanges = !arePermissionSetsEqual(rolePermissionDraft, rolePermissionBaseline);
  const addedRolePermissions = rolePermissionDraft.filter((permissionKey) => !rolePermissionBaseline.includes(permissionKey));
  const removedRolePermissions = rolePermissionBaseline.filter((permissionKey) => !rolePermissionDraft.includes(permissionKey));
  const superAdminRoleSummary = rolePermissionsMatrixQuery.data?.data.find((item) => item.role === "super_admin") ?? null;
  const groupedPermissionKeys = new Set<string>(ROLE_PERMISSION_GROUPS.flatMap((group) => group.permissions));
  const otherRolePermissions = availableRolePermissions.filter((permissionKey) => !groupedPermissionKeys.has(permissionKey));

  useEffect(() => {
    if (!selectedRolePermissionDetail) {
      return;
    }

    setRolePermissionDraft(selectedRolePermissionDetail.permissionKeys);
  }, [selectedRolePermissionDetail, selectedRolePermissionRole]);

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  function handleToggleRolePermission(permissionKey: string) {
    setRolePermissionDraft((current) =>
      current.includes(permissionKey)
        ? current.filter((value) => value !== permissionKey)
        : [...current, permissionKey].sort()
    );
    setRolePermissionNotice(null);
  }

  async function handleSaveRolePermissions() {
    if (!rolePermissionHasChanges) {
      return;
    }

    const removingAllCriticalPermissions =
      rolePermissionBaseline.some((permissionKey) => CRITICAL_ROLE_PERMISSION_KEYS.includes(permissionKey as typeof CRITICAL_ROLE_PERMISSION_KEYS[number])) &&
      CRITICAL_ROLE_PERMISSION_KEYS.every((permissionKey) => !rolePermissionDraft.includes(permissionKey));

    const confirmationMessage = removingAllCriticalPermissions
      ? "This will remove all critical organization permissions from this role and affect all users with this role."
      : "This will affect all users with this role.";

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setIsSavingRolePermissions(true);
    setRolePermissionNotice(null);

    try {
      const result = await saveRolePermissions(selectedRolePermissionRole, {
        permissionKeys: rolePermissionDraft
      });

      setRolePermissionDraft(result.permissionKeys);
      setRolePermissionNotice({ type: "success", message: "Role privileges updated." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["role-permissions"] }),
        queryClient.invalidateQueries({ queryKey: ["role-permissions", selectedRolePermissionRole] })
      ]);
    } catch (error) {
      setRolePermissionNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to update role privileges"
      });
    } finally {
      setIsSavingRolePermissions(false);
    }
  }

  return (
    <section className="space-y-4">
      <Card elevated className="!p-5 space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Super Admin</p>
            <h1 className="mt-2 section-title">Role & Privileges</h1>
            <p className="mt-1.5 max-w-3xl section-copy">
              Control what each role can do across the organization.
            </p>
          </div>
          <div className="workspace-subtle max-w-md p-4 text-sm leading-6 text-text-muted">
            <p className="font-semibold text-text">Super admin access stays read-only.</p>
            <p className="mt-1">
              The `super_admin` role is not editable here. It currently carries {superAdminRoleSummary?.permissionKeys.length ?? 0} platform-level permissions.
            </p>
          </div>
        </div>
      </Card>

      <Card elevated className="workspace-block relative">
        <div className="grid gap-4 lg:grid-cols-[260px,minmax(0,1fr)]">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Role</span>
              <Select
                value={selectedRolePermissionRole}
                onChange={(event) => {
                  setSelectedRolePermissionRole(event.target.value as RolePermissionEditableRole);
                  setRolePermissionNotice(null);
                }}
              >
                {EDITABLE_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </label>

            {selectedRolePermissionRole === "org_admin" ? (
              <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-sm leading-6 text-warning">
                This role has high access. Changes will affect organization admins.
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-background-tint px-3 py-3 text-sm text-text-muted">
              <p className="font-semibold text-text">Change summary</p>
              <p className="mt-1">{rolePermissionHasChanges ? "Unsaved changes are ready to save." : "No unsaved changes."}</p>
              {rolePermissionHasChanges ? (
                <p className="mt-2 text-xs leading-5 text-text-soft">
                  Added {addedRolePermissions.length} • Removed {removedRolePermissions.length}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            {rolePermissionNotice ? (
              <div className={rolePermissionNotice.type === "success" ? "mb-4 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success" : "mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"}>
                {rolePermissionNotice.message}
              </div>
            ) : null}

            {rolePermissionsDetailQuery.isLoading || rolePermissionsMatrixQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border bg-background-tint px-4 py-8 text-sm text-text-muted">
                Loading role privileges...
              </div>
            ) : rolePermissionsDetailQuery.error ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-8 text-sm text-destructive">
                {rolePermissionsDetailQuery.error instanceof Error ? rolePermissionsDetailQuery.error.message : "Unable to load role privileges."}
              </div>
            ) : (
              <div className="space-y-4">
                {ROLE_PERMISSION_GROUPS.map((group) => {
                  const visiblePermissions = group.permissions.filter((permissionKey) => availableRolePermissions.includes(permissionKey));

                  if (visiblePermissions.length === 0) {
                    return null;
                  }

                  return (
                    <div key={group.title} className="rounded-2xl border border-border bg-background-tint p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-text">{group.title}</h4>
                        <span className="text-xs text-text-soft">{visiblePermissions.length} privileges</span>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {visiblePermissions.map((permissionKey) => {
                          const checked = rolePermissionDraft.includes(permissionKey);

                          return (
                            <label key={permissionKey} className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm text-text">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4"
                                checked={checked}
                                onChange={() => handleToggleRolePermission(permissionKey)}
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-text">{permissionKey}</p>
                                <p className="mt-1 text-xs leading-5 text-text-soft">
                                  {checked ? "Included for this role." : "Not included for this role."}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {otherRolePermissions.length > 0 ? (
                  <div className="rounded-2xl border border-border bg-background-tint p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-text">Other</h4>
                      <span className="text-xs text-text-soft">{otherRolePermissions.length} privileges</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {otherRolePermissions.map((permissionKey) => {
                        const checked = rolePermissionDraft.includes(permissionKey);

                        return (
                          <label key={permissionKey} className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm text-text">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4"
                              checked={checked}
                              onChange={() => handleToggleRolePermission(permissionKey)}
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-text">{permissionKey}</p>
                              <p className="mt-1 text-xs leading-5 text-text-soft">
                                {checked ? "Included for this role." : "Not included for this role."}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-text">Save role changes</p>
                    <p className="mt-1 text-sm text-text-muted">
                      Saving will update the default privileges inherited by every user on this role.
                    </p>
                  </div>
                  <Button
                    disabled={!rolePermissionHasChanges || isSavingRolePermissions}
                    onClick={handleSaveRolePermissions}
                  >
                    {isSavingRolePermissions ? "Saving..." : "Save privileges"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
