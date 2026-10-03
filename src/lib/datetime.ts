// Todas as datas de negócio são exibidas e digitadas no fuso de São Paulo,
// independentemente do fuso do navegador ou do servidor.
export const BUSINESS_TZ = "America/Sao_Paulo";

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Diferença (ms) entre o relógio do fuso e o UTC naquele instante. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-10-05T19:00" (horário de São Paulo, como vem do <input type="datetime-local">) -> ISO UTC. */
export function zonedInputToIso(value: string, timeZone = BUSINESS_TZ): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Duas passadas resolvem a virada de horário de verão, se um dia voltar a existir.
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone);
  utc = guess - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc).toISOString();
}

/** ISO UTC -> "2026-10-05T19:00" no fuso de São Paulo (valor para <input type="datetime-local">). */
export function isoToZonedInput(iso: string | null | undefined, timeZone = BUSINESS_TZ): string {
  if (!iso) return "";
  const p = partsInZone(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "seg, 05/10 · 19h" — formato curto usado nos avisos de liberação. */
export function formatReleaseDate(iso: string, timeZone = BUSINESS_TZ): string {
  const date = new Date(iso);
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(date).replace(".", "");
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit" }).format(date);
  const p = partsInZone(date, timeZone);
  const time = p.minute === 0 ? `${p.hour}h` : `${p.hour}h${String(p.minute).padStart(2, "0")}`;
  return `${weekday}, ${day} · ${time}`;
}

/** "05/10/2026 19:00" */
export function formatDateTime(iso: string | null | undefined, timeZone = BUSINESS_TZ): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

/** Dias inteiros desde a data (null se não houver data). */
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

/** Data/hora de N dias atrás em ISO (fora do render, para o lint de pureza). */
export function isoDaysAgo(days: number, now = Date.now()): string {
  return new Date(now - days * 86_400_000).toISOString();
}

/** "3 de outubro de 2026" (fuso de São Paulo). */
export function formatLongDate(iso: string, timeZone = BUSINESS_TZ): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone });
}
