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
        "card-surface",
        elevated && "shadow-panel hover:-translate-y-0.5 hover:bg-background-tint",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
