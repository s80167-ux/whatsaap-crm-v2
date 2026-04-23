import { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  createOrganization,
  createUser,
  createWhatsAppAccount,
  deleteOrganization,
  reconnectWhatsAppAccount,
  deleteUser,
  deleteWhatsAppAccount,
  resetUserPassword,
  updateOrganization,
  updateUser,
  updateWhatsAppAccount
} from "../api/admin";
import { createQuickReply, deleteQuickReply, updateQuickReply } from "../api/crm";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { WhatsAppQrDisplay } from "../components/WhatsAppQrDisplay";
import { useOrganizations, useOrganizationUsers, useWhatsAppAccounts } from "../hooks/useAdmin";
import { useQuickReplies } from "../hooks/useQuickReplies";
import { getStoredUser } from "../lib/auth";
import type { OrganizationSummary, UserSummary, WhatsAppAccountSummary } from "../types/admin";

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString();
}

const WHATSAPP_HISTORY_SYNC_OPTIONS = [0, 1, 3, 7, 14, 30, 60, 90] as const;

function formatHistorySyncWindow(days: number | null | undefined) {
  if (!days) {
    return "New messages only";
  }

  return `Previous ${days} ${days === 1 ? "day" : "days"}`;
}

export function SetupPage() {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const canManageQuickReplies = Boolean(
    currentUser?.role === "super_admin" || currentUser?.permissionKeys.includes("org.manage_settings")
  );
  const { data: organizations = [] } = useOrganizations();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("");
  const activeOrganizationId = isSuperAdmin ? selectedOrganizationId || null : currentUser?.organizationId ?? null;
  const { data: users = [] } = useOrganizationUsers(activeOrganizationId);
  const { data: accounts = [], isFetching: isRefreshingAccounts, refetch: refetchAccounts } = useWhatsAppAccounts(activeOrganizationId);
  const { data: quickReplies = [] } = useQuickReplies({
    organizationId: activeOrganizationId,
    includeInactive: true,
    enabled: canManageQuickReplies && Boolean(activeOrganizationId)
  });

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
    role: Exclude<UserSummary["role"], "super_admin">;
    status: UserSummary["status"];
  }>({ organizationId: "", fullName: "", role: "agent", status: "active" });
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountEdit, setAccountEdit] = useState<{
    organizationId: string;
    name: string;
    phoneNumber: string;
    historySyncLookbackDays: number;
  }>({ organizationId: "", name: "", phoneNumber: "", historySyncLookbackDays: 7 });
  const [quickReplyTitle, setQuickReplyTitle] = useState("");
  const [quickReplyBody, setQuickReplyBody] = useState("");
  const [quickReplyCategory, setQuickReplyCategory] = useState("");
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
      await updateUser(userId, {
        organizationId: isSuperAdmin ? userEdit.organizationId : undefined,
        fullName: userEdit.fullName || null,
        role: userEdit.role,
        status: userEdit.status
      });
      setEditingUserId(null);
      setNotice("User updated.");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update user");
    } finally {
      setIsWorking(false);
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

  async function handleRefreshAccounts() {
    setNotice(null);
    await refetchAccounts();
  }

  async function handleCreateQuickReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeOrganizationId) {
      setNotice("Select an organization before creating quick replies.");
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await createQuickReply({
        organizationId: activeOrganizationId,
        title: quickReplyTitle,
        body: quickReplyBody,
        category: quickReplyCategory || null
      });
      setQuickReplyTitle("");
      setQuickReplyBody("");
      setQuickReplyCategory("");
      setNotice("Quick reply created. Users and agents can select it in their chat composer.");
      await queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create quick reply");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleToggleQuickReply(templateId: string, nextActive: boolean) {
    setIsWorking(true);
    setNotice(null);

    try {
      await updateQuickReply({
        templateId,
        organizationId: activeOrganizationId,
        isActive: nextActive
      });
      setNotice(nextActive ? "Quick reply activated." : "Quick reply hidden from chat composers.");
      await queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update quick reply");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteQuickReply(templateId: string, title: string) {
    if (!window.confirm(`Delete quick reply "${title}"?`)) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await deleteQuickReply({
        templateId,
        organizationId: activeOrganizationId
      });
      setNotice("Quick reply deleted.");
      await queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete quick reply");
    } finally {
      setIsWorking(false);
    }
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
              {organizations.map((organization) => (
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
          </Card>
        ) : null}

        <Card elevated>
          <h3 className="text-lg font-semibold text-text">Users</h3>
          <div className="mt-4 space-y-3 text-sm text-text-muted">
            {users.map((user) => (
              <div key={user.id} className="rounded-lg border border-border bg-background-tint p-4">
                {editingUserId === user.id ? (
                  <form className="space-y-3" onSubmit={(event) => handleUpdateUser(event, user.id)}>
                    <p className="text-xs uppercase tracking-[0.16em] text-text-soft">{user.email}</p>
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
                    <p className="font-medium text-text">{user.full_name ?? user.email}</p>
                    <p className="mt-1">{user.email}</p>
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
        </Card>

        <Card elevated>
          <h3 className="text-lg font-semibold text-text">WhatsApp accounts</h3>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-text-soft">
            <p>Auto-refreshes every 15 seconds while an organization is selected.</p>
            <Button variant="ghost" className="px-3 py-2 text-xs" disabled={isRefreshingAccounts} onClick={handleRefreshAccounts}>
              {isRefreshingAccounts ? "Refreshing..." : "Refresh status"}
            </Button>
          </div>
          <div className="mt-4 space-y-3 text-sm text-text-muted">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-lg border border-border bg-background-tint p-4">
                {editingAccountId === account.id ? (
                  <form className="space-y-3" onSubmit={(event) => handleUpdateAccount(event, account.id)}>
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
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1" disabled={isWorking || (isSuperAdmin && !accountEdit.organizationId)}>
                        Save changes
                      </Button>
                      <Button
                        variant="secondary"
                        className="flex-1"
                        disabled={isWorking}
                        onClick={() => setEditingAccountId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="font-medium text-text">{account.name}</p>
                    <p className="mt-1">{account.phone_number_normalized ?? account.phone_number ?? "No phone set"}</p>
                    <p className="mt-1 uppercase tracking-[0.16em] text-text-soft">{account.status}</p>
                    <div className="mt-3 space-y-1 text-xs text-text-soft">
                      <p>Last connected: {formatTimestamp(account.last_connected_at)}</p>
                      <p>Last disconnected: {formatTimestamp(account.last_disconnected_at)}</p>
                      <p>Health score: {account.health_score ?? "--"}</p>
                      <p>History sync: {formatHistorySyncWindow(account.history_sync_lookback_days ?? 7)}</p>
                    </div>
                    {account.status?.toLowerCase() === "qr_required" ? (
                      <div className="mt-4">
                        <WhatsAppQrDisplay accountId={account.id} />
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={isWorking}
                        onClick={() => beginEditAccount(account)}
                      >
                        Edit account
                      </Button>
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={isWorking}
                        onClick={() => handleReconnectAccount(account.id, account.name)}
                      >
                        Reconnect account
                      </Button>
                      <Button
                        variant="secondary"
                        className="w-full text-coral"
                        disabled={isWorking}
                        onClick={() => handleDeleteAccount(account.id, account.name)}
                      >
                        Delete account
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {canManageQuickReplies ? (
        <div className="grid gap-6 xl:grid-cols-[380px,minmax(0,1fr)]">
          <motion.form onSubmit={handleCreateQuickReply} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Card elevated>
              <h3 className="text-lg font-semibold text-text">Quick replies</h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Org admins compose approved replies here. Agents and users can select active replies in the Inbox chat editor.
              </p>
              <div className="mt-4 space-y-3">
                {isSuperAdmin && !activeOrganizationId ? (
                  <p className="rounded-lg border border-border bg-background-tint px-4 py-3 text-sm leading-6 text-text-muted">
                    Select an organization above before creating quick replies.
                  </p>
                ) : null}
                <Input
                  value={quickReplyTitle}
                  onChange={(event) => setQuickReplyTitle(event.target.value)}
                  placeholder="Reply title"
                  required
                />
                <Input
                  value={quickReplyCategory}
                  onChange={(event) => setQuickReplyCategory(event.target.value)}
                  placeholder="Category (optional)"
                />
                <textarea
                  value={quickReplyBody}
                  onChange={(event) => setQuickReplyBody(event.target.value)}
                  placeholder="Write the message agents can insert..."
                  required
                  rows={5}
                  className="w-full resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm text-text outline-none transition focus:border-primary/30"
                />
                <Button type="submit" disabled={isWorking || !activeOrganizationId}>
                  Create quick reply
                </Button>
              </div>
            </Card>
          </motion.form>

          <Card elevated>
            <h3 className="text-lg font-semibold text-text">Organization reply library</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {quickReplies.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-background-tint px-4 py-6 text-sm leading-6 text-text-muted">
                  No quick replies yet for this organization.
                </p>
              ) : (
                quickReplies.map((reply) => (
                  <div key={reply.id} className="rounded-xl border border-border bg-background-tint p-4 text-sm text-text-muted">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text">{reply.title}</p>
                        {reply.category ? (
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-text-soft">{reply.category}</p>
                        ) : null}
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        reply.is_active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-border bg-white text-text-soft"
                      }`}>
                        {reply.is_active ? "Active" : "Hidden"}
                      </span>
                    </div>
                    <p className="mt-3 leading-6">{reply.body}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        disabled={isWorking}
                        onClick={() => handleToggleQuickReply(reply.id, !reply.is_active)}
                      >
                        {reply.is_active ? "Hide from agents" : "Make active"}
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs text-coral"
                        disabled={isWorking}
                        onClick={() => handleDeleteQuickReply(reply.id, reply.title)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
