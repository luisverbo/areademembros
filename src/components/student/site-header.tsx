import Link from "next/link";
import { Brand } from "@/components/brand";
import { SearchIcon } from "@/components/icons";
import { UserMenu } from "@/components/user-menu";
import type { Profile } from "@/lib/auth";

export function SiteHeader({ profile }: { profile: Profile }) {
  return (
    <header className="border-border/60 bg-bg/95 sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b px-4 backdrop-blur md:h-16 md:px-10">
      <div className="flex items-center gap-6">
        <Brand />
        <nav className="hidden items-center gap-5 text-sm sm:flex">
          <Link href="/" className="text-fg hover:text-fg font-semibold">
            Início
          </Link>
          {profile.role === "admin" ? (
            <Link href="/admin" className="text-fg-muted hover:text-fg">
              Admin
            </Link>
          ) : null}
        </nav>
      </div>
      <div className="flex items-center gap-3 md:gap-5">
        <Link
          href="/busca"
          className="border-border text-fg-soft hover:border-fg-muted hover:text-fg flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors"
        >
          <SearchIcon width={14} height={14} className="text-accent" />
          <span className="hidden sm:inline">Buscar nas aulas</span>
          <span className="sm:hidden">Buscar</span>
        </Link>
        <UserMenu profile={profile} />
      </div>
    </header>
  );
}
