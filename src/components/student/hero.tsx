import { PlayIcon } from "@/components/icons";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { courseProgress, nextLesson, upcomingLesson, type CourseView } from "@/lib/catalog";
import { formatReleaseDate } from "@/lib/datetime";
import { Countdown } from "./countdown";
import { ProgressBar } from "./progress-bar";

/** Banner do topo: o curso em andamento, com Continuar e Ver turma. */
export function Hero({ view }: { view: CourseView }) {
  const { course, cohort, access } = view;
  const next = nextLesson(view);
  const upcoming = upcomingLesson(view);
  const progress = courseProgress(view);
  const position = next ? view.lessons.findIndex((l) => l.id === next.id) + 1 : 0;
  const image = course.banner_url ?? course.cover_horizontal_url;

  return (
    <section className="border-border relative isolate overflow-hidden border-b">
      <div className="absolute inset-0 -z-10">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- banner 1920×800 do Storage
          <img src={image} alt="" className="size-full object-cover" />
        ) : (
          <div className="bg-surface size-full" />
        )}
        {/* Véu escuro uniforme (sem degradê, conforme a identidade visual) */}
        <div className="bg-bg/60 absolute inset-0" />
      </div>

      <div className="flex min-h-[340px] flex-col justify-end gap-4 px-4 pt-24 pb-8 md:min-h-[min(60vh,560px)] md:px-10 md:pb-12">
        {cohort ? (
          <span className="bg-accent w-fit rounded-md px-2 py-1 text-[11px] font-bold tracking-wide text-white uppercase">
            {cohort.name}
          </span>
        ) : access === "free" ? (
          <span className="bg-border text-fg-soft w-fit rounded-md px-2 py-1 text-[11px] font-bold tracking-wide uppercase">Grátis</span>
        ) : null}

        <h1 className="max-w-3xl text-3xl leading-tight font-bold md:text-5xl">{course.title}</h1>

        <div className="text-fg-soft flex flex-col gap-1.5 text-sm md:text-base">
          {access !== "locked" && next ? (
            <p>
              Aula {position} de {view.lessons.length}
              {upcoming?.releaseAt ? (
                <>
                  {" "}
                  · próxima libera {formatReleaseDate(upcoming.releaseAt)} <Countdown to={upcoming.releaseAt} className="text-fg-muted" />
                </>
              ) : null}
            </p>
          ) : access === "locked" ? (
            <p className="max-w-xl">{course.description}</p>
          ) : upcoming?.releaseAt ? (
            <p>
              Primeira aula libera {formatReleaseDate(upcoming.releaseAt)} <Countdown to={upcoming.releaseAt} className="text-fg-muted" />
            </p>
          ) : null}
          {access !== "locked" && progress.done > 0 ? <ProgressBar percent={progress.percent} className="max-w-xs" /> : null}
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          {access === "locked" ? (
            view.checkoutUrl ? (
              <a href={view.checkoutUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "lg")}>
                Desbloquear
              </a>
            ) : null
          ) : next ? (
            <LinkButton href={`/aula/${next.id}`} size="lg">
              <PlayIcon width={18} height={18} />
              {progress.done > 0 || next.percent > 0 ? "Continuar" : "Começar"}
            </LinkButton>
          ) : null}
          <LinkButton href={`/curso/${course.slug}`} variant="secondary" size="lg">
            {cohort ? "Ver turma" : "Ver detalhes"}
          </LinkButton>
          {cohort?.live_url ? (
            <a href={cohort.live_url} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "lg")}>
              Link da live
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
