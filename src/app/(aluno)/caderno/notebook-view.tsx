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
      <a
        href={`/caderno/exportar?formato=pdf${query}`}
        className="bg-border text-fg-soft hover:text-fg inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold"
      >
        <FileIcon width={12} height={12} /> PDF
      </a>
      <a
        href={`/caderno/exportar?formato=docx${query}`}
        className="bg-border text-fg-soft hover:text-fg inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold"
      >
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
          .map((l) => ({
            ...l,
            notes: l.notes.filter((n) => n.content.toLowerCase().includes(term) || l.title.toLowerCase().includes(term)),
          }))
          .filter((l) => l.notes.length),
      }))
      .filter((c) => c.lessons.length);
  }, [courses, term]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative min-w-0 flex-1">
          <SearchIcon className="text-fg-muted absolute top-1/2 left-3 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nas suas anotações"
            aria-label="Buscar nas suas anotações"
            className="border-border bg-surface-2 placeholder:text-fg-muted focus:border-fg-muted h-10 w-full rounded-lg border pr-3 pl-9 text-sm focus:outline-none"
          />
        </label>
        <ExportLinks query="" label="Exportar tudo:" />
      </div>

      {filtered.length ? (
        filtered.map((course) => (
          <section key={course.id} className="flex flex-col gap-4">
            <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <h2 className="text-xl font-bold">{course.title}</h2>
              <ExportLinks query={`&curso=${course.id}`} label="Exportar curso:" />
            </div>
            {course.lessons.map((lesson) => (
              <article key={lesson.id} className="border-border bg-surface rounded-[var(--radius-card)] border p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-fg-muted text-xs">{lesson.moduleTitle}</p>
                    <Link href={`/aula/${lesson.id}`} className="hover:text-accent font-semibold">
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
                          className="bg-accent/15 text-accent hover:bg-accent/25 h-fit shrink-0 rounded-md px-1.5 py-0.5 font-semibold tabular-nums"
                        >
                          {formatTimestamp(note.timestamp_seconds)}
                        </Link>
                      ) : null}
                      <p className="text-fg-soft [overflow-wrap:anywhere] whitespace-pre-line">{note.content}</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        ))
      ) : (
        <p className="border-border text-fg-muted rounded-[var(--radius-card)] border border-dashed px-6 py-12 text-center">
          {term
            ? "Nenhuma anotação com esse texto."
            : "Você ainda não fez anotações. Na página da aula, abra a aba Caderno e clique em Nova nota."}
        </p>
      )}
    </div>
  );
}
