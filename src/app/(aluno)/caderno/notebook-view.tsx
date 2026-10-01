"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileIcon, SearchIcon } from "@/components/icons";
import type { NotebookCourse } from "@/lib/notes-data";
import { formatTimestamp } from "@/lib/transcript";

function ExportLinks({ query, label }: { query: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-fg-muted">{label}</span>
      <a href={`/caderno/exportar?formato=pdf${query}`} className="inline-flex items-center gap-1 rounded-md bg-border px-2 py-1 font-semibold text-fg-soft hover:text-fg">
        <FileIcon width={12} height={12} /> PDF
      </a>
      <a href={`/caderno/exportar?formato=docx${query}`} className="inline-flex items-center gap-1 rounded-md bg-border px-2 py-1 font-semibold text-fg-soft hover:text-fg">
        <FileIcon width={12} height={12} /> Word
      </a>
    </span>
  );
}

export function NotebookView({ courses }: { courses: NotebookCourse[] }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!term) return courses;
    return courses
      .map((c) => ({
        ...c,
        lessons: c.lessons
          .map((l) => ({ ...l, notes: l.notes.filter((n) => n.content.toLowerCase().includes(term) || l.title.toLowerCase().includes(term)) }))
          .filter((l) => l.notes.length),
      }))
      .filter((c) => c.lessons.length);
  }, [courses, term]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative min-w-0 flex-1">
          <SearchIcon className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nas suas anotações"
            aria-label="Buscar nas suas anotações"
            className="h-10 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm placeholder:text-fg-muted focus:border-fg-muted focus:outline-none"
          />
        </label>
        <ExportLinks query="" label="Exportar tudo:" />
      </div>

      {filtered.length ? (
        filtered.map((course) => (
          <section key={course.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <h2 className="text-xl font-bold">{course.title}</h2>
              <ExportLinks query={`&curso=${course.id}`} label="Exportar curso:" />
            </div>
            {course.lessons.map((lesson) => (
              <article key={lesson.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-fg-muted">{lesson.moduleTitle}</p>
                    <Link href={`/aula/${lesson.id}`} className="font-semibold hover:text-accent">
                      {lesson.title}
                    </Link>
                  </div>
                  <ExportLinks query={`&aula=${lesson.id}`} label="" />
                </div>
                <ul className="flex flex-col gap-2.5">
                  {lesson.notes.map((note) => (
                    <li key={note.id} className="flex gap-3 text-sm">
                      {note.timestamp_seconds !== null ? (
                        <Link
                          href={`/aula/${lesson.id}?t=${note.timestamp_seconds}`}
                          className="h-fit shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 font-semibold text-accent tabular-nums hover:bg-accent/25"
                        >
                          {formatTimestamp(note.timestamp_seconds)}
                        </Link>
                      ) : null}
                      <p className="whitespace-pre-line text-fg-soft [overflow-wrap:anywhere]">{note.content}</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        ))
      ) : (
        <p className="rounded-[var(--radius-card)] border border-dashed border-border px-6 py-12 text-center text-fg-muted">
          {term ? "Nenhuma anotação com esse texto." : "Você ainda não fez anotações. Na página da aula, abra a aba Caderno e clique em Nova nota."}
        </p>
      )}
    </div>
  );
}
