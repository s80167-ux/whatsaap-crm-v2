import { MessageSquare, Users, Settings2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { NavLinkItem } from "../components/NavLinkItem";
import { clearAuthSession, getStoredUser } from "../lib/auth";

export function DashboardLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();

  return (
    <div className="min-h-screen bg-hero-grid px-6 py-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] gap-6 md:grid-cols-[280px,1fr]">
        <motion.aside initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
          <Card className="app-shell flex h-full flex-col rounded-2xl p-6" elevated>
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <p className="text-xl font-semibold tracking-tight text-text">WA CRM</p>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Pro</p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-text-muted">
                Multi-account inbox built on canonical contacts, deterministic conversations, and realtime updates.
              </p>
            </div>

            <nav className="mt-8 space-y-2">
              <NavLinkItem to="/" icon={<MessageSquare size={18} />} label="Inbox" />
              <NavLinkItem to="/contacts" icon={<Users size={18} />} label="Contacts" />
              <NavLinkItem to="/setup" icon={<Settings2 size={18} />} label="Setup" />
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
        <main className="rounded-2xl bg-transparent px-6 py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
