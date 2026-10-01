import { Brand } from "@/components/brand";
import { LinkButton } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Provisória: a vitrine estilo Netflix chega na Etapa 1B.
export default async function Home() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, status, cohort:cohorts(name, course:courses!cohorts_course_id_fkey(title))")
    .eq("user_id", profile.id)
    .eq("status", "active");

  return (
    <div className="min-h-dvh">
      <header className="border-border flex h-14 items-center justify-between border-b px-4 md:px-6">
        <Brand />
        <UserMenu profile={profile} />
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold">Olá{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!</h1>
        <p className="text-fg-muted mt-2">A vitrine com os seus cursos está em construção.</p>
        {enrollments?.length ? (
          <ul className="mt-8 flex flex-col gap-2">
            {enrollments.map((e) => (
              <li key={e.id} className="border-border bg-surface rounded-[var(--radius-card)] border px-4 py-3">
                <p className="font-display font-semibold">{e.cohort?.course?.title}</p>
                <p className="text-fg-muted text-sm">{e.cohort?.name}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {profile.role === "admin" ? (
          <LinkButton href="/admin" className="mt-8">
            Ir para o admin
          </LinkButton>
        ) : null}
      </main>
    </div>
  );
}
