"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useVideoTime } from "@/components/student/video-clock";
import { seekVideo } from "@/components/student/video-player";
import { formatTimestamp } from "@/lib/transcript";
import { createNote, deleteNote, updateNote, type NoteDTO } from "../../caderno/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

function NoteEditor({ note, onDelete, autoFocus }: { note: NoteDTO; onDelete: () => void; autoFocus: boolean }) {
  const [content, setContent] = useState(note.content);
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(content);
  const area = useRef<HTMLTextAreaElement>(null);

  // Ajusta a altura ao texto.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(64, el.scrollHeight)}px`;
  }, [content]);

  // Salva o que faltar ao sair da página.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void updateNote(note.id, latest.current);
      }
    },
    [note.id],
  );

  const onChange = (value: string) => {
    setContent(value);
    latest.current = value;
    setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      timer.current = undefined;
      const result = await updateNote(note.id, value);
      setState(result.ok ? "saved" : "error");
    }, 700);
  };

  return (
    <li className="rounded-lg border border-border bg-surface-2 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        {note.timestamp_seconds !== null ? (
          <button
            type="button"
            onClick={() => seekVideo(note.timestamp_seconds!)}
            className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent tabular-nums hover:bg-accent/25"
            aria-label={`Ir para ${formatTimestamp(note.timestamp_seconds)}`}
          >
            {formatTimestamp(note.timestamp_seconds)}
          </button>
        ) : (
          <span className="text-fg-muted">Sem minuto</span>
        )}
        <span className="flex items-center gap-3 text-fg-muted">
          <span aria-live="polite">{state === "saving" ? "Salvando…" : state === "saved" ? "Salvo" : state === "error" ? "Não salvou" : ""}</span>
          <button
            type="button"
            className="hover:text-accent"
            onClick={() => {
              if (window.confirm("Excluir esta nota?")) onDelete();
            }}
          >
            Excluir
          </button>
        </span>
      </div>
      <textarea
        ref={area}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        maxLength={20000}
        placeholder="Escreva sua anotação…"
        aria-label={`Nota${note.timestamp_seconds !== null ? ` no minuto ${formatTimestamp(note.timestamp_seconds)}` : ""}`}
        className="w-full resize-none bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none"
      />
    </li>
  );
}

export function Notebook({ lessonId, initial }: { lessonId: string; initial: NoteDTO[] }) {
  const [notes, setNotes] = useState(initial);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const now = useVideoTime();

  async function add() {
    setCreating(true);
    const note = await createNote(lessonId, now);
    setCreating(false);
    if (!note) return;
    setNotes((list) => [...list, note].sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0)));
    setFocusId(note.id);
  }

  return (
    <div className="flex flex-col gap-3 p-1">
      <button
        type="button"
        onClick={() => void add()}
        disabled={creating}
        className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
      >
        + Nova nota em <span className="tabular-nums">{formatTimestamp(now)}</span>
      </button>
      {notes.length ? (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <NoteEditor
              key={note.id}
              note={note}
              autoFocus={note.id === focusId}
              onDelete={() => {
                setNotes((list) => list.filter((n) => n.id !== note.id));
                void deleteNote(note.id);
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="px-2 py-4 text-center text-sm text-fg-muted">Suas anotações desta aula aparecem aqui, com o minuto do vídeo.</p>
      )}
      <Link href="/caderno" className="text-center text-xs font-semibold text-fg-muted hover:text-fg">
        Abrir Meu Caderno →
      </Link>
    </div>
  );
}
