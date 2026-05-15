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
  end?: boolean;
};

export function NavLinkItem({ to, icon, label, badge, variant = "default", onClick, compact = false, end }: NavLinkItemProps) {
  const showStackedBadge = variant === "sub" && Boolean(badge);
  const isExactMatch = end ?? (to === "/" || variant === "sub");

  return (
    <NavLink
      to={to}
      end={isExactMatch}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          "relative flex min-w-0 items-center gap-3 text-sm font-medium transition duration-200",
          variant === "sub"
            ? compact
              ? "ml-2 px-2.5 py-2 pl-2.5 text-[13px]"
              : "px-3 py-2.5 pl-3"
            : compact
              ? "px-3 py-2.5 text-[13px]"
              : "px-4 py-3.5",
          isActive
            ? variant === "sub"
              ? "rounded-lg bg-sidebar-foreground/10 text-sidebar-foreground"
              : "rounded-xl bg-sidebar-foreground text-foreground shadow-panel"
            : variant === "sub"
              ? "rounded-lg text-sidebar-foreground/68 hover:bg-sidebar-foreground/7 hover:text-sidebar-foreground"
              : "rounded-xl text-sidebar-foreground/72 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
        )
      }
    >
      {({ isActive }) => (
        <>
          {variant === "sub" && isActive ? <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" /> : null}
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
        </>
      )}
    </NavLink>
  );
}
