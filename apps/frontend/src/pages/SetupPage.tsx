import { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Link2, PlugZap, RefreshCw, Trash2, Unplug, UserCircle, Zap } from "lucide-react";
import {
  createOrganization,
  createUser,
  createWhatsAppAccount,
  disconnectWhatsAppAccount,
  deleteOrganization,
  reconnectWhatsAppAccount,
  deleteUser,
  deleteWhatsAppAccount,
  resetUserPassword,
  updateOrganization,
  updateUser,
  updateWhatsAppAccount
} from "../api/admin";
import { Button } from "../components/Button";
import { PopupOverlay } from "../components/PopupOverlay";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { useOrganizations, useOrganizationUsers } from "../hooks/useAdmin";
import { getStoredUser, updateStoredUser } from "../lib/auth";
import type { OrganizationSummary, UserSummary } from "../types/admin";

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString();
}

const WHATSAPP_HISTORY_SYNC_OPTIONS = [0, 1, 3, 7, 14, 30, 60, 90] as const;
const MAX_PROFILE_PICTURE_BYTES = 512 * 1024;
const PROFILE_PICTURE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function formatHistorySyncWindow(days: number | null | undefined) {
  if (!days) {
    return "New messages only";
  }

  return `Previous ${days} ${days === 1 ? "day" : "days"}`;
}

function formatConnectionStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getConnectionTone(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "connected") {
    return { dot: "bg-emerald-500", text: "text-emerald-700" };
  }

  if (normalized === "pairing" || normalized === "reconnecting" || normalized === "qr_required" || normalized === "new") {
    return { dot: "bg-amber-400", text: "text-amber-700" };
  }

  return { dot: "bg-red-500", text: "text-red-700" };
}

function isConnectedAccount(status: string) {
  return status.toLowerCase() === "connected";
}

function readProfilePicture(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read selected image"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read selected image"));
    reader.readAsDataURL(file);
  });
}

function UserAvatarPreview({ src, label }: { src?: string | null; label?: string | null }) {
  return (
    <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-white text-text-soft">
      {src ? (
        <img src={src} alt={label ? `${label} profile` : "User profile"} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <UserCircle className="h-7 w-7" />
        </span>
      )}
    </div>
  );
}

export function SetupPage() {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const { data: organizations = [] } = useOrganizations();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("");
  const activeOrganizationId = isSuperAdmin ? selectedOrganizationId || null : currentUser?.organizationId ?? null;
  const { data: users = [] } = useOrganizationUsers(activeOrganizationId);
  const organizationPagination = usePanelPagination(organizations);
  const userPagination = usePanelPagination(users);

  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userFullName, setUserFullName] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"org_admin" | "manager" | "agent" | "user" | "super_admin">("agent");
  const [showOrgPopup, setShowOrgPopup] = useState(false);
  const [showUserPopup, setShowUserPopup] = useState(false);
  // WhatsApp account state moved to WhatsAppAccountDashboard
  const [editingOrganizationId, setEditingOrganizationId] = useState<string | null>(null);
  const [organizationEdit, setOrganizationEdit] = useState<{
    name: string;
    slug: string;
    status: OrganizationSummary["status"];
  }>({ name: "", slug: "", status: "active" });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userEdit, setUserEdit] = useState<{
    organizationId: string;
    fullName: string;
    avatarUrl: string | null;
    role: Exclude<UserSummary["role"], "super_admin">;
    status: UserSummary["status"];
  }>({ organizationId: "", fullName: "", avatarUrl: null, role: "agent", status: "active" });
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  // WhatsApp account edit state moved to WhatsAppAccountDashboard
  const [notice, setNotice] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const canCreateScopedRecords = !isSuperAdmin || Boolean(activeOrganizationId) || userRole === "super_admin";

  function getOrganizationName(organizationId: string) {
    return organizations.find((organization) => organization.id === organizationId)?.name ?? organizationId;
  }

  function canResetManagedUser(user: UserSummary) {
    if (user.auth_user_id === currentUser?.id) {
      return false;
    }

    if (isSuperAdmin) {
      return Boolean(user.auth_user_id);
    }

    return Boolean(
      currentUser?.role === "org_admin" &&
      user.auth_user_id &&
      user.organization_id === currentUser.organizationId &&
      user.role !== "org_admin"
    );
  }

  function beginEditOrganization(organization: OrganizationSummary) {
    setEditingOrganizationId(organization.id);
    setOrganizationEdit({
      name: organization.name,
      slug: organization.slug,
      status: organization.status
    });
  }

  function beginEditUser(user: UserSummary) {
    if (user.role === "super_admin") {
      return;
    }

    setEditingUserId(user.id);
    setUserEdit({
      organizationId: user.organization_id,
      fullName: user.full_name ?? "",
      avatarUrl: user.avatar_url ?? null,
      role: user.role,
      status: user.status
    });
    setResetPasswordUserId(null);
    setResetPassword("");
  }

  async function handleCreateOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsWorking(true);
    setNotice(null);

    try {
      await createOrganization({
        name: organizationName,
        slug: organizationSlug || null
      });
      setOrganizationName("");
      setOrganizationSlug("");
      setNotice("Organization created.");
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create organization");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsWorking(true);
    setNotice(null);

    try {
      await createUser({
        organizationId: activeOrganizationId,
        email: userEmail,
        fullName: userFullName || null,
        password: userPassword,
        role: userRole
      });
      setUserEmail("");
      setUserFullName("");
      setUserPassword("");
      setUserRole("agent");
      setNotice("User created.");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create user");
    } finally {
      setIsWorking(false);
    }
  }

  // WhatsApp account creation handler moved to WhatsAppAccountDashboard

  async function handleDeleteOrganization(organizationId: string, organizationName: string) {
    if (!window.confirm(`Delete organization "${organizationName}"?`)) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await deleteOrganization(organizationId);
      if (selectedOrganizationId === organizationId) {
        setSelectedOrganizationId("");
      }
      setNotice("Organization deleted.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] })
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete organization");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleUpdateOrganization(event: React.FormEvent<HTMLFormElement>, organizationId: string) {
    event.preventDefault();
    setIsWorking(true);
    setNotice(null);

    try {
      await updateOrganization(organizationId, {
        name: organizationEdit.name,
        slug: organizationEdit.slug || null,
        status: organizationEdit.status
      });
      setEditingOrganizationId(null);
      setNotice("Organization updated.");
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update organization");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteUser(userId: string, label: string) {
    if (!window.confirm(`Delete user "${label}"?`)) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await deleteUser(userId);
      setNotice("User deleted.");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete user");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleUpdateUser(event: React.FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    setIsWorking(true);
    setNotice(null);

    try {
      const updatedUser = await updateUser(userId, {
        organizationId: isSuperAdmin ? userEdit.organizationId : undefined,
        fullName: userEdit.fullName || null,
        avatarUrl: userEdit.avatarUrl,
        role: userEdit.role,
        status: userEdit.status
      });

      if (updatedUser.auth_user_id && updatedUser.auth_user_id === currentUser?.id) {
        updateStoredUser((storedUser) => ({
          ...storedUser,
          fullName: updatedUser.full_name,
          avatarUrl: updatedUser.avatar_url,
          role: updatedUser.role
        }));
      }

      setEditingUserId(null);
      setNotice("User updated.");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update user");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleProfilePictureChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!PROFILE_PICTURE_TYPES.has(file.type)) {
      setNotice("Profile picture must be a JPG, PNG, WebP, or GIF image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PROFILE_PICTURE_BYTES) {
      setNotice("Profile picture is too large. Please choose an image under 512 KB.");
      event.target.value = "";
      return;
    }

    try {
      const avatarUrl = await readProfilePicture(file);
      setUserEdit((draft) => ({ ...draft, avatarUrl }));
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to read selected image");
    } finally {
      event.target.value = "";
    }
  }

  async function handleResetUserPassword(event: React.FormEvent<HTMLFormElement>, user: UserSummary) {
    event.preventDefault();
    setIsWorking(true);
    setNotice(null);

    try {
      await resetUserPassword(user.id, { password: resetPassword });
      setResetPasswordUserId(null);
      setResetPassword("");
      setNotice(`Password reset for ${user.full_name ?? user.email ?? "user"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to reset password");
    } finally {
      setIsWorking(false);
    }
  }

  // WhatsApp account delete handler moved to WhatsAppAccountDashboard

  // WhatsApp account update handler moved to WhatsAppAccountDashboard

  // WhatsApp account reconnect handler moved to WhatsAppAccountDashboard

  // WhatsApp account disconnect handler moved to WhatsAppAccountDashboard

  // WhatsApp account refresh handler moved to WhatsAppAccountDashboard

  return (
    <section className="space-y-6">
      <Card elevated>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Setup</p>
        <h2 className="mt-3 section-title">Tenant operations console</h2>
        <p className="mt-2 max-w-3xl section-copy">
          This screen handles the first real admin workflow after auth: provision an organization, invite users, and register WhatsApp sessions without leaving the app.
        </p>
        {notice ? <p className="mt-4 text-sm text-coral">{notice}</p> : null}
      </Card>

      <div className="space-y-6">
        {isSuperAdmin ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            <Card elevated className="relative">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-text">Organizations</h3>
                <Button
                  variant="ghost"
                  className="z-10"
                  onClick={() => setShowOrgPopup(true)}
                >
                  Add Organization
                </Button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-white/80">
                <table className="min-w-full bg-white/80">
                  <thead className="bg-background-tint text-left text-xs uppercase tracking-[0.2em] text-text-soft">
                    <tr>
                      <th className="px-5 py-4">Name</th>
                      <th className="px-5 py-4">Slug</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Created</th>
                      <th className="px-5 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {organizationPagination.visibleItems.map((organization) => (
                      <tr key={organization.id} className="table-row text-sm text-text-muted">
                        {editingOrganizationId === organization.id ? (
                          <td colSpan={5} className="bg-background-tint">
                            <form className="space-y-3" onSubmit={(event) => handleUpdateOrganization(event, organization.id)}>
                              <Input
                                value={organizationEdit.name}
                                onChange={(event) => setOrganizationEdit((draft) => ({ ...draft, name: event.target.value }))}
                                placeholder="Organization name"
                                required
                              />
                              <Input
                                value={organizationEdit.slug}
                                onChange={(event) => setOrganizationEdit((draft) => ({ ...draft, slug: event.target.value }))}
                                placeholder="Slug"
                              />
                              <Select
                                value={organizationEdit.status}
                                onChange={(event) => setOrganizationEdit((draft) => ({
                                  ...draft,
                                  status: event.target.value as OrganizationSummary["status"]
                                }))}
                              >
                                <option value="active">active</option>
                                <option value="trial">trial</option>
                                <option value="suspended">suspended</option>
                                <option value="closed">closed</option>
                              </Select>
                              <div className="flex gap-2 mt-2">
                                <Button type="submit" className="flex-1" disabled={isWorking}>
                                  Save changes
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="flex-1"
                                  disabled={isWorking}
                                  onClick={() => setEditingOrganizationId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          </td>
                        ) : (
                          <>
                            <td className="px-5 py-4 font-medium text-text">{organization.name}</td>
                            <td className="px-5 py-4">{organization.slug}</td>
                            <td className="px-5 py-4 uppercase tracking-[0.16em] text-text-soft">{organization.status}</td>
                            <td className="px-5 py-4">{new Date(organization.created_at).toLocaleDateString()}</td>
                            <td className="px-5 py-4">
                              <div className="flex gap-2">
                                <Button
                                  variant="secondary"
                                  className=""
                                  disabled={isWorking}
                                  onClick={() => beginEditOrganization(organization)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="text-coral"
                                  disabled={isWorking}
                                  onClick={() => handleDeleteOrganization(organization.id, organization.name)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PanelPagination
                className="mt-4"
                page={organizationPagination.page}
                pageCount={organizationPagination.pageCount}
                totalItems={organizationPagination.totalItems}
                onPageChange={organizationPagination.setPage}
              />
            </Card>
          </motion.div>
        ) : null}

        <Card elevated>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-text">Users</h3>
            <Button variant="ghost" className="z-10" onClick={() => setShowUserPopup(true)}>
              Add User
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-white/90">
            <table className="w-full text-xs align-middle table-fixed">
              <colgroup>
                <col className="user-table-col-name" />
                <col className="user-table-col-email" />
                {isSuperAdmin ? <col className="user-table-col-org" /> : null}
                <col className={isSuperAdmin ? "user-table-col-role" : "user-table-col-role-nosuper"} />
                <col className="user-table-col-status" />
                <col className="user-table-col-actions" />
              </colgroup>
              <thead className="bg-background-tint text-left font-semibold text-[11px] uppercase tracking-[0.15em] text-text-soft">
                <tr>
                  <th className="px-3 py-2 font-semibold truncate">Name</th>
                  <th className="px-3 py-2 font-semibold truncate">Email</th>
                  {isSuperAdmin && <th className="px-3 py-2 font-semibold truncate">Organization</th>}
                  <th className="px-3 py-2 font-semibold truncate">Role</th>
                  <th className="px-3 py-2 font-semibold truncate">Status</th>
                  <th className="px-3 py-2 font-semibold truncate">Actions</th>
                </tr>
              </thead>
              <tbody>
                {userPagination.visibleItems.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0 text-[13px] text-text">
                    {editingUserId === user.id ? (
                      <td colSpan={isSuperAdmin ? 6 : 5} className="bg-background-tint">
                        <form className="space-y-3" onSubmit={(event) => handleUpdateUser(event, user.id)}>
                          <div className="flex items-center gap-3">
                            <UserAvatarPreview src={userEdit.avatarUrl} label={userEdit.fullName || user.email} />
                            <div className="min-w-0 flex-1">
                              <Input
                                value={userEdit.fullName}
                                onChange={(event) => setUserEdit((draft) => ({ ...draft, fullName: event.target.value }))}
                                placeholder="Full name"
                              />
                              <p className="mt-2 text-xs text-text-soft">JPG, PNG, WebP, or GIF up to 512 KB.</p>
                            </div>
                          </div>
                          {isSuperAdmin ? (
                            <Select
                              value={userEdit.organizationId}
                              onChange={(event) => setUserEdit((draft) => ({ ...draft, organizationId: event.target.value }))}
                              required
                            >
                              {organizations.map((organization) => (
                                <option key={organization.id} value={organization.id}>
                                  {organization.name}
                                </option>
                              ))}
                            </Select>
                          ) : null}
                          <Select
                            value={userEdit.role}
                            onChange={(event) => setUserEdit((draft) => ({
                              ...draft,
                              role: event.target.value as Exclude<UserSummary["role"], "super_admin">
                            }))}
                          >
                            <option value="org_admin">org_admin</option>
                            <option value="manager">manager</option>
                            <option value="agent">agent</option>
                            <option value="user">user</option>
                          </Select>
                          <Select
                            value={userEdit.status}
                            onChange={(event) => setUserEdit((draft) => ({
                              ...draft,
                              status: event.target.value as UserSummary["status"]
                            }))}
                          >
                            <option value="active">active</option>
                            <option value="invited">invited</option>
                          </Select>
                          <div className="flex gap-2 mt-2">
                            <Button type="submit" className="flex-1" disabled={isWorking || (isSuperAdmin && !userEdit.organizationId)}>
                              Save changes
                            </Button>
                            <Button
                              variant="secondary"
                              className="flex-1"
                              disabled={isWorking}
                              onClick={() => setEditingUserId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-medium text-text truncate">
                          <div className="flex items-center gap-2 min-w-0">
                            <UserAvatarPreview src={user.avatar_url} label={user.full_name ?? user.email} />
                            <div className="min-w-0">
                              <span className="truncate font-medium text-text text-[13px]">{user.full_name ?? user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 truncate">{user.email}</td>
                        {isSuperAdmin && <td className="px-3 py-2 truncate">{getOrganizationName(user.organization_id)}</td>}
                        <td className="px-3 py-2 truncate">{user.role}</td>
                        <td className="px-3 py-2 uppercase tracking-[0.14em] text-text-soft truncate">{user.status}</td>
                        <td className="px-3 py-2 truncate">
                          <div className="flex gap-1 flex-row flex-nowrap items-center">
                            <Button
                              variant="ghost"
                              className="px-1 py-0.5 text-xs min-w-0"
                              disabled={isWorking || user.role === "super_admin"}
                              onClick={() => beginEditUser(user)}
                            >
                              Edit
                            </Button>
                            {canResetManagedUser(user) ? (
                              resetPasswordUserId === user.id ? (
                                <form className="space-y-1 flex-1" onSubmit={(event) => handleResetUserPassword(event, user)}>
                                  <Input
                                    type="password"
                                    value={resetPassword}
                                    onChange={(event) => setResetPassword(event.target.value)}
                                    placeholder="New password"
                                    minLength={8}
                                    required
                                    className="px-2 py-1 text-xs"
                                  />
                                  <div className="flex gap-1 mt-1">
                                    <Button type="submit" className="flex-1 px-2 py-1 text-xs" disabled={isWorking}>
                                      Reset
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      className="flex-1 px-2 py-1 text-xs"
                                      disabled={isWorking}
                                      onClick={() => {
                                        setResetPasswordUserId(null);
                                        setResetPassword("");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </form>
                              ) : (
                                <Button
                                  variant="ghost"
                                  className="px-1 py-0.5 text-xs min-w-0"
                                  disabled={isWorking}
                                  onClick={() => {
                                    setResetPasswordUserId(user.id);
                                    setResetPassword("");
                                  }}
                                >
                                  Reset
                                </Button>
                              )
                            ) : null}
                            <Button
                              variant="ghost"
                              className="px-1 py-0.5 text-xs text-coral min-w-0"
                              disabled={isWorking}
                              onClick={() => handleDeleteUser(user.id, user.full_name ?? user.email ?? user.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PanelPagination
            className="mt-4"
            page={userPagination.page}
            pageCount={userPagination.pageCount}
            totalItems={userPagination.totalItems}
            onPageChange={userPagination.setPage}
          />
        </Card>
      </div>

      {/* Popups should be outside the Cards to avoid JSX nesting issues */}
      <PopupOverlay open={showOrgPopup} onClose={() => setShowOrgPopup(false)} title="Create organization" panelClassName="popup-compact-30">
        <form onSubmit={handleCreateOrganization}>
          <div className="space-y-2 p-2">
            <Input
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Organization name"
              required
              className="text-sm px-2 py-1"
            />
            <Input
              value={organizationSlug}
              onChange={(event) => setOrganizationSlug(event.target.value)}
              placeholder="Slug (optional)"
              className="text-sm px-2 py-1"
            />
            <Button type="submit" disabled={isWorking} className="w-full text-sm px-2 py-1">
              Create organization
            </Button>
          </div>
        </form>
      </PopupOverlay>

      <PopupOverlay open={showUserPopup} onClose={() => setShowUserPopup(false)} title="Create user" panelClassName="popup-compact-30">
        <form onSubmit={handleCreateUser}>
          <div className="space-y-2 p-2">
            {isSuperAdmin ? (
              <p className="rounded-lg border border-border bg-background-tint px-2 py-2 text-xs leading-5 text-text-muted">
                {activeOrganizationId
                  ? "New user will be created in the selected organization."
                  : "Select an organization above before creating a non-super-admin user."}
              </p>
            ) : null}
            <Input
              value={userEmail}
              onChange={(event) => setUserEmail(event.target.value)}
              placeholder="user@company.com"
              required
              className="text-sm px-2 py-1"
            />
            <Input
              value={userFullName}
              onChange={(event) => setUserFullName(event.target.value)}
              placeholder="Full name"
              className="text-sm px-2 py-1"
            />
            <Input
              type="password"
              value={userPassword}
              onChange={(event) => setUserPassword(event.target.value)}
              placeholder="Temporary password"
              required
              className="text-sm px-2 py-1"
            />
            <Select
              value={userRole}
              onChange={(event) => setUserRole(event.target.value as "org_admin" | "manager" | "agent" | "user" | "super_admin")}
              className="text-sm px-2 py-1"
            >
              {isSuperAdmin ? <option value="super_admin">super_admin</option> : null}
              <option value="org_admin">org_admin</option>
              <option value="manager">manager</option>
              <option value="agent">agent</option>
              <option value="user">user</option>
            </Select>
            <Button type="submit" disabled={isWorking || !canCreateScopedRecords} className="w-full text-sm px-2 py-1">
              Create user
            </Button>
          </div>
        </form>
      </PopupOverlay>



        {/* WhatsApp account list moved to WhatsAppAccountDashboard */}
      {/* End of .space-y-6 div */}

    </section>
  );
}
