"use client";

import { useActionState, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Tables } from "@/lib/database.types";
import { isoToZonedInput, WEEKDAYS } from "@/lib/datetime";
import { releaseModeLabels } from "@/lib/labels";
import { updateCohort } from "../actions";

type Mode = Tables<"cohorts">["release_mode"];

const modeHelp: Record<Mode, string> = {
  all: "Todas as aulas da turma liberam no início da turma (ou na hora, se não houver data de início).",
  weekly: "Uma aula por semana, no dia e horário escolhidos, a partir do início. Dá para mudar a data de uma aula específica abaixo.",
  fixed_date: "Você define a data de cada aula na lista abaixo. Aula sem data fica travada.",
  days_after_join: "Cada aluno tem o próprio calendário, contado a partir da entrada dele. Nunca libera antes do início da turma.",
};

export function CohortForm({ cohort, liveUrl }: { cohort: Tables<"cohorts">; liveUrl: string | null }) {
  const [state, action] = useActionState(updateCohort.bind(null, cohort.id), undefined);
  const [mode, setMode] = useState<Mode>(cohort.release_mode);
  const [access, setAccess] = useState(cohort.access_months ? "months" : "lifetime");
  const config = (cohort.release_config ?? {}) as { weekday?: number; time?: string; interval_days?: number };
  const e = state?.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Turma" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome" htmlFor="name" error={e.name}>
            <Input id="name" name="name" defaultValue={cohort.name} required />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox name="is_active" defaultChecked={cohort.is_active} label="Turma ativa" />
          </div>
          <Field label="Descrição" htmlFor="description" className="md:col-span-2">
            <Textarea id="description" name="description" defaultValue={cohort.description ?? ""} rows={2} />
          </Field>
          <Field label="Início" htmlFor="starts_at" error={e.starts_at} hint="Horário de Brasília">
            <Input id="starts_at" name="starts_at" type="datetime-local" defaultValue={isoToZonedInput(cohort.starts_at)} />
          </Field>
          <Field label="Fim" htmlFor="ends_at" error={e.ends_at} hint="Só informativo; o acesso segue o prazo abaixo.">
            <Input id="ends_at" name="ends_at" type="datetime-local" defaultValue={isoToZonedInput(cohort.ends_at)} />
          </Field>
          <Field label="Link da live" htmlFor="live_url" error={e.live_url} className="md:col-span-2">
            <Input id="live_url" name="live_url" type="url" defaultValue={liveUrl ?? ""} placeholder="https://meet.google.com/…" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Liberação das aulas" description={modeHelp[mode]} />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Modo" htmlFor="release_mode">
            <Select id="release_mode" name="release_mode" value={mode} onChange={(ev) => setMode(ev.target.value as Mode)}>
              {Object.entries(releaseModeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {mode === "weekly" ? (
            <>
              <Field label="Dia da semana" htmlFor="weekday" error={e.weekday}>
                <Select id="weekday" name="weekday" defaultValue={config.weekday?.toString() ?? "1"}>
                  {WEEKDAYS.map((day, i) => (
                    <option key={day} value={i}>
                      {day}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Horário" htmlFor="time" error={e.time} hint="Horário de Brasília">
                <Input id="time" name="time" type="time" defaultValue={config.time ?? "19:00"} />
              </Field>
            </>
          ) : null}
          {mode === "days_after_join" ? (
            <Field
              label="Intervalo entre aulas (dias)"
              htmlFor="interval_days"
              error={e.interval_days}
              hint="Padrão para aulas sem dia definido."
            >
              <Input id="interval_days" name="interval_days" type="number" min={0} defaultValue={config.interval_days ?? 7} />
            </Field>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Acesso e venda" />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Prazo de acesso" htmlFor="access">
            <Select id="access" name="access" value={access} onChange={(ev) => setAccess(ev.target.value)}>
              <option value="lifetime">Vitalício</option>
              <option value="months">Expira em meses</option>
            </Select>
          </Field>
          {access === "months" ? (
            <>
              <Field label="Meses" htmlFor="access_months" error={e.access_months}>
                <Input id="access_months" name="access_months" type="number" min={1} defaultValue={cohort.access_months ?? 12} />
              </Field>
              <Field label="Contando a partir" htmlFor="access_starts_from" error={e.access_starts_from}>
                <Select id="access_starts_from" name="access_starts_from" defaultValue={cohort.access_starts_from}>
                  <option value="purchase">Da compra de cada aluno</option>
                  <option value="cohort_start">Do início da turma</option>
                </Select>
              </Field>
            </>
          ) : (
            <div className="max-md:hidden md:col-span-2" />
          )}
          <Field
            label="Link do checkout"
            htmlFor="checkout_url"
            error={e.checkout_url}
            className="md:col-span-3"
            hint="Para onde vai quem clica no cadeado. Nome e e-mail do aluno são preenchidos automaticamente."
          >
            <Input
              id="checkout_url"
              name="checkout_url"
              type="url"
              defaultValue={cohort.checkout_url ?? ""}
              placeholder="https://pay.kiwify.com.br/…"
            />
          </Field>
        </div>
      </Card>

      <div className="border-border bg-bg/95 sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t px-1 py-3 backdrop-blur">
        <SubmitButton>Salvar turma</SubmitButton>
        <FormMessage state={state} className="py-1.5" />
      </div>
    </form>
  );
}
