import Link from "next/link";
import { CheckIcon, LockIcon, PlayIcon } from "@/components/icons";
import { formatReleaseDate } from "@/lib/datetime";
import { formatDuration } from "@/lib/forms";
import type { LessonItem } from "@/lib/catalog";
import { Cover } from "./cover";
import { ProgressBar } from "./progress-bar";

/** Card horizontal (16:9) de aula. Travada mostra cadeado e quando libera. */
/** `fluid`: ocupa a largura da coluna (grades), em vez da largura fixa das fileiras. */
export function LessonCard({ lesson, eyebrow, fluid, index }: { lesson: LessonItem; eyebrow?: string; fluid?: boolean; index?: number }) {
  const locked = !lesson.isReleased;
  const content = (
    <>
      <div className="relative">
        <Cover
          src={lesson.thumbnailUrl}
          fallback={locked ? undefined : lesson.title}
          className="aspect-video rounded-[var(--radius-card)]"
        />
        {locked ? (
          <div className="bg-bg/75 absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] text-center">
            <LockIcon width={20} height={20} className="text-fg-soft" />
            <span className="text-fg-soft px-3 text-xs font-semibold">
              {lesson.releaseAt ? `Libera ${formatReleaseDate(lesson.releaseAt)}` : "Bloqueada"}
            </span>
          </div>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <span className="bg-accent flex size-12 items-center justify-center rounded-full text-white">
              <PlayIcon width={20} height={20} />
            </span>
          </span>
        )}
        {lesson.completed ? (
          <span
            className="bg-bg/80 text-fg absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full"
            title="Concluída"
          >
            <CheckIcon width={14} height={14} />
          </span>
        ) : null}
        {lesson.durationSeconds && !locked ? (
          <span className="bg-bg/80 text-fg-soft absolute right-2.5 bottom-2.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
            {formatDuration(lesson.durationSeconds)}
          </span>
        ) : null}
      </div>
      {lesson.percent > 0 && !lesson.completed ? <ProgressBar percent={lesson.percent} className="mt-2" /> : null}
      {eyebrow ? <p className="text-fg-muted mt-2 truncate text-xs">{eyebrow}</p> : null}
      <p
        className={
          eyebrow
            ? "text-fg-soft group-hover:text-fg line-clamp-1 text-sm font-semibold"
            : "text-fg-soft group-hover:text-fg mt-2 line-clamp-1 text-sm font-semibold"
        }
      >
        {index !== undefined ? <span className="text-fg-muted mr-1.5 tabular-nums">{index}.</span> : null}
        {lesson.title}
      </p>
    </>
  );

  const className = fluid ? "group block w-full" : "group block w-[260px] shrink-0 snap-start sm:w-[320px] lg:w-[400px]";
  return locked ? (
    <div className={`${className} cursor-not-allowed`} aria-disabled>
      {content}
    </div>
  ) : (
    <Link href={`/aula/${lesson.id}`} className={className}>
      {content}
    </Link>
  );
}
