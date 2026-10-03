/** Esqueleto das páginas do admin. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-6">
      <div className="bg-surface-2 h-8 w-64 animate-pulse rounded-md" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-surface border-border h-24 animate-pulse rounded-[var(--radius-card)] border" />
        ))}
      </div>
      <div className="bg-surface border-border h-72 animate-pulse rounded-[var(--radius-card)] border" />
    </div>
  );
}
