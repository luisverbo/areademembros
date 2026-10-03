import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-muted " +
  "focus:border-fg-muted focus:outline-none disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-10", className)} {...props} />;
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("text-fg-soft flex cursor-pointer items-start gap-2 text-sm", className)}>
      <input type="checkbox" className="accent-accent mt-0.5 size-4" {...props} />
      <span>{label}</span>
    </label>
  );
}

type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | string[];
  children: ReactNode;
  className?: string;
};

export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-fg-soft text-sm font-medium">
        {label}
      </label>
      {children}
      {message ? <p className="text-accent-soft text-xs">{message}</p> : hint ? <p className="text-fg-muted text-xs">{hint}</p> : null}
    </div>
  );
}
