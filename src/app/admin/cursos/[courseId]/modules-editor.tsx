import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/field";
import { formatDuration } from "@/lib/forms";
import { ImageUpload } from "@/components/admin/image-upload";
import { Textarea } from "@/components/ui/field";
import { createLesson, createModule, deleteModule, moveLesson, moveModule, updateModule } from "../actions";

type Lesson = { id: string; title: string; position: number; is_published: boolean; is_free: boolean; duration_seconds: number | null };
type Module = { id: string; title: string; description: string | null; cover_url: string | null; position: number; lessons: Lesson[] };

const arrow = "flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-border hover:text-fg disabled:opacity-30";

export function ModulesEditor({ courseId, modules }: { courseId: string; modules: Module[] }) {
  return (
    <Card>
      <CardHeader title="Módulos e aulas" description="A ordem aqui é a ordem padrão do curso." />
      <div className="flex flex-col gap-4">
        {modules.map((module, mi) => (
          <div key={module.id} className="border-border bg-surface-2 rounded-lg border">
            <div className="border-border flex flex-wrap items-center gap-2 border-b p-3">
              <div className="flex">
                <form action={moveModule.bind(null, module.id, courseId, "up")}>
                  <button className={arrow} disabled={mi === 0} aria-label="Subir módulo">
                    ↑
                  </button>
                </form>
                <form action={moveModule.bind(null, module.id, courseId, "down")}>
                  <button className={arrow} disabled={mi === modules.length - 1} aria-label="Descer módulo">
                    ↓
                  </button>
                </form>
              </div>
              <p className="min-w-0 flex-1 truncate font-semibold">
                <span className="text-fg-muted mr-1.5 tabular-nums">{mi + 1}.</span>
                {module.title}
              </p>
              {module.cover_url ? <Badge>Com banner</Badge> : <Badge tone="muted">Sem banner</Badge>}
              <form action={deleteModule.bind(null, module.id, courseId)}>
                <ConfirmSubmit
                  size="sm"
                  variant="danger"
                  message={`Excluir o módulo “${module.title}” e TODAS as suas ${module.lessons.length} aulas?`}
                >
                  Excluir
                </ConfirmSubmit>
              </form>
            </div>

            <details className="border-border group border-b">
              <summary className="text-fg-soft hover:text-fg flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
                <span>Nome, descrição e banner do módulo</span>
                <span className="text-fg-muted text-xs">editar</span>
              </summary>
              <form action={updateModule.bind(null, module.id, courseId)} className="grid gap-3 p-3 md:grid-cols-[1fr_260px]">
                <div className="flex flex-col gap-3">
                  <Input name="title" defaultValue={module.title} aria-label="Nome do módulo" required />
                  <Textarea
                    name="description"
                    defaultValue={module.description ?? ""}
                    aria-label="Descrição do módulo"
                    placeholder="Uma frase sobre o que este módulo ensina (aparece no banner)."
                    className="min-h-20"
                    maxLength={600}
                  />
                  <Button type="submit" size="sm" variant="secondary" className="self-start">
                    Salvar módulo
                  </Button>
                </div>
                <ImageUpload
                  name="cover_url"
                  label="Banner do módulo (16:9)"
                  folder={`courses/${courseId}/modules/${module.id}`}
                  defaultUrl={module.cover_url}
                  aspect={16 / 9}
                  hint="1280×720. Clique em Salvar módulo para aplicar."
                />
              </form>
            </details>

            <ul className="divide-border divide-y">
              {module.lessons.map((lesson, li) => (
                <li key={lesson.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex">
                    <form action={moveLesson.bind(null, lesson.id, courseId, "up")}>
                      <button className={arrow} disabled={li === 0} aria-label="Subir aula">
                        ↑
                      </button>
                    </form>
                    <form action={moveLesson.bind(null, lesson.id, courseId, "down")}>
                      <button className={arrow} disabled={li === module.lessons.length - 1} aria-label="Descer aula">
                        ↓
                      </button>
                    </form>
                  </div>
                  <Link
                    href={`/admin/cursos/${courseId}/aulas/${lesson.id}`}
                    className="hover:text-accent-soft min-w-0 flex-1 truncate text-sm"
                  >
                    {lesson.title}
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {lesson.duration_seconds ? (
                      <span className="text-fg-muted text-xs">{formatDuration(lesson.duration_seconds)}</span>
                    ) : null}
                    {lesson.is_free ? <Badge>Grátis</Badge> : null}
                    {!lesson.is_published ? <Badge tone="muted">Rascunho</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>

            <form action={createLesson.bind(null, module.id, courseId)} className="flex gap-2 p-3">
              <Input name="title" placeholder="Título da nova aula" aria-label="Título da nova aula" className="h-8" required />
              <Button type="submit" size="sm" variant="secondary">
                + Aula
              </Button>
            </form>
          </div>
        ))}

        <form action={createModule.bind(null, courseId)} className="flex gap-2">
          <Input name="title" placeholder="Nome do novo módulo" aria-label="Nome do novo módulo" required />
          <Button type="submit" variant="secondary">
            + Módulo
          </Button>
        </form>
      </div>
    </Card>
  );
}
