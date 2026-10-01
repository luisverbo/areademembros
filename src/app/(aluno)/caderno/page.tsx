import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getNotebook } from "@/lib/notes-data";
import { NotebookView } from "./notebook-view";

export const metadata: Metadata = { title: "Meu Caderno" };

export default async function NotebookPage() {
  const profile = await requireUser();
  const courses = await getNotebook(profile.id);
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Meu Caderno</h1>
        <p className="mt-1 text-fg-muted">Todas as suas anotações, com o minuto da aula. Clique no minuto para voltar ao ponto do vídeo.</p>
      </div>
      <NotebookView courses={courses} />
    </main>
  );
}
