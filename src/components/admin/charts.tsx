// Gráficos simples (uma série cada), desenhados com HTML/CSS no servidor.
// Barras finas, ponta arredondada, valor no hover (e no foco, pelo teclado).

type Point = { label: string; value: number; detail?: string };

/** Barras verticais por período (ex.: semanas). */
export function ColumnChart({ points, title, unit }: { points: Point[]; title: string; unit: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((sum, p) => sum + p.value, 0);
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-fg-muted text-xs tabular-nums">{total} no período</span>
      </figcaption>
      <div className="border-border relative flex h-36 items-end gap-1.5 border-b" role="list" aria-label={title}>
        {points.map((p) => (
          <div
            key={p.label}
            role="listitem"
            tabIndex={0}
            className="group relative flex h-full flex-1 items-end outline-none"
            aria-label={`${p.label}: ${p.value} ${unit}`}
          >
            <div
              className="bg-accent/85 group-hover:bg-accent group-focus-visible:bg-accent w-full rounded-t-[4px] transition-colors"
              style={{ height: `${p.value ? Math.max(3, (p.value / max) * 100) : 0}%` }}
            />
            <span className="border-border bg-surface-2 text-fg pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-lg group-hover:block group-focus-visible:block">
              <b className="tabular-nums">{p.value}</b> {unit} · {p.label}
            </span>
          </div>
        ))}
      </div>
      <div className="text-fg-muted flex gap-1.5 text-[10px]">
        {points.map((p, i) => (
          <span key={p.label} className="flex-1 text-center tabular-nums">
            {i % 2 === 0 || points.length <= 6 ? p.label : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Barras horizontais em porcentagem (ex.: % que concluiu cada aula), com rótulo à direita. */
export function PercentBars({ rows, label }: { rows: { key: string; label: string; percent: number; note: string }[]; label: string }) {
  return (
    <ol className="flex flex-col gap-2" aria-label={label}>
      {rows.map((r, i) => (
        <li
          key={r.key}
          tabIndex={0}
          className="group grid grid-cols-[1.5rem_minmax(0,14rem)_1fr_3rem] items-center gap-3 text-sm outline-none max-md:grid-cols-[1.5rem_1fr_3rem]"
        >
          <span className="text-fg-muted text-right text-xs tabular-nums">{i + 1}</span>
          <span className="truncate max-md:col-span-2" title={r.label}>
            {r.label}
          </span>
          <span className="bg-surface-2 relative h-2.5 rounded-full max-md:col-start-2">
            <span
              className="bg-accent/85 group-hover:bg-accent group-focus-visible:bg-accent absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.min(100, Math.max(r.percent ? 2 : 0, r.percent))}%` }}
            />
            <span className="border-border bg-surface-2 text-fg pointer-events-none absolute -top-8 left-0 z-10 hidden rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-lg group-hover:block group-focus-visible:block">
              {r.note}
            </span>
          </span>
          <span className="text-right font-semibold tabular-nums">{Math.round(r.percent)}%</span>
        </li>
      ))}
    </ol>
  );
}

export function StatTile({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-fg-muted text-sm">{label}</p>
      <p className="font-display mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="text-fg-muted mt-1 text-xs">{hint}</p> : null}
    </>
  );
  const cls = "rounded-[var(--radius-card)] border border-border bg-surface p-4";
  return href ? (
    <a href={href} className={`${cls} hover:border-fg-muted`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
