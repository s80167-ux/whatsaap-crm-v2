import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  elevated?: boolean;
};

export function Card({ children, className, elevated = false, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-border bg-card p-5 shadow-soft transition duration-300",
        elevated && "shadow-panel",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
