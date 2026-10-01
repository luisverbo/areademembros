import Link from "next/link";
import { LockIcon } from "@/components/icons";
import { Cover } from "./cover";
import { ProgressBar } from "./progress-bar";

type Props = {
  title: string;
  coverUrl: string | null;
  href: string;
  external?: boolean;
  locked?: boolean;
  percent?: number;
};

/** Card vertical (9:16) de curso: só imagem + título (+ progresso ou cadeado). */
export function CourseCard({ title, coverUrl, href, external, locked, percent }: Props) {
  const content = (
    <>
      <div className="relative">
        <Cover
          src={coverUrl}
          fallback={title}
          className="aspect-[9/16] rounded-[var(--radius-card)] transition-transform duration-200 group-hover:scale-[1.02]"
        />
        {locked ? (
          <span
            className="bg-bg/80 text-fg-soft absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full"
            title="Bloqueado"
          >
            <LockIcon width={14} height={14} />
          </span>
        ) : null}
      </div>
      {percent !== undefined && percent > 0 ? <ProgressBar percent={percent} className="mt-2" /> : null}
      <p className="text-fg-soft group-hover:text-fg mt-2 line-clamp-2 text-sm font-semibold">{title}</p>
    </>
  );

  const className = "group block w-[150px] shrink-0 snap-start sm:w-[200px] lg:w-[250px]";
  return external ? (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer" aria-label={`${title} (desbloquear)`}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
