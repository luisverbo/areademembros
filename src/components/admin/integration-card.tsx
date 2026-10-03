import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

type Status = "active" | "pending" | "later";

const statusStyles: Record<Status, { label: string; dot: string; text: string }> = {
  active: { label: "Ativa", dot: "bg-fg", text: "text-fg" },
  pending: { label: "Falta configurar", dot: "bg-fg-muted", text: "text-fg-muted" },
  later: { label: "Para depois", dot: "bg-fg-muted", text: "text-fg-muted" },
};

/** Card de integração: monograma, nome, resumo e status. Abre a página de configuração. */
export function IntegrationCard({
  href,
  monogram,
  name,
  summary,
  status,
  footer,
}: {
  href: string;
  monogram: string;
  name: string;
  summary: string;
  status: Status;
  footer?: ReactNode;
}) {
  const s = statusStyles[status];
  return (
    <Link
      href={href}
      className={cn(
        "group border-accent/45 bg-surface flex min-h-44 flex-col gap-4 rounded-[var(--radius-card)] border p-5",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_28px_-12px_rgba(0,0,0,0.75)]",
        "hover:border-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_36px_-12px_rgba(214,58,66,0.35)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden
          className="border-border bg-surface-2 font-display text-fg flex size-12 items-center justify-center rounded-xl border text-lg font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          {monogram}
        </span>
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", s.text)}>
          <span className={cn("size-2 rounded-full", s.dot)} />
          {s.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="font-display text-lg font-bold">{name}</h3>
        <p className="text-fg-muted text-sm">{summary}</p>
      </div>
      <div className="text-fg-muted flex items-center justify-between text-xs">
        <span>{footer}</span>
        <span className="text-fg-soft group-hover:text-accent-soft font-semibold transition-colors">Configurar →</span>
      </div>
    </Link>
  );
}
