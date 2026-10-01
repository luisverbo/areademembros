import Link from "next/link";

/** Faixa mostrada só ao admin nas páginas do aluno: deixa claro que é uma prévia. */
export function AdminPreviewBar({ editHref, drafts }: { editHref: string; drafts: string[] }) {
  return (
    <div className="border-border bg-surface-2 text-fg-soft flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs md:px-10">
      <p>
        <span className="bg-accent mr-2 rounded px-1.5 py-0.5 font-bold text-white uppercase">Prévia</span>
        Você está vendo como aluno, com todas as aulas liberadas.
        {drafts.length ? <span className="text-fg-muted"> Em rascunho (aluno não vê): {drafts.join(", ")}.</span> : null}
      </p>
      <Link href={editHref} className="text-fg hover:text-accent font-semibold">
        Editar no admin →
      </Link>
    </div>
  );
}
