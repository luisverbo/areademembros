import Link from "next/link";
import { Brand } from "@/components/brand";
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
      <UserMenu profile={profile} />
    </header>
  );
}
