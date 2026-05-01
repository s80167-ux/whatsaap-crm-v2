import clsx from "clsx";
import { Children, forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, title, type = "button", variant = "primary", ...props },
  ref
) {
  const tooltip = title ?? props["aria-label"] ?? getTextFromChildren(children);

  return (
    <button
      ref={ref}
      type={type}
      title={tooltip}
      className={clsx(
        "inline-flex min-h-[2.5rem] items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[2.75rem] sm:px-5 sm:py-3",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

function getTextFromChildren(children: ReactNode) {
  const text = Children.toArray(children)
    .filter((child): child is string | number => typeof child === "string" || typeof child === "number")
    .map((child) => String(child).trim())
    .filter(Boolean)
    .join(" ");

  return text || undefined;
}
