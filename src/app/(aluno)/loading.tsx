/** Esqueleto enquanto a página do aluno carrega (vitrine, curso, aula). */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Carregando" className="flex flex-col gap-10 pb-16">
      <div className="bg-surface border-border h-[340px] animate-pulse border-b md:h-[min(60vh,560px)]" />
      <div className="flex flex-col gap-3 px-4 md:px-10">
        <div className="bg-surface-2 h-6 w-48 animate-pulse rounded-md" />
        <div className="flex gap-3 overflow-hidden md:gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="bg-surface aspect-video w-[220px] shrink-0 animate-pulse rounded-[var(--radius-card)] sm:w-[280px] lg:w-[320px]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
