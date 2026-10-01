import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadForm } from "./lead-form";

type Props = PageProps<"/gratis/[slug]">;

async function getFreeCourse(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, slug, title, description, banner_url, cover_horizontal_url, is_free, lead_fields, lead_access, modules(lessons(id))")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  return data?.is_free ? data : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await getFreeCourse(slug);
  return { title: course ? `${course.title} (grátis)` : "Curso grátis", description: course?.description ?? undefined };
}

export default async function FreeCoursePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const course = await getFreeCourse(slug);
  if (!course) notFound();
  if (await getCurrentProfile()) redirect(`/curso/${course.slug}`);

  const query = await searchParams;
  const utm = Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
      .map((k) => [k, typeof query[k] === "string" ? (query[k] as string) : ""])
      .filter(([, v]) => v),
  );
  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const image = course.banner_url ?? course.cover_horizontal_url;

  return (
    <div className="min-h-dvh">
      <header className="border-border flex h-14 items-center justify-between border-b px-4 md:px-10">
        <Brand href={`/gratis/${course.slug}`} />
        <Link href={`/entrar?next=${encodeURIComponent(`/curso/${course.slug}`)}`} className="text-fg-muted hover:text-fg text-sm">
          Já tenho conta
        </Link>
      </header>
      <main className="relative isolate">
        <div className="absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- banner do Storage
            <img src={image} alt="" className="size-full object-cover" />
          ) : null}
          <div className="bg-bg/80 absolute inset-0" />
        </div>
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:grid-cols-[minmax(0,1fr)_380px] md:px-10 md:py-20">
          <div className="flex flex-col gap-4">
            <span className="bg-accent w-fit rounded-md px-2 py-1 text-[11px] font-bold tracking-wide text-white uppercase">Grátis</span>
            <h1 className="text-3xl font-bold md:text-5xl">{course.title}</h1>
            {course.description ? <p className="text-fg-soft max-w-xl whitespace-pre-line">{course.description}</p> : null}
            {lessonCount ? (
              <p className="text-fg-muted text-sm">
                {lessonCount} {lessonCount === 1 ? "aula" : "aulas"} liberadas na hora
              </p>
            ) : null}
          </div>
          <div className="border-border bg-surface h-fit rounded-[var(--radius-card)] border p-6">
            <h2 className="text-lg font-semibold">Assista grátis</h2>
            <p className="text-fg-muted mt-1 mb-5 text-sm">
              {course.lead_access === "direct" ? "Preencha e comece agora." : "Preencha e receba o acesso no seu e-mail."}
            </p>
            <LeadForm
              slug={course.slug}
              mode={course.lead_fields}
              direct={course.lead_access === "direct" || course.lead_fields === "whatsapp"}
              utm={utm}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
