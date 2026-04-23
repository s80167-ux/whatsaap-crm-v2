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
          "flex items-center gap-3 rounded-none px-4 py-3 text-sm font-medium transition duration-200",
          isActive
            ? "bg-primary/90 text-white shadow-soft"
            : "text-white/75 hover:bg-white/10 hover:text-white"
        )
      }
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-sm text-current">{icon}</span>
      <span>{label}</span>
      {badge ? <span className="ml-auto">{badge}</span> : null}
    </NavLink>
  );
}
