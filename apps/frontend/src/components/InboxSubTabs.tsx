import { NavLink } from "react-router-dom";
import clsx from "clsx";

type InboxSubTab = {
  to: string;
  label: string;
};

export function InboxSubTabs({ tabs }: { tabs: InboxSubTab[] }) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/inbox"}
          className={({ isActive }) =>
            clsx(
              "inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition",
              isActive
                ? "border-primary bg-primary text-primary-foreground shadow-soft"
                : "border-border bg-card text-text-muted hover:border-primary/25 hover:text-primary"
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
