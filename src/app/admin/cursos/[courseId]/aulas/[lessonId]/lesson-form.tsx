"use client";

import { useActionState, useState } from "react";
import { ImageUpload } from "@/components/admin/image-upload";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Tables } from "@/lib/database.types";
import { formatDuration } from "@/lib/forms";
import { updateLesson } from "./actions";

type Props = {
  courseId: string;
  lesson: Tables<"lessons">;
  content: Pick<Tables<"lesson_contents">, "video_provider" | "video_id"> | null;
  modules: { id: string; title: string }[];
};

export function LessonForm({ courseId, lesson, content, modules }: Props) {
  const [state, action] = useActionState(updateLesson.bind(null, lesson.id, courseId), undefined);
  const [provider, setProvider] = useState(content?.video_provider ?? "bunny");
  const e = state?.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Aula" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Título" htmlFor="title" error={e.title}>
            <Input id="title" name="title" defaultValue={lesson.title} required />
          </Field>
          <Field label="Módulo" htmlFor="module_id" error={e.module_id}>
            <Select id="module_id" name="module_id" defaultValue={lesson.module_id}>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição" htmlFor="description" className="md:col-span-2">
            <Textarea id="description" name="description" defaultValue={lesson.description ?? ""} rows={3} />
          </Field>
          <div className="flex flex-col gap-3 md:col-span-2">
            <Checkbox name="is_published" defaultChecked={lesson.is_published} label="Publicada" />
            <Checkbox name="is_free" defaultChecked={lesson.is_free} label="Aula grátis (qualquer pessoa cadastrada assiste)" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Vídeo" description="O vídeo fica no Bunny Stream ou no YouTube (não listado). Nunca no nosso servidor." />
        <div className="grid gap-4 md:grid-cols-[1fr_2fr_1fr]">
          <Field label="Onde está" htmlFor="video_provider" error={e.video_provider}>
            <Select
              id="video_provider"
              name="video_provider"
              value={provider}
              onChange={(ev) => setProvider(ev.target.value as typeof provider)}
            >
              <option value="bunny">Bunny Stream</option>
              <option value="youtube">YouTube (não listado)</option>
            </Select>
          </Field>
          <Field
            label={provider === "bunny" ? "ID do vídeo no Bunny" : "ID ou link do YouTube"}
            htmlFor="video_id"
            error={e.video_id}
            hint={
              provider === "bunny"
                ? "Pode colar o link de embed; pegamos o ID."
                : "Cole o link do vídeo. No YouTube, deixe o vídeo como Não listado (privado não toca no site)."
            }
          >
            <Input id="video_id" name="video_id" defaultValue={content?.video_id ?? ""} autoComplete="off" />
          </Field>
          <Field label="Duração" htmlFor="duration_seconds" error={e.duration_seconds} hint="min:seg">
            <Input
              id="duration_seconds"
              name="duration_seconds"
              defaultValue={formatDuration(lesson.duration_seconds)}
              placeholder="42:10"
            />
          </Field>
        </div>
        {provider === "youtube" ? (
          <p className="border-border bg-surface-2 text-fg-soft mt-4 rounded-lg border px-3 py-2 text-sm">
            Aviso: no YouTube, quem tiver o link do vídeo consegue assistir fora da área de membros. Para aulas pagas, o Bunny protege
            melhor; dá para trocar depois, aula por aula.
          </p>
        ) : null}
        <div className="mt-4 max-w-sm">
          <ImageUpload
            name="thumbnail_url"
            label="Miniatura"
            folder={`lessons/${lesson.id}`}
            defaultUrl={lesson.thumbnail_url}
            aspect={16 / 9}
            hint="16:9 · ex.: 1280×720"
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Botão de oferta no vídeo" description="Aparece no minuto escolhido. Deixe vazio para não mostrar." />
        <div className="grid gap-4 md:grid-cols-[1fr_2fr_2fr]">
          <Field label="Aparece em" htmlFor="offer_at_seconds" error={e.offer_at_seconds} hint="min:seg">
            <Input
              id="offer_at_seconds"
              name="offer_at_seconds"
              defaultValue={formatDuration(lesson.offer_at_seconds)}
              placeholder="15:00"
            />
          </Field>
          <Field label="Texto do botão" htmlFor="offer_label">
            <Input id="offer_label" name="offer_label" defaultValue={lesson.offer_label ?? ""} placeholder="Conheça o curso X" />
          </Field>
          <Field label="Link" htmlFor="offer_url" error={e.offer_url}>
            <Input id="offer_url" name="offer_url" type="url" defaultValue={lesson.offer_url ?? ""} placeholder="https://…" />
          </Field>
        </div>
      </Card>

      <div className="border-border bg-bg/95 sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t px-1 py-3 backdrop-blur">
        <SubmitButton>Salvar aula</SubmitButton>
        <FormMessage state={state} className="py-1.5" />
      </div>
    </form>
  );
}
