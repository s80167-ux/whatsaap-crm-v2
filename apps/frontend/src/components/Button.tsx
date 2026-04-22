import clsx from "clsx";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

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
  { className, type = "button", variant = "primary", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        "inline-flex items-center justify-center rounded-lg px-4 py-3 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
});
