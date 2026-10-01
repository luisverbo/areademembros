import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="border-border flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed px-6 py-12 text-center">
      <p className="font-display text-base font-semibold">{title}</p>
      {description ? <p className="text-fg-muted max-w-md text-sm">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
