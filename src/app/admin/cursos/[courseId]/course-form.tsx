"use client";

import { useActionState, useState } from "react";
import { ImageUpload } from "@/components/admin/image-upload";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Tables } from "@/lib/database.types";
import { formatDuration } from "@/lib/forms";
import { leadFieldsLabels } from "@/lib/lead-fields";
import { updateCourse } from "../actions";

type Props = {
  siteUrl: string;
  course: Tables<"courses">;
  cohorts: { id: string; name: string }[];
  lessons: { id: string; title: string }[];
};

export function CourseForm({ siteUrl, course, cohorts, lessons }: Props) {
  const [state, action] = useActionState(updateCourse.bind(null, course.id), undefined);
  const e = state?.errors ?? {};
  const [isFree, setIsFree] = useState(course.is_free);
  const publicLink = `${siteUrl}/gratis/${course.slug}`;

  return (
    <form action={action} className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Dados do curso" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Título" htmlFor="title" error={e.title}>
            <Input id="title" name="title" defaultValue={course.title} required />
          </Field>
          <Field label="Endereço (slug)" htmlFor="slug" error={e.slug}>
            <Input id="slug" name="slug" defaultValue={course.slug} required />
          </Field>
          <Field label="Descrição" htmlFor="description" className="md:col-span-2" hint="Aparece em “Ver detalhes”.">
            <Textarea id="description" name="description" defaultValue={course.description ?? ""} rows={4} />
          </Field>
          <Field
            label="Turma de venda"
            htmlFor="sales_cohort_id"
            hint="Quem não comprou e clica no cadeado vai para o checkout desta turma."
          >
            <Select id="sales_cohort_id" name="sales_cohort_id" defaultValue={course.sales_cohort_id ?? ""}>
              <option value="">— Nenhuma —</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ordem na vitrine" htmlFor="showcase_order" error={e.showcase_order} hint="Menor aparece primeiro.">
            <Input id="showcase_order" name="showcase_order" type="number" min={0} defaultValue={course.showcase_order} />
          </Field>
          <div className="flex flex-col gap-3 md:col-span-2">
            <Checkbox name="is_published" defaultChecked={course.is_published} label="Publicado (aparece na vitrine)" />
            <Checkbox
              name="is_free"
              checked={isFree}
              onChange={(ev) => setIsFree(ev.target.checked)}
              label="Curso grátis (qualquer pessoa cadastrada assiste)"
            />
          </div>
        </div>
      </Card>

      {isFree ? (
        <Card>
          <CardHeader title="Cadastro do curso grátis" description="O visitante deixa os dados no link público, vira lead e já assiste." />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="O que pedir" htmlFor="lead_fields">
              <Select id="lead_fields" name="lead_fields" defaultValue={course.lead_fields}>
                {Object.entries(leadFieldsLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Como entra" htmlFor="lead_access" hint="“Só WhatsApp” sempre entra direto (não há e-mail para confirmar).">
              <Select id="lead_access" name="lead_access" defaultValue={course.lead_access}>
                <option value="direct">Direto: preencheu, já assiste</option>
                <option value="confirm_email">Confirmando pelo link no e-mail</option>
              </Select>
            </Field>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <span className="text-fg-soft text-sm font-medium">Link público</span>
              <div className="flex flex-wrap items-center gap-2">
                <code className="border-border bg-surface-2 text-fg-soft min-w-0 flex-1 truncate rounded-lg border px-3 py-2 text-sm">
                  {publicLink}
                </code>
                <button
                  type="button"
                  className="bg-border rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#36363b]"
                  onClick={() => void navigator.clipboard?.writeText(publicLink)}
                >
                  Copiar
                </button>
              </div>
              <p className="text-fg-muted text-xs">Funciona com o curso publicado. Dá para somar UTMs: …?utm_source=instagram</p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Imagens" description="Cada formato aparece num lugar da vitrine." />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-[1fr_2fr]">
          <ImageUpload
            name="cover_vertical_url"
            label="Capa vertical"
            folder={`courses/${course.id}`}
            defaultUrl={course.cover_vertical_url}
            aspect={9 / 16}
            hint="9:16 · ex.: 1080×1920"
          />
          <div className="flex flex-col gap-4">
            <ImageUpload
              name="cover_horizontal_url"
              label="Capa horizontal"
              folder={`courses/${course.id}`}
              defaultUrl={course.cover_horizontal_url}
              aspect={16 / 9}
              hint="16:9 · ex.: 1920×1080"
            />
            <ImageUpload
              name="banner_url"
              label="Banner do topo"
              folder={`courses/${course.id}`}
              defaultUrl={course.banner_url}
              aspect={1920 / 800}
              hint="1920×800"
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Prévia (trailer)" description="Trecho que toca sem som quando o aluno passa o mouse no curso bloqueado." />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Aula" htmlFor="preview_lesson_id">
            <Select id="preview_lesson_id" name="preview_lesson_id" defaultValue={course.preview_lesson_id ?? ""}>
              <option value="">— Sem prévia —</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Início" htmlFor="preview_start_seconds" error={e.preview_start_seconds} hint="min:seg">
            <Input
              id="preview_start_seconds"
              name="preview_start_seconds"
              defaultValue={formatDuration(course.preview_start_seconds)}
              placeholder="2:10"
            />
          </Field>
          <Field label="Fim" htmlFor="preview_end_seconds" error={e.preview_end_seconds} hint="min:seg">
            <Input
              id="preview_end_seconds"
              name="preview_end_seconds"
              defaultValue={formatDuration(course.preview_end_seconds)}
              placeholder="2:40"
            />
          </Field>
        </div>
      </Card>

      <div className="border-border bg-bg/95 sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t px-1 py-3 backdrop-blur">
        <SubmitButton>Salvar curso</SubmitButton>
        <FormMessage state={state} className="py-1.5" />
      </div>
    </form>
  );
}
