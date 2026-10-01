import Link from "next/link";
import type { ReactNode } from "react";

type Crumb = { href: string; label: string };

export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description?: ReactNode;
  back?: Crumb;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="text-fg-muted hover:text-fg mb-1 inline-block text-sm">
            ← {back.label}
          </Link>
        ) : null}
        <h1 className="truncate text-2xl font-bold">{title}</h1>
        {description ? <p className="text-fg-muted mt-1 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
