"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const items = [
  { href: "/admin", label: "Painel", exact: true },
  { href: "/admin/cursos", label: "Cursos" },
  { href: "/admin/turmas", label: "Turmas" },
  { href: "/admin/alunos", label: "Alunos" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex scrollbar-none gap-1 overflow-x-auto md:flex-col">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {active ? <span className="bg-accent absolute inset-y-2 left-0 w-0.5 rounded-full max-md:hidden" /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
