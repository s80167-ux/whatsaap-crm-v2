import { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Link2, PlugZap, RefreshCw, Trash2, Unplug, UserCircle, Zap } from "lucide-react";
import {
  approveGoogleSignupRequest,
  createOrganization,
  createUser,
  createWhatsAppAccount,
  disconnectWhatsAppAccount,
  deleteOrganization,
  reconnectWhatsAppAccount,
  deleteUser,
  deleteWhatsAppAccount,
  resetUserPassword,
  rejectGoogleSignupRequest,
  updateOrganization,
  updateUser,
  updateWhatsAppAccount
} from "../api/admin";
import { Button } from "../components/Button";
import { PopupOverlay } from "../components/PopupOverlay";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { useGoogleSignupRequests, useOrganizations, useOrganizationUsers } from "../hooks/useAdmin";
import { useIsMobileViewport } from "../hooks/useMediaQuery";
import { getStoredUser, updateStoredUser } from "../lib/auth";
import type { GoogleSignupRequestSummary, OrganizationSummary, UserSummary } from "../types/admin";

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
    return { dot: "bg-success", text: "text-success" };
  }

  if (normalized === "pairing" || normalized === "reconnecting" || normalized === "qr_required" || normalized === "new") {
    return { dot: "bg-warning", text: "text-warning" };
  }

  return { dot: "bg-destructive", text: "text-destructive" };
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
    <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-card text-text-soft">
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
  const isMobile = useIsMobileViewport();
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const { data: organizations = [] } = useOrganizations();
  const { data: googleSignupRequests = [] } = useGoogleSignupRequests(isSuperAdmin);
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
  const [signupApproval, setSignupApproval] = useState<Record<string, {
    organizationId: string;
    role: Exclude<UserSummary["role"], "super_admin">;
    fullName: string;
  }>>({});
  // WhatsApp account edit state moved to WhatsAppAccountDashboard
  const [notice, setNotice] = useState<string | null>(null);
  const [userCreateError, setUserCreateError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const canCreateScopedRecords = !isSuperAdmin || Boolean(activeOrganizationId) || userRole === "super_admin";

  function openUserPopup() {
    setUserCreateError(null);
    setShowUserPopup(true);
  }

  function closeUserPopup() {
    setUserCreateError(null);
    setShowUserPopup(false);
  }

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

  function getSignupApprovalDraft(request: GoogleSignupRequestSummary) {
    return signupApproval[request.id] ?? {
      organizationId: selectedOrganizationId || organizations[0]?.id || "",
      role: "agent",
      fullName: request.full_name ?? ""
    };
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

    if (isSuperAdmin && userRole !== "super_admin" && !activeOrganizationId) {
      setUserCreateError("Select an organization before creating this user.");
      return;
    }

    setIsWorking(true);
    setNotice(null);
    setUserCreateError(null);

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
      closeUserPopup();
      setNotice("User created.");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error) {
      setUserCreateError(error instanceof Error ? error.message : "Unable to create user");
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

  async function handleApproveGoogleSignup(request: GoogleSignupRequestSummary) {
    const draft = getSignupApprovalDraft(request);

    if (!draft.organizationId) {
      setNotice("Select an organization before approving this request.");
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await approveGoogleSignupRequest(request.id, {
        organizationId: draft.organizationId,
        role: draft.role,
        fullName: draft.fullName || request.full_name || null
      });
      setSignupApproval((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      setNotice(`Approved Google signup for ${request.email}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["google-signup-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] })
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to approve signup request");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRejectGoogleSignup(request: GoogleSignupRequestSummary) {
    if (!window.confirm(`Reject Google signup request from ${request.email}?`)) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await rejectGoogleSignupRequest(request.id, { reason: "Rejected by super admin" });
      setNotice(`Rejected Google signup for ${request.email}.`);
      await queryClient.invalidateQueries({ queryKey: ["google-signup-requests"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to reject signup request");
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
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),340px] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Setup</p>
            <h2 className="mt-3 section-title">Tenant operations console</h2>
            <p className="mt-2 max-w-3xl section-copy">
              This screen handles the first real admin workflow after auth: provision an organization, invite users, and register WhatsApp sessions without leaving the app.
            </p>
          </div>
          <div className="workspace-subtle p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Workspace focus</p>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Keep organization, user, and channel administration calm and readable for non-technical SME operators.
            </p>
          </div>
        </div>
        {notice ? <p className="mt-4 text-sm text-destructive">{notice}</p> : null}
      </Card>

      {isSuperAdmin ? (
        <Card elevated className="workspace-block">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Access requests</p>
              <h3 className="mt-2 text-lg font-semibold text-text">Pending Google signups</h3>
            </div>
            <span className="rounded-full border border-border bg-background-tint px-3 py-1 text-xs font-semibold text-text-muted">
              {googleSignupRequests.length} pending
            </span>
          </div>

          {googleSignupRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background-tint px-4 py-8 text-sm text-text-muted">
              No pending Google signup requests.
            </div>
          ) : (
            <div className="space-y-3">
              {googleSignupRequests.map((request) => {
                const draft = getSignupApprovalDraft(request);

                return (
                  <div key={request.id} className="workspace-subtle p-4 shadow-soft">
                    <div className="grid gap-4 lg:grid-cols-[1.1fr,1.4fr] lg:items-center">
                      <div className="flex min-w-0 items-start gap-3">
                        <UserAvatarPreview src={request.avatar_url} label={request.full_name ?? request.email} />
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-text">{request.full_name ?? request.email}</p>
                          <p className="mt-1 break-all text-sm text-text-muted">{request.email}</p>
                          <p className="mt-2 text-xs text-text-soft">Requested {formatTimestamp(request.requested_at)}</p>
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-[1.2fr,0.8fr,1fr,auto] md:items-center">
                        <Select
                          value={draft.organizationId}
                          onChange={(event) =>
                            setSignupApproval((current) => ({
                              ...current,
                              [request.id]: { ...draft, organizationId: event.target.value }
                            }))
                          }
                        >
                          <option value="">Select organization</option>
                          {organizations.map((organization) => (
                            <option key={organization.id} value={organization.id}>
                              {organization.name}
                            </option>
                          ))}
                        </Select>
                        <Select
                          value={draft.role}
                          onChange={(event) =>
                            setSignupApproval((current) => ({
                              ...current,
                              [request.id]: {
                                ...draft,
                                role: event.target.value as Exclude<UserSummary["role"], "super_admin">
                              }
                            }))
                          }
                        >
                          <option value="org_admin">org_admin</option>
                          <option value="manager">manager</option>
                          <option value="agent">agent</option>
                          <option value="user">user</option>
                        </Select>
                        <Input
                          value={draft.fullName}
                          onChange={(event) =>
                            setSignupApproval((current) => ({
                              ...current,
                              [request.id]: { ...draft, fullName: event.target.value }
                            }))
                          }
                          placeholder="Full name"
                        />
                        <div className="grid grid-cols-2 gap-2 md:w-40">
                          <Button
                            className="w-full px-3 py-2 text-xs"
                            disabled={isWorking || !draft.organizationId}
                            onClick={() => handleApproveGoogleSignup(request)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="secondary"
                            className="w-full px-3 py-2 text-xs text-destructive"
                            disabled={isWorking}
                            onClick={() => handleRejectGoogleSignup(request)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      <div className="space-y-6">
        {isSuperAdmin ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            <Card elevated className="workspace-block relative">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-text">Organizations</h3>
                <Button
                  variant="ghost"
                  className="z-10"
                  onClick={() => setShowOrgPopup(true)}
                >
                  Add Organization
                </Button>
              </div>
              {isMobile ? (
                <div className="space-y-3">
                  {organizationPagination.visibleItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-background-tint px-4 py-8 text-sm text-text-muted">
                      No organizations yet. Add the first organization to start assigning users and channels.
                    </div>
                  ) : organizationPagination.visibleItems.map((organization) => (
                    <div key={organization.id} className="workspace-subtle p-4 shadow-soft">
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
                          <div className="grid grid-cols-2 gap-2">
                            <Button type="submit" className="w-full" disabled={isWorking}>Save changes</Button>
                            <Button variant="secondary" className="w-full" disabled={isWorking} onClick={() => setEditingOrganizationId(null)}>Cancel</Button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-text">{organization.name}</p>
                              <p className="mt-1 break-all text-sm text-text-muted">{organization.slug || "No slug"}</p>
                            </div>
                            <span className="rounded-full border border-border bg-background-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">
                              {organization.status}
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-text-soft">Created {new Date(organization.created_at).toLocaleDateString()}</p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button variant="secondary" className="w-full" disabled={isWorking} onClick={() => beginEditOrganization(organization)}>Edit</Button>
                            <Button variant="secondary" className="w-full text-destructive" disabled={isWorking} onClick={() => handleDeleteOrganization(organization.id, organization.name)}>Delete</Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="workspace-table-wrap">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th className="px-5 py-4">Name</th>
                        <th className="px-5 py-4">Slug</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4">Created</th>
                        <th className="px-5 py-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {organizationPagination.visibleItems.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-sm text-text-muted" colSpan={5}>
                            No organizations yet. Add the first organization to start assigning users and channels.
                          </td>
                        </tr>
                      ) : organizationPagination.visibleItems.map((organization) => (
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
                                    className="text-destructive"
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
              )}
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

        <Card elevated className="workspace-block">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text">Users</h3>
            <Button variant="ghost" className="z-10" onClick={openUserPopup}>
              Add User
            </Button>
          </div>
          {isMobile ? (
            <div className="space-y-3">
              {userPagination.visibleItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background-tint px-4 py-8 text-sm text-text-muted">
                  No users yet. Add the first user to start assigning work and access.
                </div>
              ) : userPagination.visibleItems.map((user) => (
                <div key={user.id} className="workspace-subtle p-4 shadow-soft">
                  {editingUserId === user.id ? (
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
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="submit" className="w-full" disabled={isWorking || (isSuperAdmin && !userEdit.organizationId)}>Save changes</Button>
                        <Button variant="secondary" className="w-full" disabled={isWorking} onClick={() => setEditingUserId(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <UserAvatarPreview src={user.avatar_url} label={user.full_name ?? user.email} />
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-medium text-text">{user.full_name ?? user.email}</p>
                          <p className="mt-1 break-all text-sm text-text-muted">{user.email}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl border border-border bg-background-tint px-3 py-2">
                          <p className="uppercase tracking-[0.14em] text-text-soft">Role</p>
                          <p className="mt-1 text-text">{user.role}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-background-tint px-3 py-2">
                          <p className="uppercase tracking-[0.14em] text-text-soft">Status</p>
                          <p className="mt-1 uppercase tracking-[0.14em] text-text">{user.status}</p>
                        </div>
                        {isSuperAdmin ? (
                          <div className="col-span-2 rounded-xl border border-border bg-background-tint px-3 py-2">
                            <p className="uppercase tracking-[0.14em] text-text-soft">Organization</p>
                            <p className="mt-1 break-words text-text">{getOrganizationName(user.organization_id)}</p>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Button
                          variant="ghost"
                          className="w-full px-2 py-2 text-xs"
                          disabled={isWorking || user.role === "super_admin"}
                          onClick={() => beginEditUser(user)}
                        >
                          Edit
                        </Button>
                        {canResetManagedUser(user) ? (
                          resetPasswordUserId === user.id ? (
                            <div className="col-span-3 rounded-xl border border-border bg-background-tint p-3">
                              <form className="space-y-2" onSubmit={(event) => handleResetUserPassword(event, user)}>
                                <Input
                                  type="password"
                                  value={resetPassword}
                                  onChange={(event) => setResetPassword(event.target.value)}
                                  placeholder="New password"
                                  minLength={8}
                                  required
                                  className="px-3 py-2 text-sm"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <Button type="submit" className="w-full px-3 py-2 text-xs" disabled={isWorking}>Reset</Button>
                                  <Button
                                    variant="secondary"
                                    className="w-full px-3 py-2 text-xs"
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
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              className="w-full px-2 py-2 text-xs"
                              disabled={isWorking}
                              onClick={() => {
                                setResetPasswordUserId(user.id);
                                setResetPassword("");
                              }}
                            >
                              Reset
                            </Button>
                          )
                        ) : (
                          <div />
                        )}
                        <Button
                          variant="ghost"
                          className="w-full px-2 py-2 text-xs text-destructive"
                          disabled={isWorking}
                          onClick={() => handleDeleteUser(user.id, user.full_name ?? user.email ?? user.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="workspace-table-wrap">
              <table className="workspace-table workspace-table-compact w-full text-xs align-middle table-fixed">
                <colgroup>
                  <col className="user-table-col-name" />
                  <col className="user-table-col-email" />
                  {isSuperAdmin ? <col className="user-table-col-org" /> : null}
                  <col className={isSuperAdmin ? "user-table-col-role" : "user-table-col-role-nosuper"} />
                  <col className="user-table-col-status" />
                  <col className="user-table-col-actions" />
                </colgroup>
                <thead>
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
                  {userPagination.visibleItems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-sm text-text-muted" colSpan={isSuperAdmin ? 6 : 5}>
                        No users yet. Add the first user to start assigning work and access.
                      </td>
                    </tr>
                  ) : userPagination.visibleItems.map((user) => (
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
                          <td className="px-3 py-2 align-middle font-medium text-text">
                            <div className="flex items-center gap-2 min-w-0">
                              <UserAvatarPreview src={user.avatar_url} label={user.full_name ?? user.email} />
                              <div className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-text text-[13px]">{user.full_name ?? user.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle truncate">{user.email}</td>
                          {isSuperAdmin && <td className="px-3 py-2 align-middle truncate">{getOrganizationName(user.organization_id)}</td>}
                          <td className="px-3 py-2 align-middle truncate">{user.role}</td>
                          <td className="px-3 py-2 align-middle uppercase tracking-[0.14em] text-text-soft truncate">{user.status}</td>
                          <td className="px-3 py-2 align-middle">
                            <div className="flex gap-1 flex-row flex-nowrap items-center">
                              <Button
                                variant="ghost"
                                size="sm"
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
                                    size="sm"
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
                                size="sm"
                                className="px-1 py-0.5 text-xs text-destructive min-w-0"
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
          )}
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

      <PopupOverlay open={showUserPopup} onClose={closeUserPopup} title="Create user" panelClassName="popup-compact-30">
        <form onSubmit={handleCreateUser}>
          <div className="space-y-2 p-2">
            {userCreateError ? <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-2 text-xs leading-5 text-destructive">{userCreateError}</p> : null}
            {isSuperAdmin ? (
              <p className="rounded-lg border border-border bg-background-tint px-2 py-2 text-xs leading-5 text-text-muted">
                {userRole === "super_admin"
                  ? "Super admin users are created without an organization."
                  : activeOrganizationId
                    ? "New user will be created in the selected organization."
                    : "Select an organization before creating a non-super-admin user."}
              </p>
            ) : null}
            {isSuperAdmin && userRole !== "super_admin" ? (
              <Select
                value={selectedOrganizationId}
                onChange={(event) => setSelectedOrganizationId(event.target.value)}
                required
                className="text-sm px-2 py-1"
              >
                <option value="">Select organization</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </Select>
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
