"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { FormMessage, type FormState } from "@/components/ui/form-message";
import { formatReleaseDate, isoToZonedInput } from "@/lib/datetime";
import type { Tables } from "@/lib/database.types";
import { saveCohortLessons } from "../actions";

type Mode = Tables<"cohorts">["release_mode"];
type CourseLesson = { id: string; title: string; moduleTitle: string; isPublished: boolean };
type CohortLesson = { lesson_id: string; position: number; release_at: string | null; release_offset_days: number | null };

type Row = { lessonId: string; included: boolean; releaseAt: string; offsetDays: string };

type Props = {
  cohortId: string;
  mode: Mode;
  intervalDays: number;
  courseLessons: CourseLesson[];
  cohortLessons: CohortLesson[];
  /** Data calculada pelo banco (para quem entra hoje), por aula. */
  preview: Record<string, string | null>;
};

export function LessonsSchedule({ cohortId, mode, intervalDays, courseLessons, cohortLessons, preview }: Props) {
  const byId = useMemo(() => new Map(courseLessons.map((l) => [l.id, l])), [courseLessons]);

  const [rows, setRows] = useState<Row[]>(() => {
    const included = [...cohortLessons]
      .sort((a, b) => a.position - b.position)
      .filter((cl) => byId.has(cl.lesson_id))
      .map((cl) => ({
        lessonId: cl.lesson_id,
        included: true,
        releaseAt: isoToZonedInput(cl.release_at),
        offsetDays: cl.release_offset_days?.toString() ?? "",
      }));
    const includedIds = new Set(included.map((r) => r.lessonId));
    const rest = courseLessons
      .filter((l) => !includedIds.has(l.id))
      .map((l) => ({ lessonId: l.id, included: false, releaseAt: "", offsetDays: "" }));
    return [...included, ...rest];
  });
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<FormState>();
  const [pending, startTransition] = useTransition();

  const update = (lessonId: string, patch: Partial<Row>) => {
    setDirty(true);
    setRows((current) => {
      const next = current.map((r) => (r.lessonId === lessonId ? { ...r, ...patch } : r));
      // Incluídas primeiro, mantendo a ordem relativa.
      return [...next.filter((r) => r.included), ...next.filter((r) => !r.included)];
    });
  };

  const move = (index: number, delta: -1 | 1) => {
    setDirty(true);
    setRows((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length || !next[target].included) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveCohortLessons(
        cohortId,
        rows
          .filter((r) => r.included)
          .map((r) => ({
            lesson_id: r.lessonId,
            release_at: r.releaseAt || null,
            release_offset_days: r.offsetDays === "" ? null : Number(r.offsetDays),
          })),
      );
      setState(result);
      if (result.ok) setDirty(false);
    });

  const includedCount = rows.filter((r) => r.included).length;

  return (
    <Card>
      <CardHeader
        title={`Aulas da turma (${includedCount} de ${courseLessons.length})`}
        description="Marque as aulas que entram, defina a ordem e, conforme o modo, a data de cada uma."
      />
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-border text-fg-muted border-y text-left text-xs">
              <th className="w-10 px-5 py-2 font-medium">#</th>
              <th className="py-2 font-medium">Aula</th>
              {mode === "weekly" || mode === "fixed_date" ? (
                <th className="py-2 font-medium">{mode === "weekly" ? "Data manual (opcional)" : "Libera em"}</th>
              ) : null}
              {mode === "days_after_join" ? <th className="py-2 font-medium">Dias após entrada</th> : null}
              <th className="px-5 py-2 text-right font-medium">Previsão</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const lesson = byId.get(row.lessonId)!;
              // Incluídas vêm sempre primeiro, então o índice é a posição na turma.
              const position = index;
              const saved = preview[row.lessonId];
              return (
                <tr key={row.lessonId} className={cn("border-border border-b", !row.included && "text-fg-muted")}>
                  <td className="px-5 py-2">
                    <input
                      type="checkbox"
                      className="accent-accent size-4"
                      checked={row.included}
                      onChange={(e) => update(row.lessonId, { included: e.target.checked })}
                      aria-label={`Incluir ${lesson.title}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      {row.included ? (
                        <span className="flex shrink-0 flex-col leading-none">
                          <button
                            type="button"
                            className="text-fg-muted hover:text-fg disabled:opacity-30"
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                            aria-label="Subir"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="text-fg-muted hover:text-fg disabled:opacity-30"
                            disabled={index === includedCount - 1}
                            onClick={() => move(index, 1)}
                            aria-label="Descer"
                          >
                            ▼
                          </button>
                        </span>
                      ) : null}
                      <span className="min-w-0">
                        <span className="block truncate">
                          {row.included ? <span className="text-fg-muted mr-1.5">{position + 1}.</span> : null}
                          {lesson.title}
                          {!lesson.isPublished ? <span className="text-fg-muted ml-1.5 text-xs">(rascunho)</span> : null}
                        </span>
                        <span className="text-fg-muted block truncate text-xs">{lesson.moduleTitle}</span>
                      </span>
                    </div>
                  </td>
                  {mode === "weekly" || mode === "fixed_date" ? (
                    <td className="py-2 pr-3">
                      <Input
                        type="datetime-local"
                        className="h-8 w-52"
                        disabled={!row.included}
                        value={row.releaseAt}
                        onChange={(e) => update(row.lessonId, { releaseAt: e.target.value })}
                        aria-label={`Data de ${lesson.title}`}
                      />
                    </td>
                  ) : null}
                  {mode === "days_after_join" ? (
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-24"
                        disabled={!row.included}
                        value={row.offsetDays}
                        placeholder={String(position * intervalDays)}
                        onChange={(e) => update(row.lessonId, { offsetDays: e.target.value })}
                        aria-label={`Dias após a entrada para ${lesson.title}`}
                      />
                    </td>
                  ) : null}
                  <td className="text-fg-muted px-5 py-2 text-right text-xs whitespace-nowrap">
                    {!row.included
                      ? "—"
                      : dirty
                        ? "salve para calcular"
                        : mode === "days_after_join"
                          ? `dia ${row.offsetDays || position * intervalDays}`
                          : saved
                            ? formatReleaseDate(saved)
                            : "sem data (travada)"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending || !dirty}>
          {pending ? "Salvando…" : "Salvar aulas da turma"}
        </Button>
        {dirty ? <span className="text-fg-muted text-xs">Alterações não salvas</span> : null}
        <FormMessage state={state} className="py-1.5" />
      </div>
    </Card>
  );
}
