"use client";

import { useSyncExternalStore } from "react";
import { SparkIcon } from "@/components/icons";
import { seekVideo } from "@/components/student/video-player";
import { formatTimestamp } from "@/lib/transcript";

type Point = { title: string; detail: string; start_seconds: number | null };

// Checklist marcado fica salvo neste navegador (conveniência do aluno).
const key = (lessonId: string) => `lc:checklist:${lessonId}`;
function readChecked(lessonId: string): string {
  try {
    return localStorage.getItem(key(lessonId)) ?? "[]";
  } catch {
    return "[]";
  }
}
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function LessonSummary({ lessonId, points, checklist }: { lessonId: string; points: Point[]; checklist: string[] }) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readChecked(lessonId),
    () => "[]",
  );
  const checked = new Set<number>(JSON.parse(raw) as number[]);

  const toggle = (i: number) => {
    const next = new Set(checked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    try {
      localStorage.setItem(key(lessonId), JSON.stringify([...next]));
    } catch {
      // armazenamento indisponível: só não lembra
    }
    listeners.forEach((l) => l());
  };

  return (
    <section className="border-border bg-surface grid gap-5 rounded-[var(--radius-card)] border p-5 md:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <SparkIcon className="text-accent" /> Resumo da aula
        </h2>
        <ol className="flex flex-col gap-3">
          {points.map((p, i) => (
            <li key={i} className="flex gap-3 text-sm">
              {p.start_seconds !== null ? (
                <button
                  type="button"
                  onClick={() => seekVideo(p.start_seconds!)}
                  className="bg-accent/15 text-accent hover:bg-accent/25 h-fit shrink-0 rounded-md px-1.5 py-0.5 font-semibold tabular-nums"
                  aria-label={`Ir para ${formatTimestamp(p.start_seconds)}`}
                >
                  {formatTimestamp(p.start_seconds)}
                </button>
              ) : null}
              <span>
                <span className="text-fg font-semibold">{p.title}</span>
                <span className="text-fg-muted block">{p.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {checklist.length ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Checklist</h2>
          <ul className="flex flex-col gap-2">
            {checklist.map((item, i) => (
              <li key={i}>
                <label className="text-fg-soft flex cursor-pointer gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="accent-accent mt-0.5 size-4 shrink-0"
                    checked={checked.has(i)}
                    onChange={() => toggle(i)}
                  />
                  <span className={checked.has(i) ? "text-fg-muted line-through" : undefined}>{item}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
