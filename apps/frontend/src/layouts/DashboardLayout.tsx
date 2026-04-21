import { BarChart3, Building2, MessageSquare, Settings2, TrendingUp, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import brandLogo from "../../asset/rezeki_dashboard_logo_glass.png";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { NavLinkItem } from "../components/NavLinkItem";
import { clearAuthSession, getStoredUser } from "../lib/auth";

export function DashboardLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="min-h-screen bg-hero-grid px-6 py-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1880px] gap-6 md:grid-cols-[280px,1fr]">
        <motion.aside initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
          <Card className="app-shell flex h-full flex-col rounded-2xl p-6" elevated>
            <div>
              <div className="rounded-xl border border-border bg-white p-4">
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
              <NavLinkItem to="/" icon={<MessageSquare size={18} />} label="Inbox" />
              <NavLinkItem to="/contacts" icon={<Users size={18} />} label="Contacts" />
              <NavLinkItem to="/sales" icon={<TrendingUp size={18} />} label="Sales" />
              <NavLinkItem to="/setup" icon={<Settings2 size={18} />} label="Setup" />
              {isSuperAdmin ? <NavLinkItem to="/platform" icon={<Building2 size={18} />} label="Platform" /> : null}
            </nav>

            <div className="mt-auto rounded-xl border border-border bg-background-tint p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-soft">Current user</p>
              <p className="mt-2 text-sm font-semibold text-text">{user?.fullName ?? user?.email ?? "Authenticated user"}</p>
              <p className="mt-1 text-sm text-text-muted">{user?.role ?? "user"}</p>
              <Button
                onClick={() => {
                  clearAuthSession();
                  navigate("/login", { replace: true });
                }}
                variant="secondary"
                className="mt-4 w-full justify-center"
              >
                Sign out
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
