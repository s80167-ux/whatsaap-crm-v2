import clsx from "clsx";
import { forwardRef } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

const baseInputClassName = "input-base";

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
