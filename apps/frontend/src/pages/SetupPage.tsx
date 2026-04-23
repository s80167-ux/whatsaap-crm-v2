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
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { WhatsAppQrDisplay } from "../components/WhatsAppQrDisplay";
import { useOrganizations, useOrganizationUsers, useWhatsAppAccounts } from "../hooks/useAdmin";
import { getStoredUser, updateStoredUser } from "../lib/auth";
import type { OrganizationSummary, UserSummary, WhatsAppAccountSummary } from "../types/admin";

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
  const { data: accounts = [], isFetching: isRefreshingAccounts, refetch: refetchAccounts } = useWhatsAppAccounts(activeOrganizationId);
  const organizationPagination = usePanelPagination(organizations);
  const userPagination = usePanelPagination(users);
  const accountPagination = usePanelPagination(accounts);

  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userFullName, setUserFullName] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"org_admin" | "manager" | "agent" | "user" | "super_admin">("agent");
  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountHistorySyncLookbackDays, setAccountHistorySyncLookbackDays] = useState(7);
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
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountEdit, setAccountEdit] = useState<{
    organizationId: string;
    name: string;
    phoneNumber: string;
    historySyncLookbackDays: number;
  }>({ organizationId: "", name: "", phoneNumber: "", historySyncLookbackDays: 7 });
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

  function beginEditAccount(account: WhatsAppAccountSummary) {
    setEditingAccountId(account.id);
    setAccountEdit({
      organizationId: account.organization_id,
      name: account.name,
      phoneNumber: account.phone_number ?? "",
      historySyncLookbackDays: account.history_sync_lookback_days ?? 7
    });
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

  async function handleCreateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsWorking(true);
    setNotice(null);

    try {
      await createWhatsAppAccount({
        organizationId: activeOrganizationId,
        name: accountName,
        phoneNumber: accountPhone || null,
        historySyncLookbackDays: accountHistorySyncLookbackDays
      });
      setAccountName("");
      setAccountPhone("");
      setAccountHistorySyncLookbackDays(7);
      setNotice("WhatsApp account created and session initialization started.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

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

  async function handleDeleteAccount(accountId: string, label: string) {
    if (!window.confirm(`Delete WhatsApp account "${label}"?`)) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await deleteWhatsAppAccount(accountId);
      setNotice("WhatsApp account deleted.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleUpdateAccount(event: React.FormEvent<HTMLFormElement>, accountId: string) {
    event.preventDefault();
    setIsWorking(true);
    setNotice(null);

    try {
      await updateWhatsAppAccount(accountId, {
        organizationId: isSuperAdmin ? accountEdit.organizationId : activeOrganizationId,
        name: accountEdit.name,
        phoneNumber: accountEdit.phoneNumber || null,
        historySyncLookbackDays: accountEdit.historySyncLookbackDays
      });
      setEditingAccountId(null);
      setNotice("WhatsApp account updated.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleReconnectAccount(accountId: string, label: string) {
    setIsWorking(true);
    setNotice(null);

    try {
      await reconnectWhatsAppAccount(accountId);
      setNotice(`Reconnect requested for "${label}".`);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to reconnect WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDisconnectAccount(accountId: string, label: string) {
    if (!window.confirm(`Disconnect WhatsApp account "${label}"?`)) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await disconnectWhatsAppAccount(accountId);
      setNotice(`Disconnect requested for "${label}".`);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to disconnect WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRefreshAccounts() {
    setNotice(null);
    await refetchAccounts();
  }

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

      <div className="grid gap-6 xl:grid-cols-3">
        {isSuperAdmin ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            <Card elevated>
              <h3 className="text-lg font-semibold text-text">Active organization</h3>
              <div className="mt-4">
                <Select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>
                  <option value="">All organizations</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </Select>
              </div>
            </Card>
          </motion.div>
        ) : null}

        {isSuperAdmin ? (
          <motion.form onSubmit={handleCreateOrganization} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
            <Card elevated>
              <h3 className="text-lg font-semibold text-text">Create organization</h3>
              <div className="mt-4 space-y-3">
                <Input
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="Organization name"
                  required
                />
                <Input
                  value={organizationSlug}
                  onChange={(event) => setOrganizationSlug(event.target.value)}
                  placeholder="Slug (optional)"
                />
                <Button type="submit" disabled={isWorking}>
                  Create organization
                </Button>
              </div>
            </Card>
          </motion.form>
        ) : null}

        <motion.form onSubmit={handleCreateUser} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26 }}>
          <Card elevated>
            <h3 className="text-lg font-semibold text-text">Create user</h3>
            <div className="mt-4 space-y-3">
              {isSuperAdmin ? (
                <p className="rounded-lg border border-border bg-background-tint px-4 py-3 text-sm leading-6 text-text-muted">
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
              />
              <Input
                value={userFullName}
                onChange={(event) => setUserFullName(event.target.value)}
                placeholder="Full name"
              />
              <Input
                type="password"
                value={userPassword}
                onChange={(event) => setUserPassword(event.target.value)}
                placeholder="Temporary password"
                required
              />
              <Select
                value={userRole}
                onChange={(event) => setUserRole(event.target.value as "org_admin" | "manager" | "agent" | "user" | "super_admin")}
              >
                {isSuperAdmin ? <option value="super_admin">super_admin</option> : null}
                <option value="org_admin">org_admin</option>
                <option value="manager">manager</option>
                <option value="agent">agent</option>
                <option value="user">user</option>
              </Select>
              <Button type="submit" disabled={isWorking || !canCreateScopedRecords}>
                Create user
              </Button>
            </div>
          </Card>
        </motion.form>

        <motion.form onSubmit={handleCreateAccount} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
          <Card elevated>
            <h3 className="text-lg font-semibold text-text">Register WhatsApp account</h3>
            <div className="mt-4 space-y-3">
              {isSuperAdmin ? (
                <p className="rounded-lg border border-border bg-background-tint px-4 py-3 text-sm leading-6 text-text-muted">
                  {activeOrganizationId
                    ? "WhatsApp account will be attached to the selected organization."
                    : "Select an organization above before creating a WhatsApp account."}
                </p>
              ) : null}
              <Input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="Sales line"
                required
              />
              <Input
                value={accountPhone}
                onChange={(event) => setAccountPhone(event.target.value)}
                placeholder="+60123456789"
              />
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Sync previous messages</p>
                <Select
                  value={String(accountHistorySyncLookbackDays)}
                  onChange={(event) => setAccountHistorySyncLookbackDays(Number(event.target.value))}
                >
                  {WHATSAPP_HISTORY_SYNC_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {formatHistorySyncWindow(days)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={isWorking || (isSuperAdmin && !activeOrganizationId)}>
                Create account
              </Button>
            </div>
          </Card>
        </motion.form>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {isSuperAdmin ? (
          <Card elevated>
            <h3 className="text-lg font-semibold text-text">Organizations</h3>
            <div className="mt-4 space-y-3 text-sm text-text-muted">
              {organizationPagination.visibleItems.map((organization) => (
                <div key={organization.id} className="rounded-lg border border-border bg-background-tint p-4">
                  {editingOrganizationId === organization.id ? (
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
                      <div className="flex gap-2">
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
                  ) : (
                    <>
                      <p className="font-medium text-text">{organization.name}</p>
                      <p className="mt-1">{organization.slug}</p>
                      <p className="mt-1 uppercase tracking-[0.16em] text-text-soft">{organization.status}</p>
                      <div className="mt-3 space-y-2">
                        <Button
                          variant="secondary"
                          className="w-full"
                          disabled={isWorking}
                          onClick={() => beginEditOrganization(organization)}
                        >
                          Edit organization
                        </Button>
                        <Button
                          variant="secondary"
                          className="w-full text-coral"
                          disabled={isWorking}
                          onClick={() => handleDeleteOrganization(organization.id, organization.name)}
                        >
                          Delete organization
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <PanelPagination
              className="mt-4"
              page={organizationPagination.page}
              pageCount={organizationPagination.pageCount}
              totalItems={organizationPagination.totalItems}
              onPageChange={organizationPagination.setPage}
            />
          </Card>
        ) : null}

        <Card elevated>
          <h3 className="text-lg font-semibold text-text">Users</h3>
          <div className="mt-4 space-y-3 text-sm text-text-muted">
            {userPagination.visibleItems.map((user) => (
              <div key={user.id} className="rounded-lg border border-border bg-background-tint p-4">
                {editingUserId === user.id ? (
                  <form className="space-y-3" onSubmit={(event) => handleUpdateUser(event, user.id)}>
                    <p className="text-xs uppercase tracking-[0.16em] text-text-soft">{user.email}</p>
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
                      <UserAvatarPreview src={userEdit.avatarUrl} label={userEdit.fullName || user.email} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Profile picture</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-border bg-background-tint px-3 py-2 text-xs font-semibold text-text transition hover:border-primary/30 hover:text-primary">
                            Upload image
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="sr-only"
                              onChange={handleProfilePictureChange}
                            />
                          </label>
                          {userEdit.avatarUrl ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="px-3 py-2 text-xs"
                              disabled={isWorking}
                              onClick={() => setUserEdit((draft) => ({ ...draft, avatarUrl: null }))}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
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
                    <Input
                      value={userEdit.fullName}
                      onChange={(event) => setUserEdit((draft) => ({ ...draft, fullName: event.target.value }))}
                      placeholder="Full name"
                    />
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
                    <div className="flex gap-2">
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
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <UserAvatarPreview src={user.avatar_url} label={user.full_name ?? user.email} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text">{user.full_name ?? user.email}</p>
                        <p className="mt-1 truncate">{user.email}</p>
                      </div>
                    </div>
                    {isSuperAdmin ? <p className="mt-1">{getOrganizationName(user.organization_id)}</p> : null}
                    <p className="mt-1">{user.role}</p>
                    <p className="mt-1 uppercase tracking-[0.16em] text-text-soft">{user.status}</p>
                    <div className="mt-3 space-y-2">
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={isWorking || user.role === "super_admin"}
                        onClick={() => beginEditUser(user)}
                      >
                        Edit user
                      </Button>
                      {canResetManagedUser(user) ? (
                        resetPasswordUserId === user.id ? (
                          <form className="space-y-2" onSubmit={(event) => handleResetUserPassword(event, user)}>
                            <Input
                              type="password"
                              value={resetPassword}
                              onChange={(event) => setResetPassword(event.target.value)}
                              placeholder="New password"
                              minLength={8}
                              required
                            />
                            <div className="flex gap-2">
                              <Button type="submit" className="flex-1" disabled={isWorking}>
                                Reset
                              </Button>
                              <Button
                                variant="secondary"
                                className="flex-1"
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
                            variant="secondary"
                            className="w-full"
                            disabled={isWorking}
                            onClick={() => {
                              setResetPasswordUserId(user.id);
                              setResetPassword("");
                            }}
                          >
                            Reset password
                          </Button>
                        )
                      ) : null}
                      <Button
                        variant="secondary"
                        className="w-full text-coral"
                        disabled={isWorking}
                        onClick={() => handleDeleteUser(user.id, user.full_name ?? user.email ?? user.id)}
                      >
                        Delete user
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <PanelPagination
            className="mt-4"
            page={userPagination.page}
            pageCount={userPagination.pageCount}
            totalItems={userPagination.totalItems}
            onPageChange={userPagination.setPage}
          />
        </Card>

        <Card elevated className="min-w-0 xl:col-span-3">
          <h3 className="text-lg font-semibold text-text">WhatsApp accounts</h3>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-text-soft">
            <p className="min-w-0 flex-1">Auto-refreshes every 15 seconds while an organization is selected.</p>
            <Button variant="ghost" className="shrink-0 px-3 py-2 text-xs" disabled={isRefreshingAccounts} onClick={handleRefreshAccounts}>
              {isRefreshingAccounts ? "Refreshing..." : "Refresh status"}
            </Button>
          </div>
          <div className="mt-4 overflow-hidden border border-border bg-white text-sm shadow-soft">
            <div className="hidden grid-cols-[minmax(120px,1fr)_minmax(112px,0.85fr)_minmax(138px,0.95fr)_minmax(230px,1.4fr)_minmax(240px,1.45fr)] gap-3 border-b border-border bg-background-tint px-4 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-text-soft lg:grid">
              <p>Device Name</p>
              <p>Status</p>
              <p>Phone Number</p>
              <p>Device Info</p>
              <p>Actions</p>
            </div>
            <div className="divide-y divide-border">
              {accountPagination.visibleItems.map((account) => {
                const statusTone = getConnectionTone(account.status);
                const connected = isConnectedAccount(account.status);
                const phoneNumber = account.phone_number_normalized ?? account.phone_number ?? "No phone set";

                return (
                  <div key={account.id} className="grid gap-4 px-4 py-4 text-text lg:grid-cols-[minmax(120px,1fr)_minmax(112px,0.85fr)_minmax(138px,0.95fr)_minmax(230px,1.4fr)_minmax(240px,1.45fr)] lg:items-center lg:gap-3">
                    {editingAccountId === account.id ? (
                      <form className="space-y-3 lg:col-span-5" onSubmit={(event) => handleUpdateAccount(event, account.id)}>
                        {isSuperAdmin ? (
                          <Select
                            value={accountEdit.organizationId}
                            onChange={(event) => setAccountEdit((draft) => ({ ...draft, organizationId: event.target.value }))}
                            required
                          >
                            {organizations.map((organization) => (
                              <option key={organization.id} value={organization.id}>
                                {organization.name}
                              </option>
                            ))}
                          </Select>
                        ) : null}
                        <div className="grid gap-3 md:grid-cols-3">
                          <Input
                            value={accountEdit.name}
                            onChange={(event) => setAccountEdit((draft) => ({ ...draft, name: event.target.value }))}
                            placeholder="Account name"
                            required
                          />
                          <Input
                            value={accountEdit.phoneNumber}
                            onChange={(event) => setAccountEdit((draft) => ({ ...draft, phoneNumber: event.target.value }))}
                            placeholder="+60123456789"
                          />
                          <Select
                            value={String(accountEdit.historySyncLookbackDays)}
                            onChange={(event) => setAccountEdit((draft) => ({ ...draft, historySyncLookbackDays: Number(event.target.value) }))}
                          >
                            {WHATSAPP_HISTORY_SYNC_OPTIONS.map((days) => (
                              <option key={days} value={days}>
                                {formatHistorySyncWindow(days)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" className="min-w-32" disabled={isWorking || (isSuperAdmin && !accountEdit.organizationId)}>
                            Save changes
                          </Button>
                          <Button variant="secondary" className="min-w-32" disabled={isWorking} onClick={() => setEditingAccountId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div>
                          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Device Name</p>
                          <p className="break-words font-semibold leading-5 text-text">{account.name}</p>
                          {isSuperAdmin ? <p className="mt-1 text-xs text-text-soft">{getOrganizationName(account.organization_id)}</p> : null}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Status</p>
                          <span className={`inline-flex min-w-0 items-center gap-2 font-medium ${statusTone.text}`}>
                            <span className={`h-3 w-3 shrink-0 rounded-full ${statusTone.dot}`} />
                            {formatConnectionStatus(account.status)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Phone Number</p>
                          <p className="truncate font-mono text-sm tracking-wide text-text" title={phoneNumber}>
                            {phoneNumber}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Device Info</p>
                          <div className="flex flex-wrap gap-2">
                            <span title={`Last connected: ${formatTimestamp(account.last_connected_at)}. Last disconnected: ${formatTimestamp(account.last_disconnected_at)}.`} className="inline-flex items-center gap-1.5 bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                              <Info className="h-3.5 w-3.5" />
                              Device Info
                            </span>
                            <span title={`Health score: ${account.health_score ?? "--"}`} className="inline-flex items-center gap-1.5 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              <PlugZap className="h-3.5 w-3.5" />
                              Readiness
                            </span>
                            <span title={`History sync: ${formatHistorySyncWindow(account.history_sync_lookback_days ?? 7)}`} className="inline-flex items-center gap-1.5 bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700">
                              <Zap className="h-3.5 w-3.5" />
                              Webhooks
                            </span>
                          </div>
                          {account.status?.toLowerCase() === "qr_required" ? (
                            <div className="mt-4">
                              <WhatsAppQrDisplay accountId={account.id} />
                            </div>
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Actions</p>
                          <div className="flex flex-wrap gap-2">
                            {connected ? (
                              <Button
                                className="gap-1.5 bg-red-500 px-3 py-2 text-xs text-white hover:bg-red-600"
                                disabled={isWorking}
                                onClick={() => handleDisconnectAccount(account.id, account.name)}
                              >
                                <Unplug className="h-3.5 w-3.5" />
                                Disconnect
                              </Button>
                            ) : (
                              <Button
                                className="gap-1.5 bg-[#78bd2b] px-3 py-2 text-xs text-white hover:bg-[#64a421]"
                                disabled={isWorking}
                                onClick={() => handleReconnectAccount(account.id, account.name)}
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                Pair as New Device
                              </Button>
                            )}
                            <Button variant="secondary" className="gap-1.5 px-3 py-2 text-xs" disabled={isWorking} onClick={() => beginEditAccount(account)}>
                              <RefreshCw className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              className="gap-1.5 bg-red-500 px-3 py-2 text-xs text-white hover:bg-red-600"
                              disabled={isWorking}
                              onClick={() => handleDeleteAccount(account.id, account.name)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <PanelPagination
            className="mt-4"
            page={accountPagination.page}
            pageCount={accountPagination.pageCount}
            totalItems={accountPagination.totalItems}
            onPageChange={accountPagination.setPage}
          />
        </Card>
      </div>

    </section>
  );
}
