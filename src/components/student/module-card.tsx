import Link from "next/link";
import { CheckIcon, LockIcon } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import type { LessonItem, ModuleItem } from "@/lib/catalog";
import { formatReleaseDate } from "@/lib/datetime";
import { Cover } from "./cover";
import { ProgressBar } from "./progress-bar";

/** Resumo do módulo para os cards e para a página do módulo. */
export function moduleStats(lessons: LessonItem[]) {
  const total = lessons.length;
  const done = lessons.filter((l) => l.completed).length;
  const released = lessons.filter((l) => l.isReleased);
  const upcoming = lessons.find((l) => !l.isReleased && l.releaseAt);
  return {
    total,
    done,
    percent: total ? Math.round((done / total) * 100) : 0,
    locked: released.length === 0,
    releaseAt: released.length === 0 ? (upcoming?.releaseAt ?? null) : null,
    next: released.find((l) => !l.completed) ?? released[0] ?? null,
  };
}

/** Banner do módulo na página do curso: imagem 16:9, número, título, descrição e progresso. */
export function ModuleCard({ module, index, lessons, href }: { module: ModuleItem; index: number; lessons: LessonItem[]; href: string }) {
  const stats = moduleStats(lessons);
  const complete = stats.total > 0 && stats.done === stats.total;

  const body = (
    <>
      <div className="relative">
        <Cover src={module.coverUrl} className="aspect-video" />
        {!module.coverUrl ? (
          <span className="font-display text-fg-muted/40 absolute inset-0 flex items-center justify-center text-7xl font-bold tabular-nums select-none">
            {String(index).padStart(2, "0")}
          </span>
        ) : null}
        <span className="bg-bg/80 text-fg-soft absolute top-3 left-3 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide uppercase">
          Módulo {index}
        </span>
        {stats.locked ? (
          <span className="bg-bg/70 absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
            <LockIcon width={22} height={22} className="text-fg-soft" />
            <span className="text-fg-soft px-3 text-xs font-semibold">
              {stats.releaseAt ? `Libera ${formatReleaseDate(stats.releaseAt)}` : "Bloqueado"}
            </span>
          </span>
        ) : complete ? (
          <span
            className="bg-bg/80 text-fg absolute top-3 right-3 flex size-7 items-center justify-center rounded-full"
            title="Módulo concluído"
          >
            <CheckIcon width={14} height={14} />
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="font-display line-clamp-2 text-lg leading-tight font-bold">{module.title}</p>
        {module.description ? <p className="text-fg-muted line-clamp-2 text-sm">{module.description}</p> : null}
        <div className="mt-auto flex items-center gap-3 pt-2">
          <ProgressBar percent={stats.percent} className="flex-1" />
          <span className="text-fg-muted shrink-0 text-xs tabular-nums">
            {stats.done}/{stats.total} aula{stats.total === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </>
  );

  const className = cn(
    "group border-border bg-surface flex flex-col overflow-hidden rounded-[var(--radius-card)] border transition-all",
    "shadow-[0_10px_30px_-18px_rgba(0,0,0,0.9)]",
    stats.locked ? "opacity-80" : "hover:border-accent/70 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.95)]",
  );
  return stats.locked ? (
    <div className={className} aria-disabled>
      {body}
    </div>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
