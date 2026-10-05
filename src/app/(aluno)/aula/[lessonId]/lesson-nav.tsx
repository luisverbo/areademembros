"use client";

import { useState } from "react";
import { ChevronIcon } from "@/components/icons";
import { LessonListItem } from "@/components/student/lesson-list-item";
import { cn } from "@/components/ui/cn";
import type { LessonItem, ModuleItem } from "@/lib/catalog";

/** Lista lateral da aula: módulos que abrem e fecham, com as aulas dentro. O módulo atual começa aberto. */
export function LessonNav({ modules, lessons, currentId }: { modules: ModuleItem[]; lessons: LessonItem[]; currentId: string }) {
  const currentModule = lessons.find((l) => l.id === currentId)?.moduleId;
  const [open, setOpen] = useState<Set<string>>(() => new Set(currentModule ? [currentModule] : []));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Numeração contínua das aulas (1, 2, 3…) ao longo dos módulos.
  const starts = new Map<string, number>();
  lessons.forEach((l, i) => {
    if (!starts.has(l.moduleId)) starts.set(l.moduleId, i);
  });
  return (
    <div className="flex flex-col gap-1">
      {modules.map((m, mi) => {
        const items = lessons.filter((l) => l.moduleId === m.id);
        const start = starts.get(m.id) ?? 0;
        const done = items.filter((l) => l.completed).length;
        const isOpen = open.has(m.id);
        const hasCurrent = items.some((l) => l.id === currentId);
        return (
          <section key={m.id} className="rounded-lg">
            <button
              type="button"
              onClick={() => toggle(m.id)}
              aria-expanded={isOpen}
              aria-controls={`modulo-${m.id}`}
              className={cn(
                "hover:bg-surface-2 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors",
                hasCurrent && "text-fg",
              )}
            >
              <span
                className={cn(
                  "font-display flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums",
                  hasCurrent ? "bg-accent text-white" : "bg-surface-2 text-fg-muted",
                )}
              >
                {String(mi + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{m.title}</span>
                <span className="text-fg-muted block text-xs tabular-nums">
                  {done}/{items.length} aula{items.length === 1 ? "" : "s"}
                </span>
              </span>
              <ChevronIcon className={cn("text-fg-muted shrink-0 transition-transform", isOpen && "rotate-90")} />
            </button>
            {isOpen ? (
              <div id={`modulo-${m.id}`} className="border-border ml-5 flex flex-col gap-0.5 border-l pb-2 pl-2">
                {items.map((lesson, i) => (
                  <LessonListItem key={lesson.id} lesson={lesson} index={start + i + 1} current={lesson.id === currentId} compact />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
