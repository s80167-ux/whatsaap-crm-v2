import {
  Activity,
  BarChart3,
  Building2,
  ChevronDown,
  Check,
  ChevronsLeft,
  ChevronsRight,
  FileBarChart,
  Download,
  KeyRound,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessageSquare,
  ShoppingBag,
  ShieldCheck,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  UserCircle,
  Users,
  Workflow,
  X,
  PlugZap
} from "lucide-react";
import clsx from "clsx";
import { motion } from "framer-motion";
import type { FormEvent, ReactNode, SVGProps } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import brandLogo from "../../asset/rezeki_dashboard_logo_glass.png";
import brandLogoMobile from "../../asset/rezeki_dashboard_logo_mobile_transparent.png";
import { fetchMe, logout, updateMyPassword, updateMyProfile } from "../api/auth";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { NavLinkItem } from "../components/NavLinkItem";
import { NotificationBell } from "../components/NotificationBell";
import { PopupOverlay } from "../components/PopupOverlay";
import { RouteTransition } from "../components/RouteTransition";
import { SocialChannelBrandLogo } from "../components/SocialChannelBrand";
import { ThemeSwitcher } from "../components/theme-switcher";
import {
  useCampaignEmailModuleStatus,
  useCampaignsModuleStatus,
  useCampaignWhatsAppModuleStatus,
  useCrmModuleStatus,
  useInboxModuleStatus,
  useOrganizations,
  useSalesModuleStatus
} from "../hooks/useAdmin";
import { useIsMobileViewport } from "../hooks/useMediaQuery";
import { clearAuthSession, getStoredUser, updateStoredUser } from "../lib/auth";
import { canAccessCampaigns } from "../lib/moduleAccess";
import type { OrganizationSummary } from "../types/admin";

const SUPER_ADMIN_ORGANIZATION_KEY = "crm_super_admin_organization_id";
const MAX_PROFILE_PICTURE_BYTES = 512 * 1024;
const PROFILE_PICTURE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function ModuleBadge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" }) {
  return (
    <span
      className={clsx(
        "inline-flex min-h-[1.25rem] items-center border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        tone === "primary"
          ? "border-primary/20 bg-primary/10 text-primary"
          : "border-sidebar-foreground/15 bg-sidebar-foreground/10 text-sidebar-foreground/70"
      )}
    >
      {children}
    </span>
  );
}

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
  end?: boolean;
};

type SidebarSection = {
  id: string;
  label: string;
  icon: ReactNode;
  items: SidebarSubItem[];
};

function SidebarNavGroup({
  icon,
  label,
  items,
  onNavigate,
  compact = false
}: {
  icon: ReactNode;
  label: string;
  items: SidebarSubItem[];
  onNavigate?: () => void;
  compact?: boolean;
}) {
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
          compact
            ? "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition duration-200"
            : "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-medium transition duration-200",
          isGroupActive
            ? "bg-sidebar-foreground text-foreground shadow-panel"
            : "text-sidebar-foreground/72 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
        )}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={clsx("flex items-center justify-center rounded-sm text-current", compact ? "h-7 w-7" : "h-8 w-8")}>{icon}</span>
        <span className="leading-tight">{label}</span>
        <ChevronDown
          size={16}
          className={clsx("ml-auto transition-transform duration-200", isOpen ? "rotate-180" : "rotate-0")}
        />
      </button>
      <div className={clsx("overflow-hidden transition-all duration-200", isOpen ? "max-h-56 opacity-100" : "max-h-0 opacity-0")}>
        <div className="space-y-1 py-1">
          {items.map((item) => (
            <NavLinkItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              badge={item.badge}
              variant="sub"
              onClick={onNavigate}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function UserAvatar({ src, name, size = "sm" }: { src?: string | null; name?: string | null; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "h-10 w-10" : "h-6 w-6";
  const iconSize = size === "md" ? 22 : 16;

  return (
    <span className={`flex ${sizeClass} shrink-0 overflow-hidden rounded-full bg-sidebar-foreground/10 text-sidebar-foreground`}>
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

function SidebarContent({
  isSuperAdmin,
  organizations,
  selectedOrganizationId,
  selectedOrganizationName,
  setSelectedOrganizationId,
  showInbox,
  showCrm,
  showSales,
  showCampaigns,
  whatsappCampaignBadge,
  emailCampaignBadge,
  showDataExport,
  showContactReliability,
  onNavigate,
  mobile = false
}: {
  isSuperAdmin: boolean;
  organizations: OrganizationSummary[];
  selectedOrganizationId: string;
  selectedOrganizationName: string | null;
  setSelectedOrganizationId: (organizationId: string) => void;
  showInbox: boolean;
  showCrm: boolean;
  showSales: boolean;
  showCampaigns: boolean;
  whatsappCampaignBadge?: ReactNode;
  emailCampaignBadge?: ReactNode;
  showDataExport: boolean;
  showContactReliability: boolean;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className={mobile ? "space-y-3" : ""}>
        {mobile ? (
          <div className="rounded-[1rem] border border-sidebar-foreground/10 bg-sidebar-foreground/5 px-3 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-sidebar-foreground/10 bg-sidebar-foreground/10">
                <img src={brandLogoMobile} alt="Rezeki Dashboard" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-sidebar-foreground">Rezeki CRM</p>
                <p className="text-[11px] leading-4 text-sidebar-foreground/55 break-words">{selectedOrganizationName ?? t("layout.whatsappWorkspace")}</p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="logo-panel flex min-h-[8.5rem] items-center overflow-hidden px-2.5 py-2.5">
              <img
                src={brandLogo}
                alt="Rezeki Dashboard"
                className="dashboard-brand-logo"
              />
            </div>
            <div className="mt-4">
              <p className="brand-badge">Rezeki Dashboard</p>
              <p className="sidebar-hero-copy">{t("layout.sidebarCopy")}</p>
            </div>
          </div>
        )}
      </div>

      {isSuperAdmin ? (
        <div className={mobile ? "mt-3" : "mt-5"}>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">{mobile ? t("layout.currentOrg") : t("layout.viewingOrg")}</span>
            <Select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)} className={`sidebar-org-select mt-1.5 ${mobile ? "h-8 rounded-lg border border-sidebar-foreground/10 bg-sidebar-foreground/10 px-2.5 text-[13px]" : "h-9 px-0 py-0 text-sm font-medium"}`} aria-label={t("layout.chooseOrganizationToView")}>
              <option value="">{t("layout.chooseOrganization")}</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </Select>
          </label>
          {selectedOrganizationName ? <p className="mt-1 truncate text-[11px] text-sidebar-foreground/40">{t("layout.scopedTo", { name: selectedOrganizationName })}</p> : <p className="mt-1 text-[11px] text-sidebar-foreground/40">{t("layout.orgRequired")}</p>}
        </div>
      ) : null}

      <nav className={`space-y-1.5 ${mobile ? "mt-4" : "mt-8"}`}>
        {mobile ? <p className="px-3 text-[9px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/35">{t("common.primary")}</p> : null}
        <NavLinkItem to="/dashboard" icon={<BarChart3 size={18} />} label={t("nav.dashboard")} onClick={onNavigate} compact={mobile} />
        {showInbox ? (
          <SidebarNavGroup
            icon={<MessageSquare size={18} />}
            label={t("nav.inbox")}
            items={[
              { to: "/inbox", icon: <MessageSquare size={16} />, label: t("nav.allInbox") },
              { to: "/inbox/whatsapp", icon: <SocialChannelBrandLogo channel="whatsapp" className="h-4 w-4" />, label: t("nav.whatsapp") },
              { to: "/inbox/facebook", icon: <SocialChannelBrandLogo channel="facebook" className="h-4 w-4" />, label: t("nav.facebookMessenger"), badge: <ModuleBadge tone="primary">{t("common.soon")}</ModuleBadge> },
              { to: "/inbox/instagram", icon: <SocialChannelBrandLogo channel="instagram" className="h-4 w-4" />, label: t("nav.instagramMessenger"), badge: <ModuleBadge tone="primary">{t("common.soon")}</ModuleBadge> },
              { to: "/inbox/ecommerce", icon: <ShoppingBag size={16} />, label: t("nav.ecommerceDm"), badge: <ModuleBadge tone="primary">{t("common.soon")}</ModuleBadge> },
              { to: "/inbox/replies", icon: <Settings2 size={16} />, label: t("nav.templateLibrary") }
            ]}
            onNavigate={onNavigate}
            compact={mobile}
          />
        ) : null}
        {showSales ? <NavLinkItem to="/sales" icon={<TrendingUp size={18} />} label={t("nav.sales")} onClick={onNavigate} compact={mobile} /> : null}
        {mobile ? <p className="px-3 pt-3 text-[9px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/35">{t("common.workspace")}</p> : null}
        {showCrm ? (
          <SidebarNavGroup
            icon={<Users size={18} />}
            label={t("nav.crm")}
            items={[
              { to: "/contacts", icon: <Users size={16} />, label: t("nav.contacts") },
              ...(showContactReliability ? [{ to: "/contacts/reliability", icon: <ShieldCheck size={16} />, label: t("nav.contactReliability") }] : []),
              { to: "/reports", icon: <FileBarChart size={16} />, label: t("nav.report") },
              ...(showDataExport ? [{ to: "/exports", icon: <Download size={16} />, label: t("nav.dataExport") }] : [])
            ]}
            onNavigate={onNavigate}
            compact={mobile}
          />
        ) : null}
        {showCampaigns ? (
          <SidebarNavGroup
            icon={<Megaphone size={18} />}
            label={t("nav.campaign")}
            items={[
              { to: "/campaigns/whatsapp", icon: <Megaphone size={16} />, label: t("nav.whatsapp"), badge: whatsappCampaignBadge, end: false },
              { to: "/campaigns/email", icon: <Mail size={16} />, label: t("nav.email"), badge: emailCampaignBadge, end: false }
            ]}
            onNavigate={onNavigate}
            compact={mobile}
          />
        ) : null}
        <SidebarNavGroup
          icon={<Settings2 size={18} />}
          label={t("nav.setup")}
          items={[
            { to: "/setup", icon: <Settings2 size={16} />, label: t("nav.general") },
            { to: "/setup/channels", icon: <PlugZap size={16} />, label: t("nav.channels") }
          ]}
          onNavigate={onNavigate}
          compact={mobile}
        />
        {isSuperAdmin ? (
          <>
            {mobile ? <p className="px-3 pt-3 text-[9px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/35">{t("common.admin")}</p> : null}
          <SidebarNavGroup
            icon={<Workflow size={18} />}
            label={t("nav.superAdminMap")}
            items={[
              { to: "/super-admin-map", icon: <Workflow size={16} />, label: t("nav.platformWorkflow") },
              { to: "/super-admin-map/data-structure", icon: <Building2 size={16} />, label: t("nav.dataStructure") },
              { to: "/super-admin-map/organization-structure", icon: <Users size={16} />, label: t("nav.orgUserStructure") }
            ]}
            onNavigate={onNavigate}
            compact={mobile}
          />
            <NavLinkItem to="/platform" icon={<Building2 size={18} />} label={t("nav.platform")} onClick={onNavigate} compact={mobile} />
          <SidebarNavGroup
            icon={<ShieldAlert size={18} />}
            label={t("nav.systemTools")}
            items={[
              { to: "/super-admin/access-limits", icon: <SlidersHorizontal size={16} />, label: t("nav.accessLimits") },
              { to: "/super-admin/ops-center", icon: <Activity size={16} />, label: t("nav.opsCenter") },
              { to: "/super-admin/clear-organization-data", icon: <ShieldAlert size={16} />, label: t("nav.clearOrgData") },
              { to: "/super-admin/audit-logs", icon: <FileBarChart size={16} />, label: t("nav.auditLogs") }
            ]}
            onNavigate={onNavigate}
            compact={mobile}
          />
          </>
        ) : null}
      </nav>
    </>
  );
}

export function DashboardLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobileViewport();
  const mobileNavTriggerRef = useRef<HTMLButtonElement | null>(null);
  const desktopSidebarRef = useRef<HTMLElement | null>(null);
  const wasMobileNavOpenRef = useRef(false);
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
  const selectedOrganizationName = isSuperAdmin
    ? organizations.find((organization) => organization.id === selectedOrganizationId)?.name ?? null
    : user?.organizationName ?? null;
  const { data: campaignsModuleStatus } = useCampaignsModuleStatus(null, user?.role === "org_admin");
  const { data: campaignWhatsAppModuleStatus } = useCampaignWhatsAppModuleStatus(null, user?.role === "org_admin");
  const { data: campaignEmailModuleStatus } = useCampaignEmailModuleStatus(null, user?.role === "org_admin");
  const shouldCheckOrganizationModules = Boolean(user && user.role !== "super_admin");
  const { data: inboxModuleStatus } = useInboxModuleStatus(null, shouldCheckOrganizationModules);
  const { data: crmModuleStatus } = useCrmModuleStatus(null, shouldCheckOrganizationModules);
  const { data: salesModuleStatus } = useSalesModuleStatus(null, shouldCheckOrganizationModules);
  const showCampaigns = canAccessCampaigns({
    role: user?.role,
    parentModuleEnabled: isSuperAdmin ? true : campaignsModuleStatus?.isEnabled === true
  });
  const showInbox = isSuperAdmin || inboxModuleStatus?.isEnabled === true;
  const showCrm = isSuperAdmin || crmModuleStatus?.isEnabled === true;
  const showSales = isSuperAdmin || salesModuleStatus?.isEnabled === true;
  const whatsappCampaignBadge = !showCampaigns
    ? null
    : isSuperAdmin || campaignWhatsAppModuleStatus?.isEnabled === true
      ? null
      : <ModuleBadge>{t("common.off")}</ModuleBadge>;
  const emailCampaignBadge = !showCampaigns
    ? null
    : campaignEmailModuleStatus?.isEnabled === true
      ? null
      : <ModuleBadge>{t("common.off")}</ModuleBadge>;
  const showDataExport = user?.role === "super_admin" || user?.role === "org_admin";
  const showContactReliability = user?.role === "super_admin" || user?.role === "org_admin" || user?.role === "manager";
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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [mobileNavSectionId, setMobileNavSectionId] = useState<string | null>(null);
  const [isMobileSecondTierVisible, setIsMobileSecondTierVisible] = useState(false);
  const [isDesktopNavCollapsed, setIsDesktopNavCollapsed] = useState(true);

  const navSections: SidebarSection[] = [
    {
      id: "dashboard",
      label: t("nav.dashboard"),
      icon: <BarChart3 size={18} />,
      items: [{ to: "/dashboard", icon: <BarChart3 size={16} />, label: t("nav.overview") }]
    },
    ...(showInbox
      ? [
          {
            id: "inbox",
            label: t("nav.inbox"),
            icon: <MessageSquare size={18} />,
            items: [
              { to: "/inbox", icon: <MessageSquare size={16} />, label: t("nav.allInbox") },
              { to: "/inbox/whatsapp", icon: <SocialChannelBrandLogo channel="whatsapp" className="h-4 w-4" />, label: t("nav.whatsapp") },
              { to: "/inbox/facebook", icon: <SocialChannelBrandLogo channel="facebook" className="h-4 w-4" />, label: t("nav.facebookMessenger"), badge: <ModuleBadge tone="primary">{t("common.soon")}</ModuleBadge> },
              { to: "/inbox/instagram", icon: <SocialChannelBrandLogo channel="instagram" className="h-4 w-4" />, label: t("nav.instagramMessenger"), badge: <ModuleBadge tone="primary">{t("common.soon")}</ModuleBadge> },
              { to: "/inbox/ecommerce", icon: <ShoppingBag size={16} />, label: t("nav.ecommerceDm"), badge: <ModuleBadge tone="primary">{t("common.soon")}</ModuleBadge> },
              { to: "/inbox/replies", icon: <Settings2 size={16} />, label: t("nav.templateLibrary") }
            ]
          }
        ]
      : []),
    ...(showSales
      ? [
          {
            id: "sales",
            label: t("nav.sales"),
            icon: <TrendingUp size={18} />,
            items: [{ to: "/sales", icon: <TrendingUp size={16} />, label: t("nav.salesPipeline") }]
          }
        ]
      : []),
    ...(showCrm
      ? [
          {
            id: "crm",
            label: t("nav.crm"),
            icon: <Users size={18} />,
            items: [
              { to: "/contacts", icon: <Users size={16} />, label: t("nav.contacts") },
              ...(showContactReliability ? [{ to: "/contacts/reliability", icon: <ShieldCheck size={16} />, label: t("nav.contactReliability") }] : []),
              { to: "/reports", icon: <FileBarChart size={16} />, label: t("nav.reports") },
              ...(showDataExport ? [{ to: "/exports", icon: <Download size={16} />, label: t("nav.dataExport") }] : [])
            ]
          }
        ]
      : []),
    ...(showCampaigns
      ? [
          {
            id: "campaigns",
            label: t("nav.campaign"),
            icon: <Megaphone size={18} />,
            items: [
              { to: "/campaigns/whatsapp", icon: <Megaphone size={16} />, label: t("nav.whatsapp"), badge: whatsappCampaignBadge, end: false },
              { to: "/campaigns/email", icon: <Mail size={16} />, label: t("nav.email"), badge: emailCampaignBadge, end: false }
            ]
          }
        ]
      : []),
    {
      id: "setup",
      label: t("nav.setup"),
      icon: <Settings2 size={18} />,
      items: [
        { to: "/setup", icon: <Settings2 size={16} />, label: t("nav.general") },
        { to: "/setup/channels", icon: <PlugZap size={16} />, label: t("nav.channels") }
      ]
    },
    ...(isSuperAdmin
      ? [
          {
            id: "admin-map",
            label: t("nav.superAdminMap"),
            icon: <Workflow size={18} />,
            items: [
              { to: "/super-admin-map", icon: <Workflow size={16} />, label: t("nav.platformWorkflow") },
              { to: "/super-admin-map/data-structure", icon: <Building2 size={16} />, label: t("nav.dataStructure") },
              { to: "/super-admin-map/organization-structure", icon: <Users size={16} />, label: t("nav.orgUserStructure") }
            ]
          },
          {
            id: "platform",
            label: t("nav.platform"),
            icon: <Building2 size={18} />,
            items: [{ to: "/platform", icon: <Building2 size={16} />, label: t("nav.organizations") }]
          },
          {
            id: "system",
            label: t("nav.systemTools"),
            icon: <ShieldAlert size={18} />,
            items: [
              { to: "/super-admin/access-limits", icon: <SlidersHorizontal size={16} />, label: t("nav.accessLimits") },
              { to: "/super-admin/ops-center", icon: <Activity size={16} />, label: t("nav.opsCenter") },
              { to: "/super-admin/clear-organization-data", icon: <ShieldAlert size={16} />, label: t("nav.clearOrgData") },
              { to: "/super-admin/audit-logs", icon: <FileBarChart size={16} />, label: t("nav.auditLogs") }
            ]
          }
        ]
      : [])
  ];

  const activeNavSection = navSections.find((section) =>
    section.items.some((item) => (item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)))
  ) ?? navSections[0];
  const mobileNavSection = navSections.find((section) => section.id === mobileNavSectionId) ?? activeNavSection;

  useEffect(() => {
    function handleStoredUserUpdate() {
      setUser(getStoredUser());
    }

    window.addEventListener("crm_auth_user_updated", handleStoredUserUpdate);
    return () => window.removeEventListener("crm_auth_user_updated", handleStoredUserUpdate);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    fetchMe().catch(() => {
      // Keep the existing stored session if profile refresh fails.
    });
  }, [user?.id]);

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

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobile) {
      setIsMobileNavOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }

    setMobileNavSectionId(activeNavSection.id);
    setIsMobileSecondTierVisible(false);
  }, [activeNavSection.id, isMobileNavOpen]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (wasMobileNavOpenRef.current && !isMobileNavOpen) {
      mobileNavTriggerRef.current?.focus();
    }

    wasMobileNavOpenRef.current = isMobileNavOpen;
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (isMobile || isDesktopNavCollapsed) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const sidebarElement = desktopSidebarRef.current;

      if (!sidebarElement || sidebarElement.contains(event.target as Node)) {
        return;
      }

      setIsDesktopNavCollapsed(true);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isDesktopNavCollapsed, isMobile]);

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordNotice(null);

    if (newPassword !== confirmPassword) {
      setPasswordNotice(t("profile.passwordMismatch"));
      return;
    }

    setIsUpdatingPassword(true);

    try {
      await updateMyPassword({ password: newPassword });
      setNewPassword("");
      setConfirmPassword("");
      setIsPasswordFormOpen(false);
      setPasswordNotice(t("profile.passwordUpdated"));
    } catch (error) {
      setPasswordNotice(error instanceof Error ? error.message : t("profile.passwordUpdateFailed"));
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
      setProfileNotice(t("profile.imageTypeError"));
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PROFILE_PICTURE_BYTES) {
      setProfileNotice(t("profile.imageSizeError"));
      event.target.value = "";
      return;
    }

    try {
      setProfileAvatarUrl(await readProfilePicture(file));
      setProfileNotice(null);
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : t("profile.imageReadError"));
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
      setProfileNotice(t("profile.profileUpdated"));
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : t("profile.profileUpdateFailed"));
    } finally {
      setIsUpdatingProfile(false);
    }
  }

  return (
    <div className="dashboard-shell min-h-screen overflow-x-clip bg-hero-grid px-0 pb-0 pt-12 md:pt-12">
      <header className="dashboard-topbar app-topbar fixed inset-x-0 top-0 z-[100] border-b border-border shadow-soft">
        <div className="mx-auto flex h-12 max-w-[1880px] items-center justify-between gap-3 px-3 md:px-6">
          <div className="topbar-chip flex min-w-0 items-center gap-2 rounded-xl px-3 py-1.5">
            <button
              type="button"
              ref={mobileNavTriggerRef}
              className="topbar-profile-trigger inline-flex h-8 w-8 items-center justify-center rounded-lg border px-0 md:hidden"
              aria-label={isMobileNavOpen ? t("layout.closeNavigation") : t("layout.openNavigation")}
              aria-expanded={isMobileNavOpen}
              onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
            >
              <Menu size={16} />
            </button>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success shadow-[0_0_18px_rgb(var(--success)/0.45)]" />
            <span className="topbar-brand truncate text-[11px] font-semibold uppercase tracking-[0.22em]">Rezeki CRM</span>
            {selectedOrganizationName ? <span className="topbar-scope hidden truncate text-xs sm:inline">/ {selectedOrganizationName}</span> : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher compact />
            <NotificationBell />
            <button
              type="button"
              className="topbar-profile-trigger inline-flex h-8 max-w-[15rem] items-center gap-2 rounded-xl border px-2.5 text-xs font-semibold transition duration-200"
              aria-label={t("layout.openProfilePanel")}
              aria-expanded={isProfilePanelOpen}
              onClick={() => setIsProfilePanelOpen((isOpen) => !isOpen)}
            >
              <UserAvatar src={user?.avatarUrl} name={user?.fullName ?? user?.email ?? null} />
              <span className="hidden min-w-0 truncate sm:inline">{user?.fullName ?? user?.email ?? t("profile.title")}</span>
            </button>
          </div>
        </div>
      </header>

      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" aria-hidden={!isMobileNavOpen}>
          <button
            type="button"
            className="absolute inset-0 bg-background/40 backdrop-blur-md backdrop-saturate-150"
            aria-label={t("layout.closeNavigation")}
            onClick={() => setIsMobileNavOpen(false)}
          />
          <motion.aside
            className="absolute inset-y-12 left-0 overflow-hidden pr-3"
            initial={false}
            animate={{
              width: isMobileSecondTierVisible ? "min(calc(100vw - 0.875rem), 28rem)" : "5.75rem"
            }}
            transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.9 }}
          >
            <Card className="app-shell dashboard-sidebar dashboard-sidebar--two-tier flex h-full flex-row overflow-hidden rounded-r-[1.75rem] border-y-0 border-l-0 p-0 shadow-[0_18px_45px_rgb(8_15_27_/_0.28)]" elevated>
              <nav className="sidebar-icon-rail flex w-[4.25rem] shrink-0 flex-col items-center gap-1 border-r border-sidebar-foreground/10 px-2 py-3" aria-label={t("nav.mobilePrimaryNavigation")}>
                <div className="mb-2 flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-sidebar-foreground/10 bg-sidebar-foreground/10">
                  <img src={brandLogoMobile} alt="Rezeki CRM" className="h-full w-full object-cover" />
                </div>
                {navSections.map((section) => {
                  const isActive = section.id === activeNavSection.id;
                  const isSelected = section.id === mobileNavSection.id;

                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={clsx(
                        "sidebar-rail-button group relative flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground/62 transition duration-200 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
                        isSelected || isActive ? "bg-sidebar-foreground/12 text-sidebar-foreground hover:bg-sidebar-foreground/12" : null
                      )}
                      aria-label={section.label}
                      aria-current={isActive ? "page" : undefined}
                      title={section.label}
                      onClick={() => {
                        const isSameSection = mobileNavSection.id === section.id;

                        if (isSameSection) {
                          setIsMobileSecondTierVisible((current) => !current);
                          return;
                        }

                        setMobileNavSectionId(section.id);
                        setIsMobileSecondTierVisible(true);
                      }}
                    >
                      {section.icon}
                      {isSelected || isActive ? <span className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" /> : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="mt-auto flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground/60 transition duration-200 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                  aria-label={t("layout.closeNavigation")}
                  onClick={() => setIsMobileNavOpen(false)}
                >
                  <X size={16} />
                </button>
              </nav>

              <motion.div
                className="sidebar-context-panel min-w-0 flex-1 overflow-y-auto px-4 py-4"
                initial={false}
                animate={{
                  x: isMobileSecondTierVisible ? 0 : 28,
                  opacity: isMobileSecondTierVisible ? 1 : 0,
                  scale: isMobileSecondTierVisible ? 1 : 0.985
                }}
                transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.85 }}
                style={{ pointerEvents: isMobileSecondTierVisible ? "auto" : "none" }}
                aria-hidden={!isMobileSecondTierVisible}
              >
                <div className="flex items-start justify-between gap-3 border-b border-sidebar-foreground/10 pb-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/35">{mobileNavSection.label}</p>
                    <h2 className="mt-1 truncate text-base font-semibold text-sidebar-foreground">{selectedOrganizationName ?? t("layout.operationsWorkspace")}</h2>
                    <p className="mt-1 truncate text-[11px] text-sidebar-foreground/45">{mobileNavSection.items.length === 1 ? mobileNavSection.items[0]?.label : t("layout.destinations", { count: mobileNavSection.items.length })}</p>
                  </div>
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-foreground/10 bg-sidebar-foreground/5 text-sidebar-foreground/60 transition duration-200 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                    aria-label={t("layout.hideNavigationDetails")}
                    onClick={() => setIsMobileSecondTierVisible(false)}
                  >
                    <ChevronsLeft size={15} />
                  </button>
                </div>

                {!isSuperAdmin ? (
                  <div className="mt-4 rounded-[1rem] border border-sidebar-foreground/10 bg-sidebar-foreground/5 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/42">{t("common.workspace")}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-sidebar-foreground">{selectedOrganizationName ?? t("layout.whatsappWorkspace")}</p>
                    <p className="mt-1 text-[11px] text-sidebar-foreground/48">{t("layout.switchModules")}</p>
                  </div>
                ) : null}

                {isSuperAdmin ? (
                  <div className="mt-4 rounded-[1rem] border border-sidebar-foreground/10 bg-sidebar-foreground/5 px-3 py-3">
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">{t("layout.currentOrg")}</span>
                      <Select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)} className="sidebar-org-select mt-1.5 h-8 rounded-lg border border-sidebar-foreground/10 bg-sidebar-foreground/10 px-2.5 text-[13px]" aria-label={t("layout.chooseOrganizationToView")}>
                        <option value="">{t("layout.chooseOrganization")}</option>
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>{organization.name}</option>
                        ))}
                      </Select>
                    </label>
                    {selectedOrganizationName ? <p className="mt-1 truncate text-[11px] text-sidebar-foreground/40">{t("layout.scopedTo", { name: selectedOrganizationName })}</p> : <p className="mt-1 text-[11px] text-sidebar-foreground/40">{t("layout.orgRequired")}</p>}
                  </div>
                ) : null}

                <nav className="mt-4 space-y-1.5" aria-label={`${mobileNavSection.label} navigation`}>
                  {mobileNavSection.items.map((item) => (
                    <NavLinkItem
                      key={item.to}
                      to={item.to}
                      icon={item.icon}
                      label={item.label}
                      badge={item.badge}
                      variant="sub"
                      end={item.end}
                      onClick={() => setIsMobileNavOpen(false)}
                      compact
                    />
                  ))}
                </nav>
              </motion.div>
            </Card>
          </motion.aside>
        </div>
      ) : null}

      <PopupOverlay
        open={isProfilePanelOpen}
        onClose={() => setIsProfilePanelOpen(false)}
        title={t("profile.title")}
        description={t("profile.description")}
        panelClassName="max-w-[min(36rem,calc(100vw-2rem))]"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <UserAvatar src={user?.avatarUrl} name={user?.fullName ?? user?.email ?? null} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{user?.fullName ?? user?.email ?? t("profile.authenticatedUser")}</p>
              <p className="mt-0.5 truncate text-xs text-text-muted">{user?.email ?? user?.role ?? "user"}</p>
              {user?.organizationName ? (
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
                  <Building2 size={13} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{user.organizationName}</span>
                </p>
              ) : null}
              {user?.phone && <p className="mt-0.5 truncate text-xs text-text-muted">{user.phone}</p>}
              {user?.address && <p className="mt-0.5 truncate text-xs text-text-muted">{user.address}</p>}
              <p className="mt-2 inline-flex border border-border bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {user?.role ?? "user"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              className="col-span-2 border border-border bg-muted px-3 py-2 text-foreground hover:bg-card hover:text-foreground"
              aria-label={t("profile.editMyProfile")}
              disabled={isUpdatingProfile}
              onClick={() => {
                setIsProfileFormOpen((isOpen) => !isOpen);
                setIsPasswordFormOpen(false);
                setProfileNotice(null);
              }}
            >
              <UserCircle size={15} />
              <span className="ml-2">{t("profile.editProfile")}</span>
            </Button>
            <Button
              variant="ghost"
              className="border border-border bg-muted px-3 py-2 text-foreground hover:bg-card hover:text-foreground"
              aria-label={t("profile.resetMyPassword")}
              disabled={isUpdatingPassword}
              onClick={() => {
                setIsPasswordFormOpen((isOpen) => !isOpen);
                setIsProfileFormOpen(false);
                setPasswordNotice(null);
                setConfirmPassword("");
              }}
            >
              <KeyRound size={15} />
              <span className="ml-2">{t("common.password")}</span>
            </Button>
            <Button
              onClick={async () => {
                try {
                  await logout();
                } finally {
                  clearAuthSession();
                  navigate("/login", { replace: true });
                }
              }}
              variant="secondary"
              className="border-border bg-card px-3 py-2 text-foreground hover:bg-muted"
              aria-label={t("common.signOut")}
            >
              <LogOut size={15} />
              <span className="ml-2">{t("common.signOut")}</span>
            </Button>
          </div>

          {isProfileFormOpen ? (
            <form className="space-y-3" onSubmit={handleUpdateProfile}>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted p-3">
                <UserAvatar src={profileAvatarUrl} name={profileFullName || user?.email || null} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("profile.profilePicture")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted">
                      {t("common.upload")}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={handleProfilePictureChange} />
                    </label>
                    {profileAvatarUrl ? (
                      <Button
                        variant="ghost"
                        className="border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
                        disabled={isUpdatingProfile}
                        onClick={() => setProfileAvatarUrl(null)}
                      >
                        {t("common.remove")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <Input value={profileFullName} onChange={(event) => setProfileFullName(event.target.value)} placeholder={t("common.fullName")} aria-label={t("common.fullName")} className="border-border bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground" />
              <Input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} placeholder={t("common.phoneNumber")} aria-label={t("common.phoneNumber")} className="border-border bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground" />
              <Input value={profileAddress} onChange={(event) => setProfileAddress(event.target.value)} placeholder={t("common.address")} aria-label={t("common.address")} className="border-border bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground" />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 px-3 py-2" disabled={isUpdatingProfile}>{t("profile.saveProfile")}</Button>
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
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : null}
          {profileNotice ? <p className="text-xs text-destructive">{profileNotice}</p> : null}

          {isPasswordFormOpen ? (
            <form className="space-y-2" onSubmit={handleUpdatePassword}>
              <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={t("profile.newPassword")} aria-label={t("profile.newPassword")} className="border-border bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground" minLength={8} required />
              <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t("profile.confirmPassword")} aria-label={t("profile.confirmNewPassword")} className="border-border bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground" minLength={8} required />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 px-3 py-2" aria-label={t("profile.savePassword")} disabled={isUpdatingPassword}><Check size={16} /></Button>
                <Button
                  variant="secondary"
                  className="flex-1 px-3 py-2"
                  aria-label={t("profile.cancelPasswordReset")}
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
          {passwordNotice ? <p className="text-xs text-destructive">{passwordNotice}</p> : null}
        </div>
      </PopupOverlay>

      <div
        className={clsx(
          "dashboard-content dashboard-content--with-sidebar grid min-h-[calc(100vh-3rem)] min-w-0 max-w-none items-start gap-0 md:min-h-[calc(100vh-3rem)] md:gap-0",
          isDesktopNavCollapsed ? "dashboard-content--sidebar-collapsed" : "dashboard-content--sidebar-expanded"
        )}
      >
        <motion.aside ref={desktopSidebarRef} className="dashboard-sidebar-sticky hidden min-w-0 self-start md:block md:h-[calc(100dvh-3rem)]" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
          <Card className="app-shell dashboard-sidebar dashboard-sidebar--two-tier flex flex-row overflow-hidden p-0" elevated>
            <nav className="sidebar-icon-rail flex w-16 shrink-0 flex-col items-center gap-1 border-r border-sidebar-foreground/10 px-2 py-3" aria-label="Primary navigation">
              {navSections.map((section) => {
                const isActive = section.id === activeNavSection.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    className={clsx(
                      "sidebar-rail-button group relative flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground/62 transition duration-200 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
                      isActive && "bg-sidebar-foreground/12 text-sidebar-foreground hover:bg-sidebar-foreground/12"
                    )}
                    aria-label={section.label}
                    aria-current={isActive ? "page" : undefined}
                    title={section.label}
                    onClick={() => {
                      if (!isDesktopNavCollapsed && isActive) {
                        setIsDesktopNavCollapsed(true);
                        return;
                      }

                      setIsDesktopNavCollapsed(false);
                      const firstItem = section.items[0];
                      if (firstItem && !location.pathname.startsWith(firstItem.to)) {
                        navigate(firstItem.to);
                      }
                    }}
                  >
                    {section.icon}
                    {isActive ? <span className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" /> : null}
                  </button>
                );
              })}
              <button
                type="button"
                className="mt-auto flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground/60 transition duration-200 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                aria-label={isDesktopNavCollapsed ? t("layout.expandSidebar") : t("layout.collapseSidebar")}
                title={isDesktopNavCollapsed ? t("layout.expandSidebar") : t("layout.collapseSidebar")}
                onClick={() => setIsDesktopNavCollapsed((current) => !current)}
              >
                {isDesktopNavCollapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
              </button>
            </nav>

              <div
                className={clsx(
                  "sidebar-context-panel min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 transition-[opacity,transform,padding,width] duration-300 ease-out",
                  isDesktopNavCollapsed
                    ? "w-0 -translate-x-2 px-0 opacity-0"
                    : "w-[13rem] translate-x-0 opacity-100 xl:w-[14rem]"
                )}
                aria-hidden={isDesktopNavCollapsed}
              >
                <div className="border-b border-sidebar-foreground/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sidebar-foreground/10 bg-sidebar-foreground/10">
                      <img src={brandLogoMobile} alt="Rezeki CRM" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/42">Rezeki CRM</p>
                      <p className="mt-1 truncate text-sm font-semibold text-sidebar-foreground">{selectedOrganizationName ?? t("layout.operationsWorkspace")}</p>
                    </div>
                  </div>
                </div>

                {isSuperAdmin ? (
                  <div className="mt-4">
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">{t("layout.viewingOrg")}</span>
                      <Select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)} className="sidebar-org-select mt-1.5 h-9 px-0 py-0 text-sm font-medium" aria-label={t("layout.chooseOrganizationToView")}>
                        <option value="">{t("layout.chooseOrganization")}</option>
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>{organization.name}</option>
                        ))}
                      </Select>
                    </label>
                    {selectedOrganizationName ? <p className="mt-1 truncate text-[11px] text-sidebar-foreground/40">{t("layout.scopedTo", { name: selectedOrganizationName })}</p> : <p className="mt-1 text-[11px] text-sidebar-foreground/40">{t("layout.orgRequired")}</p>}
                  </div>
                ) : null}

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/35">{t("common.module")}</p>
                      <h2 className="mt-1 truncate text-base font-semibold text-sidebar-foreground">{activeNavSection.label}</h2>
                    </div>
                    <button
                      type="button"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/58 transition duration-200 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                      aria-label={t("layout.collapseSidebar")}
                      onClick={() => setIsDesktopNavCollapsed(true)}
                    >
                      <ChevronsLeft size={16} />
                    </button>
                  </div>
                  <nav className="mt-3 space-y-1.5" aria-label={`${activeNavSection.label} navigation`}>
                    {activeNavSection.items.map((item) => (
                      <NavLinkItem
                        key={item.to}
                        to={item.to}
                        icon={item.icon}
                        label={item.label}
                        badge={item.badge}
                        variant="sub"
                        end={item.end}
                      />
                    ))}
                  </nav>
                </div>
              </div>
          </Card>
        </motion.aside>
        <main className="min-w-0 bg-transparent px-3 pb-4 pt-12 md:px-4 md:pt-4 xl:px-5">
          <RouteTransition className="route-transition-stage">
            <Outlet context={{ isSuperAdmin, selectedOrganizationId, selectedOrganizationName, setSelectedOrganizationId } satisfies DashboardOutletContext} />
          </RouteTransition>
        </main>
      </div>
    </div>
  );
}
