"use client";

import { useSyncExternalStore } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

// Relógio compartilhado: um tique por segundo (null no servidor).
function subscribeToClock(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
function readClock() {
  return Math.floor(Date.now() / 1000) * 1000;
}

/** "faltam 2d 04h 10min" — atualiza sozinho e avisa quando chega a hora. */
export function Countdown({ to, className }: { to: string; className?: string }) {
  const target = new Date(to).getTime();
  const now = useSyncExternalStore(subscribeToClock, readClock, () => null);

  if (now === null) return null; // evita diferença entre servidor e navegador
  const left = target - now;
  if (left <= 0) {
    return (
      <span className={className}>
        Liberada!{" "}
        <button type="button" className="underline" onClick={() => location.reload()}>
          Atualizar
        </button>
      </span>
    );
  }
  const { d, h, m, s } = parts(left);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={`tabular-nums ${className ?? ""}`}>
      faltam {d > 0 ? `${d}d ` : ""}
      {pad(h)}h {pad(m)}min{d === 0 ? ` ${pad(s)}s` : ""}
    </span>
  );
}
