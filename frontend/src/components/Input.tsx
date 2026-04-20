import clsx from "clsx";
import { forwardRef } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

const baseInputClassName =
  "w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-text outline-none transition duration-200 placeholder:text-text-soft focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={clsx(baseInputClassName, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref
) {
  return <select ref={ref} className={clsx(baseInputClassName, className)} {...props} />;
});
