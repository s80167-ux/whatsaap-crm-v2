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
  deleteWhatsAppAccount
} from "../api/admin";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { useOrganizations, useOrganizationUsers, useWhatsAppAccounts } from "../hooks/useAdmin";
import { getStoredUser } from "../lib/auth";

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString();
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

  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userFullName, setUserFullName] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"org_admin" | "manager" | "agent" | "user" | "super_admin">("agent");
  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const canCreateScopedRecords = !isSuperAdmin || Boolean(activeOrganizationId) || userRole === "super_admin";

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
        phoneNumber: accountPhone || null
      });
      setAccountName("");
      setAccountPhone("");
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
                  <p className="font-medium text-text">{organization.name}</p>
                  <p className="mt-1">{organization.slug}</p>
                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      className="w-full text-coral"
                      disabled={isWorking}
                      onClick={() => handleDeleteOrganization(organization.id, organization.name)}
                    >
                      Delete organization
                    </Button>
                  </div>
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
                <p className="font-medium text-text">{user.full_name ?? user.email}</p>
                <p className="mt-1">{user.role}</p>
                <p className="mt-1 uppercase tracking-[0.16em] text-text-soft">{user.status}</p>
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    className="w-full text-coral"
                    disabled={isWorking}
                    onClick={() => handleDeleteUser(user.id, user.full_name ?? user.email ?? user.id)}
                  >
                    Delete user
                  </Button>
                </div>
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
                <p className="font-medium text-text">{account.name}</p>
                <p className="mt-1">{account.phone_number_normalized ?? account.phone_number ?? "No phone set"}</p>
                <p className="mt-1 uppercase tracking-[0.16em] text-text-soft">{account.status}</p>
                <div className="mt-3 space-y-1 text-xs text-text-soft">
                  <p>Last connected: {formatTimestamp(account.last_connected_at)}</p>
                  <p>Last disconnected: {formatTimestamp(account.last_disconnected_at)}</p>
                  <p>Health score: {account.health_score ?? "--"}</p>
                </div>
                <div className="mt-3 space-y-2">
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
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
