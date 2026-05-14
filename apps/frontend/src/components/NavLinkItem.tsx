import { NavLink } from "react-router-dom";
import clsx from "clsx";
import type { ReactNode } from "react";

type NavLinkItemProps = {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: ReactNode;
  variant?: "default" | "sub";
  onClick?: () => void;
  compact?: boolean;
};

export function NavLinkItem({ to, icon, label, badge, variant = "default", onClick, compact = false }: NavLinkItemProps) {
  const showStackedBadge = variant === "sub" && Boolean(badge);

  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          "flex min-w-0 items-center gap-3 text-sm font-medium transition duration-200",
          variant === "sub"
            ? compact
              ? "ml-2 px-2.5 py-2 pl-2.5 text-[13px]"
              : "ml-3 px-3 py-2.5 pl-3"
            : compact
              ? "px-3 py-2.5 text-[13px]"
              : "px-4 py-3.5",
          isActive
            ? "rounded-xl bg-sidebar-foreground text-foreground shadow-panel"
            : "rounded-xl text-sidebar-foreground/72 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
        )
      }
    >
      <span
        className={clsx(
          "flex items-center justify-center rounded-lg text-current",
          variant === "sub" ? (compact ? "h-6 w-6" : "h-7 w-7") : compact ? "h-7 w-7" : "h-8 w-8"
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
