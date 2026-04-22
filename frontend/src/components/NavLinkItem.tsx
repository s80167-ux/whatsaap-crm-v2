import { NavLink } from "react-router-dom";
import clsx from "clsx";
import type { ReactNode } from "react";

export function NavLinkItem({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition duration-200",
          isActive
            ? "border border-primary/20 bg-primary-soft/70 text-text"
            : "text-text-muted hover:bg-secondary-soft/50 hover:text-text"
        )
      }
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md text-current">{icon}</span>
      <span className="flex items-center gap-1">{label}{badge}</span>
    </NavLink>
  );
}
