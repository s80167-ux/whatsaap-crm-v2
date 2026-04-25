import {
  BarChart3,
  Building2,
  ChevronDown,
  Check,
  FileBarChart,
  KeyRound,
  LogOut,
  MessageSquare,
  Settings2,
  TrendingUp,
  UserCircle,
  Users,
  Workflow,
  X,
  PlugZap
} from "lucide-react";
import clsx from "clsx";
import { motion } from "framer-motion";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import brandLogo from "../../asset/rezeki_dashboard_logo_glass.png";
import { updateMyPassword, updateMyProfile } from "../api/auth";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { NavLinkItem } from "../components/NavLinkItem";
import { PopupOverlay } from "../components/PopupOverlay";
import { WhatsAppConnectionsBadge } from "../components/WhatsAppConnectionsBadge";
import { useOrganizations, useWhatsAppAccounts } from "../hooks/useAdmin";
import { clearAuthSession, getStoredUser, updateStoredUser } from "../lib/auth";

const SUPER_ADMIN_ORGANIZATION_KEY = "crm_super_admin_organization_id";
const MAX_PROFILE_PICTURE_BYTES = 512 * 1024;
const PROFILE_PICTURE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type DashboardOutletContext = {
  isSuperAdmin: boolean;
  selectedOrganizationId: string;
  selectedOrganizationName: string | null;
  setSelectedOrganizationId: (organizationId: string) => void;
};

type SidebarSubItem = {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: ReactNode;
};

function SidebarNavGroup({ icon, label, items }: { icon: ReactNode; label: string; items: SidebarSubItem[] }) {
  const location = useLocation();
  const isGroupActive = items.some((item) =>
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)
  );
  const [isOpen, setIsOpen] = useState(isGroupActive);

  useEffect(() => {
    if (isGroupActive) {
      setIsOpen(true);
    }
  }, [isGroupActive]);

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={clsx(
          "flex w-full items-center gap-3 rounded-none px-4 py-3 text-left text-sm font-medium transition duration-200",
          isGroupActive ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
        )}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-sm text-current">{icon}</span>
        <span>{label}</span>
        <ChevronDown
          size={16}
          className={clsx("ml-auto transition-transform duration-200", isOpen ? "rotate-180" : "rotate-0")}
        />
      </button>
      <div className={clsx("overflow-hidden transition-all duration-200", isOpen ? "max-h-56 opacity-100" : "max-h-0 opacity-0")}>
        <div className="space-y-1 py-1">
          {items.map((item) => (
            <NavLinkItem key={item.to} to={item.to} icon={item.icon} label={item.label} badge={item.badge} variant="sub" />
          ))}
        </div>
      </div>
    </div>
  );
}

function UserAvatar({
  src,
  name,
  size = "sm"
}: {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "md" ? "h-10 w-10" : "h-6 w-6";
  const iconSize = size === "md" ? 22 : 16;

  return (
    <span className={`flex ${sizeClass} shrink-0 overflow-hidden rounded-full bg-white/12 text-white`}>
      {src ? (
        <img src={src} alt={name ? `${name} profile` : "User profile"} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <UserCircle size={iconSize} />
        </span>
      )}
    </span>
  );
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

export function DashboardLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const isSuperAdmin = user?.role === "super_admin";
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(() => {
    if (!isSuperAdmin) {
      return "";
    }
    try {
      return localStorage.getItem(SUPER_ADMIN_ORGANIZATION_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const activeOrganizationId = isSuperAdmin ? selectedOrganizationId || null : user?.organizationId ?? null;
  const { data: organizations = [] } = useOrganizations();
  const selectedOrganizationName = organizations.find((organization) => organization.id === selectedOrganizationId)?.name ?? null;
  const { data: whatsappAccounts = [] } = useWhatsAppAccounts(activeOrganizationId);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isProfileFormOpen, setIsProfileFormOpen] = useState(false);
  const [profileFullName, setProfileFullName] = useState(user?.fullName ?? "");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [profilePhone, setProfilePhone] = useState(user?.phone ?? "");
  const [profileAddress, setProfileAddress] = useState(user?.address ?? "");
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);

  useEffect(() => {
    function handleStoredUserUpdate() {
      setUser(getStoredUser());
    }

    window.addEventListener("crm_auth_user_updated", handleStoredUserUpdate);
    return () => window.removeEventListener("crm_auth_user_updated", handleStoredUserUpdate);
  }, []);

  useEffect(() => {
    if (!isProfileFormOpen) {
      setProfileFullName(user?.fullName ?? "");
      setProfileAvatarUrl(user?.avatarUrl ?? null);
      setProfilePhone(user?.phone ?? "");
      setProfileAddress(user?.address ?? "");
    }
  }, [isProfileFormOpen, user?.avatarUrl, user?.fullName, user?.phone, user?.address]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }

    try {
      if (selectedOrganizationId) {
        localStorage.setItem(SUPER_ADMIN_ORGANIZATION_KEY, selectedOrganizationId);
      } else {
        localStorage.removeItem(SUPER_ADMIN_ORGANIZATION_KEY);
      }
    } catch {
      // noop
    }
  }, [isSuperAdmin, selectedOrganizationId]);

  useEffect(() => {
    if (!isSuperAdmin || !selectedOrganizationId || organizations.length === 0) {
      return;
    }

    if (!organizations.some((organization) => organization.id === selectedOrganizationId)) {
      setSelectedOrganizationId("");
    }
  }, [isSuperAdmin, organizations, selectedOrganizationId]);

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordNotice(null);

    if (newPassword !== confirmPassword) {
      setPasswordNotice("Passwords do not match.");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      await updateMyPassword({ password: newPassword });
      setNewPassword("");
      setConfirmPassword("");
      setIsPasswordFormOpen(false);
      setPasswordNotice("Password updated.");
    } catch (error) {
      setPasswordNotice(error instanceof Error ? error.message : "Unable to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  async function handleProfilePictureChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!PROFILE_PICTURE_TYPES.has(file.type)) {
      setProfileNotice("Profile picture must be a JPG, PNG, WebP, or GIF image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PROFILE_PICTURE_BYTES) {
      setProfileNotice("Profile picture is too large. Please choose an image under 512 KB.");
      event.target.value = "";
      return;
    }

    try {
      setProfileAvatarUrl(await readProfilePicture(file));
      setProfileNotice(null);
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : "Unable to read selected image");
    } finally {
      event.target.value = "";
    }
  }

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUpdatingProfile(true);
    setProfileNotice(null);

    try {
      const updatedProfile = await updateMyProfile({
        fullName: profileFullName.trim() || null,
        avatarUrl: profileAvatarUrl,
        phone: profilePhone,
        address: profileAddress
      });

      updateStoredUser(() => updatedProfile);
      setIsProfileFormOpen(false);
      setProfileNotice("Profile updated.");
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : "Unable to update profile");
    } finally {
      setIsUpdatingProfile(false);
    }
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-hero-grid px-0 pb-0 pt-12 md:px-6 md:pb-4 md:pt-16">
      <header className="dashboard-topbar fixed inset-x-0 top-0 z-50 border-b border-white/20 bg-slate-950/70 text-white shadow-soft backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-[1880px] items-center justify-between gap-3 px-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 shrink-0 bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
              Rezeki CRM
            </span>
            {selectedOrganizationName ? (
              <span className="hidden truncate text-xs text-white/45 sm:inline">/ {selectedOrganizationName}</span>
            ) : null}
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              className="inline-flex h-8 max-w-[14rem] items-center gap-2 border border-white/15 bg-white/10 px-2.5 text-xs font-semibold text-white transition duration-200 hover:border-white/30 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/15"
              aria-label="Open profile panel"
              aria-expanded={isProfilePanelOpen}
              onClick={() => setIsProfilePanelOpen((isOpen) => !isOpen)}
            >
              <UserAvatar src={user?.avatarUrl} name={user?.fullName ?? user?.email ?? null} />
              <span className="hidden min-w-0 truncate sm:inline">
                {user?.fullName ?? user?.email ?? "Profile"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <PopupOverlay
        open={isProfilePanelOpen}
        onClose={() => setIsProfilePanelOpen(false)}
        title="Profile"
        description="Manage your profile, password, and session without leaving the dashboard."
        panelClassName="max-w-[min(36rem,calc(100vw-2rem))]"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <UserAvatar src={user?.avatarUrl} name={user?.fullName ?? user?.email ?? null} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{user?.fullName ?? user?.email ?? "Authenticated user"}</p>
              <p className="mt-0.5 truncate text-xs text-text-muted">{user?.email ?? user?.role ?? "user"}</p>
              {user?.phone && (
                <p className="mt-0.5 truncate text-xs text-text-muted">{user.phone}</p>
              )}
              {user?.address && (
                <p className="mt-0.5 truncate text-xs text-text-muted">{user.address}</p>
              )}
              <p className="mt-2 inline-flex border border-border bg-background-tint px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-soft">
                {user?.role ?? "user"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              className="col-span-2 border border-border bg-background-tint px-3 py-2 text-text hover:bg-white hover:text-text"
              aria-label="Edit my profile"
              disabled={isUpdatingProfile}
              onClick={() => {
                setIsProfileFormOpen((isOpen) => !isOpen);
                setIsPasswordFormOpen(false);
                setProfileNotice(null);
              }}
            >
              <UserCircle size={15} />
              <span className="ml-2">Edit profile</span>
            </Button>
            <Button
              variant="ghost"
              className="border border-border bg-background-tint px-3 py-2 text-text hover:bg-white hover:text-text"
              aria-label="Reset my password"
              disabled={isUpdatingPassword}
              onClick={() => {
                setIsPasswordFormOpen((isOpen) => !isOpen);
                setIsProfileFormOpen(false);
                setPasswordNotice(null);
                setConfirmPassword("");
              }}
            >
              <KeyRound size={15} />
              <span className="ml-2">Password</span>
            </Button>
            <Button
              onClick={() => {
                clearAuthSession();
                navigate("/login", { replace: true });
              }}
              variant="secondary"
              className="border-border bg-white px-3 py-2 text-text hover:bg-background-tint"
              aria-label="Sign out"
            >
              <LogOut size={15} />
              <span className="ml-2">Sign out</span>
            </Button>
          </div>

          {isProfileFormOpen ? (
            <form className="space-y-3" onSubmit={handleUpdateProfile}>
              <div className="flex items-center gap-3 border border-border bg-background-tint p-3">
                <UserAvatar src={profileAvatarUrl} name={profileFullName || user?.email || null} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-soft">Profile picture</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center justify-center border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-text transition hover:bg-background-tint">
                      Upload
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={handleProfilePictureChange}
                      />
                    </label>
                    {profileAvatarUrl ? (
                      <Button
                        variant="ghost"
                        className="border border-border bg-white px-2.5 py-1.5 text-xs text-text hover:bg-background-tint hover:text-text"
                        disabled={isUpdatingProfile}
                        onClick={() => setProfileAvatarUrl(null)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <Input
                value={profileFullName}
                onChange={(event) => setProfileFullName(event.target.value)}
                placeholder="Full name"
                aria-label="Full name"
                className="border-border bg-white px-3 py-2 text-text placeholder:text-text-soft"
              />
              <Input
                value={profilePhone}
                onChange={(event) => setProfilePhone(event.target.value)}
                placeholder="Phone number"
                aria-label="Phone number"
                className="border-border bg-white px-3 py-2 text-text placeholder:text-text-soft"
              />
              <Input
                value={profileAddress}
                onChange={(event) => setProfileAddress(event.target.value)}
                placeholder="Address"
                aria-label="Address"
                className="border-border bg-white px-3 py-2 text-text placeholder:text-text-soft"
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 px-3 py-2" disabled={isUpdatingProfile}>
                  Save profile
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1 px-3 py-2"
                  disabled={isUpdatingProfile}
                  onClick={() => {
                    setIsProfileFormOpen(false);
                    setProfileFullName(user?.fullName ?? "");
                    setProfileAvatarUrl(user?.avatarUrl ?? null);
                    setProfilePhone(user?.phone ?? "");
                    setProfileAddress(user?.address ?? "");
                    setProfileNotice(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
          {profileNotice ? <p className="text-xs text-coral">{profileNotice}</p> : null}

          {isPasswordFormOpen ? (
            <form className="space-y-2" onSubmit={handleUpdatePassword}>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                aria-label="New password"
                className="border-border bg-white px-3 py-2 text-text placeholder:text-text-soft"
                minLength={8}
                required
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                aria-label="Confirm new password"
                className="border-border bg-white px-3 py-2 text-text placeholder:text-text-soft"
                minLength={8}
                required
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 px-3 py-2" aria-label="Save password" disabled={isUpdatingPassword}>
                  <Check size={16} />
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1 px-3 py-2"
                  aria-label="Cancel password reset"
                  disabled={isUpdatingPassword}
                  onClick={() => {
                    setIsPasswordFormOpen(false);
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordNotice(null);
                  }}
                >
                  <X size={16} />
                </Button>
              </div>
            </form>
          ) : null}
          {passwordNotice ? <p className="text-xs text-coral">{passwordNotice}</p> : null}
        </div>
      </PopupOverlay>

      <div className="mx-auto grid min-h-[calc(100vh-3rem)] min-w-0 max-w-[1880px] gap-0 md:min-h-[calc(100vh-5rem)] md:grid-cols-[246px,minmax(0,1fr)] md:gap-2">
        <motion.aside className="min-w-0" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
          <Card className="app-shell dashboard-sidebar flex h-full flex-col rounded-none p-6 md:rounded-2xl" elevated>
            <div>
              <div className="logo-panel">
                <img src={brandLogo} alt="Rezeki Dashboard" className="h-auto w-full" />
              </div>
              <div className="mt-4">
                <p className="brand-badge">Rezeki Dashboard</p>
                <p className="mt-3 text-sm leading-6 text-text-muted">
                  WhatsApp CRM untuk PMKS with multi-account inbox, canonical contacts, and realtime operations.
                </p>
              </div>
            </div>

            {isSuperAdmin ? (
              <div className="mt-5">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Viewing org</span>
                  <Select
                    value={selectedOrganizationId}
                    onChange={(event) => setSelectedOrganizationId(event.target.value)}
                    className="sidebar-org-select mt-1.5 h-9 px-0 py-0 text-sm font-medium"
                    aria-label="Choose organization to view"
                  >
                    <option value="">Choose organization</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </Select>
                </label>
                {selectedOrganizationName ? (
                  <p className="mt-1 truncate text-[11px] text-white/40">Scoped to {selectedOrganizationName}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-white/40">Required for organization views</p>
                )}
              </div>
            ) : null}

            <nav className="mt-8 space-y-2">
              <NavLinkItem to="/dashboard" icon={<BarChart3 size={18} />} label="Dashboard" />
              <SidebarNavGroup
                icon={<MessageSquare size={18} />}
                label="Inbox"
                items={[
                  {
                    to: "/inbox",
                    icon: <MessageSquare size={16} />,
                    label: "Conversations",
                    badge: <WhatsAppConnectionsBadge accounts={whatsappAccounts} />
                  },
                  { to: "/inbox/replies", icon: <Settings2 size={16} />, label: "Reply library" }
                ]}
              />
              <SidebarNavGroup
                icon={<Users size={18} />}
                label="CRM"
                items={[
                  { to: "/contacts", icon: <Users size={16} />, label: "Contacts" },
                  { to: "/sales", icon: <TrendingUp size={16} />, label: "Sales" },
                  { to: "/reports", icon: <FileBarChart size={16} />, label: "Report" }
                ]}
              />
              <SidebarNavGroup
                icon={<Settings2 size={18} />}
                label="Setup"
                items={[
                  { to: "/setup", icon: <Settings2 size={16} />, label: "General" },
                  { to: "/whatsapp-accounts", icon: <PlugZap size={16} />, label: "WhatsApp Accounts" }
                ]}
              />
              {isSuperAdmin ? (
                <SidebarNavGroup
                  icon={<Workflow size={18} />}
                  label="Super Admin Map"
                  items={[
                    { to: "/super-admin-map", icon: <Workflow size={16} />, label: "Platform workflow" },
                    { to: "/super-admin-map/data-structure", icon: <Building2 size={16} />, label: "Data structure" },
                    { to: "/super-admin-map/organization-structure", icon: <Users size={16} />, label: "Org user structure" }
                  ]}
                />
              ) : null}
              {isSuperAdmin ? <NavLinkItem to="/platform" icon={<Building2 size={18} />} label="Platform" /> : null}
            </nav>
          </Card>
        </motion.aside>
        <main className="min-w-0 rounded-2xl bg-transparent px-2 py-4 md:pl-0 md:pr-2 xl:pr-3">
          <Outlet
            context={{
              isSuperAdmin,
              selectedOrganizationId,
              selectedOrganizationName,
              setSelectedOrganizationId
            } satisfies DashboardOutletContext}
          />
        </main>
      </div>
    </div>
  );
}
