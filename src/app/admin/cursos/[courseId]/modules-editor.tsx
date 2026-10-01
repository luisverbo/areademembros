import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/field";
import { formatDuration } from "@/lib/forms";
import { createLesson, createModule, deleteModule, moveLesson, moveModule, renameModule } from "../actions";

type Lesson = { id: string; title: string; position: number; is_published: boolean; is_free: boolean; duration_seconds: number | null };
type Module = { id: string; title: string; position: number; lessons: Lesson[] };

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
              <form action={renameModule.bind(null, module.id, courseId)} className="flex min-w-48 flex-1 gap-2">
                <Input name="title" defaultValue={module.title} aria-label="Nome do módulo" className="h-8 font-semibold" />
                <Button type="submit" size="sm" variant="secondary">
                  Renomear
                </Button>
              </form>
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
                  <Link href={`/admin/cursos/${courseId}/aulas/${lesson.id}`} className="hover:text-accent min-w-0 flex-1 truncate text-sm">
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
