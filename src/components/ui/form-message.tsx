import { cn } from "./cn";

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export function FormMessage({ state, className }: { state: FormState | undefined; className?: string }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        state.ok ? "border-border bg-surface-2 text-fg-soft" : "border-accent/40 bg-accent/10 text-fg",
        className,
      )}
    >
      {state.message}
    </p>
  );
}
