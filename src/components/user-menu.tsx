import type { Profile } from "@/lib/auth";

function initials(profile: Profile) {
  const source = profile.full_name?.trim() || profile.email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function UserMenu({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="bg-accent flex size-8 items-center justify-center rounded-full text-xs font-bold text-white">
        {initials(profile)}
      </span>
      <span className="text-fg-soft hidden text-sm sm:inline">{profile.full_name || profile.email}</span>
      <form action="/auth/sair" method="post">
        <button type="submit" className="text-fg-muted hover:text-fg text-sm">
          Sair
        </button>
      </form>
    </div>
  );
}
