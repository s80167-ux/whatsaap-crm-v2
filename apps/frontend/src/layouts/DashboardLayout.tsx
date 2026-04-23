import {
  BarChart3,
  Building2,
  Check,
  FileBarChart,
  KeyRound,
  LogOut,
  MessageSquare,
  Settings2,
  TrendingUp,
  Users,
  Workflow,
  X
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import brandLogo from "../../asset/rezeki_dashboard_logo_glass.png";
import { updateMyPassword } from "../api/auth";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { NavLinkItem } from "../components/NavLinkItem";
import { WhatsAppConnectionsBadge } from "../components/WhatsAppConnectionsBadge";
import { useWhatsAppAccounts } from "../hooks/useAdmin";
import { clearAuthSession, getStoredUser } from "../lib/auth";

export function DashboardLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const isSuperAdmin = user?.role === "super_admin";
  const organizationId = user?.organizationId ?? null;
  const { data: whatsappAccounts = [] } = useWhatsAppAccounts(organizationId);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  async function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
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

  return (
    <div className="min-h-screen bg-hero-grid px-0 py-0 md:px-6 md:py-4">
      <div className="mx-auto grid min-h-screen max-w-[1880px] gap-0 md:min-h-[calc(100vh-2rem)] md:grid-cols-[280px,1fr] md:gap-6">
        <motion.aside initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
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

            <nav className="mt-8 space-y-2">
              <NavLinkItem to="/dashboard" icon={<BarChart3 size={18} />} label="Dashboard" />
              <NavLinkItem
                to="/"
                icon={<MessageSquare size={18} />}
                label="Inbox"
                badge={<WhatsAppConnectionsBadge accounts={whatsappAccounts} />}
              />
              <NavLinkItem to="/contacts" icon={<Users size={18} />} label="Contacts" />
              <NavLinkItem to="/sales" icon={<TrendingUp size={18} />} label="Sales" />
              <NavLinkItem to="/reports" icon={<FileBarChart size={18} />} label="Report" />
              <NavLinkItem to="/setup" icon={<Settings2 size={18} />} label="Setup" />
              {isSuperAdmin ? <NavLinkItem to="/super-admin-map" icon={<Workflow size={18} />} label="Super Admin Map" /> : null}
              {isSuperAdmin ? <NavLinkItem to="/platform" icon={<Building2 size={18} />} label="Platform" /> : null}
            </nav>

            <div className="user-panel sidebar-user-panel mt-auto rounded-lg border p-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-soft">Current user</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="user-name truncate text-sm font-semibold">{user?.fullName ?? user?.email ?? "Authenticated user"}</p>
                  <p className="mt-0.5 truncate text-xs text-text-muted">{user?.role ?? "user"}</p>
                </div>
                <Button
                  variant="ghost"
                  className="shrink-0 px-2 py-2"
                  aria-label="Reset my password"
                  disabled={isUpdatingPassword}
                  onClick={() => {
                    setIsPasswordFormOpen((isOpen) => !isOpen);
                    setPasswordNotice(null);
                    setConfirmPassword("");
                  }}
                >
                  <KeyRound size={16} />
                </Button>
              </div>
              {isPasswordFormOpen ? (
                <form className="mt-3 space-y-2" onSubmit={handleUpdatePassword}>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password"
                    aria-label="New password"
                    className="sidebar-user-input px-3 py-2"
                    minLength={8}
                    required
                  />
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirm password"
                    aria-label="Confirm new password"
                    className="sidebar-user-input px-3 py-2"
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
              {passwordNotice ? <p className="mt-3 text-xs text-coral">{passwordNotice}</p> : null}
              <Button
                onClick={() => {
                  clearAuthSession();
                  navigate("/login", { replace: true });
                }}
                variant="secondary"
                className="mt-3 w-full justify-center px-3 py-2"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </Button>
            </div>
          </Card>
        </motion.aside>
        <main className="rounded-2xl bg-transparent px-3 py-4 xl:px-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
