import Link from "next/link";
import { CheckIcon, LockIcon, PlayIcon } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import type { LessonItem } from "@/lib/catalog";
import { formatReleaseDate } from "@/lib/datetime";
import { formatDuration } from "@/lib/forms";
import { Countdown } from "./countdown";
import { Cover } from "./cover";
import { ProgressBar } from "./progress-bar";

/** Linha de aula (lista do curso e painel lateral da aula). */
export function LessonListItem({
  lesson,
  index,
  current,
  compact,
}: {
  lesson: LessonItem;
  index: number;
  current?: boolean;
  compact?: boolean;
}) {
  const locked = !lesson.isReleased;
  const body = (
    <>
      <div className={cn("relative shrink-0", compact ? "w-28" : "w-32 sm:w-40")}>
        <Cover src={lesson.thumbnailUrl} className="aspect-video rounded-lg" fallback={compact ? undefined : String(index)} />
        {locked ? (
          <span className="bg-bg/75 text-fg-soft absolute inset-0 flex items-center justify-center rounded-lg">
            <LockIcon />
          </span>
        ) : current ? (
          <span className="bg-bg/60 text-accent absolute inset-0 flex items-center justify-center rounded-lg">
            <PlayIcon width={18} height={18} />
          </span>
        ) : null}
        {lesson.percent > 0 && !lesson.completed && !locked ? (
          <ProgressBar percent={lesson.percent} className="absolute right-1 bottom-1 left-1 w-auto" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("line-clamp-2 text-sm font-semibold", current ? "text-fg" : locked ? "text-fg-muted" : "text-fg-soft")}>
          <span className="text-fg-muted mr-1.5 tabular-nums">{index}.</span>
          {lesson.title}
        </p>
        <p className="text-fg-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          {locked ? (
            lesson.releaseAt ? (
              <>
                <span>Libera {formatReleaseDate(lesson.releaseAt)}</span>
                {!compact ? <Countdown to={lesson.releaseAt} /> : null}
              </>
            ) : (
              <span>Bloqueada</span>
            )
          ) : (
            <>
              {lesson.durationSeconds ? <span className="tabular-nums">{formatDuration(lesson.durationSeconds)}</span> : null}
              {lesson.completed ? (
                <span className="text-fg-soft inline-flex items-center gap-1">
                  <CheckIcon width={12} height={12} /> Concluída
                </span>
              ) : null}
              {current ? <span className="text-accent font-semibold">Assistindo</span> : null}
            </>
          )}
        </p>
      </div>
    </>
  );

  const className = cn(
    "flex items-center gap-3 rounded-lg p-2 transition-colors",
    current ? "bg-surface-2" : !locked && "hover:bg-surface-2",
  );
  return locked ? (
    <div className={className} aria-disabled>
      {body}
    </div>
  ) : (
    <Link href={`/aula/${lesson.id}`} className={className} aria-current={current ? "page" : undefined}>
      {body}
    </Link>
  );
}
