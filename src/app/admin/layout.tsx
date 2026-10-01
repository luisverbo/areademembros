import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { Brand } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await requireAdmin();

  return (
    <div className="min-h-dvh">
      <header className="border-border bg-bg/95 sticky top-0 z-20 flex h-14 items-center justify-between border-b px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <Brand href="/admin" />
          <span className="border-border text-fg-muted rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/" className="text-fg-muted hover:text-fg hidden text-sm sm:inline">
            Área do aluno
          </Link>
          <UserMenu profile={profile} />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:px-6">
        <aside className="md:sticky md:top-20 md:h-fit md:w-48 md:shrink-0">
          <AdminNav />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
