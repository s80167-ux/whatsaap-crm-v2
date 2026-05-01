import clsx from "clsx";
import { Children, forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[2.25rem] px-3 py-2 text-xs",
  md: "min-h-[2.625rem] px-4 py-2.5 text-sm sm:px-5 sm:py-3",
  lg: "min-h-[3rem] px-5 py-3 text-sm sm:px-6 sm:py-3.5",
  icon: "h-10 w-10 px-0 py-0"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, size = "md", title, type = "button", variant = "primary", ...props },
  ref
) {
  const tooltip = title ?? props["aria-label"] ?? getTextFromChildren(children);

  return (
    <button
      ref={ref}
      type={type}
      title={tooltip}
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
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
