import { NavLink } from "react-router-dom";
import clsx from "clsx";
import type { ReactNode } from "react";

type NavLinkItemProps = {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: ReactNode;
  variant?: "default" | "sub";
};

export function NavLinkItem({ to, icon, label, badge, variant = "default" }: NavLinkItemProps) {
  const showStackedBadge = variant === "sub" && Boolean(badge);

  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        clsx(
          "flex min-w-0 items-center gap-3 rounded-none text-sm font-medium transition duration-200",
          variant === "sub" ? "ml-4 border-l border-white/10 px-3 py-2.5 pl-4" : "px-4 py-3",
          isActive
            ? "bg-primary/90 text-white shadow-soft"
            : "text-white/75 hover:bg-white/10 hover:text-white"
        )
      }
    >
      <span
        className={clsx(
          "flex items-center justify-center rounded-sm text-current",
          variant === "sub" ? "h-7 w-7" : "h-8 w-8"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block min-w-0 pr-2 leading-tight">{label}</span>
        {showStackedBadge ? <span className="mt-1 flex items-center">{badge}</span> : null}
      </span>
      {!showStackedBadge && badge ? <span className="ml-auto shrink-0 pl-1">{badge}</span> : null}
    </NavLink>
  );
}
