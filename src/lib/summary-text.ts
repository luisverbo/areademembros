import { formatTimestamp, timestampToSeconds } from "@/lib/transcript";

export type SummaryPoint = { title: string; detail: string; start_seconds: number | null };

/**
 * Resumo escrito pelo admin, um ponto por linha:
 *   "2:30 Conectar o WhatsApp — ligando o número na ferramenta"
 * O minuto é opcional; o detalhe vem depois de " — ", " - " ou ":".
 */
export function parseSummaryLines(text: string): SummaryPoint[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((line) => {
      const m = /^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–—]?\s*(.*)$/.exec(line);
      const start = m ? timestampToSeconds(m[1]) : null;
      const rest = (m ? m[2] : line).trim();
      const [title, ...detail] = rest.split(/\s+[—–-]\s+|:\s+/);
      return { title: title.trim(), detail: detail.join(" — ").trim(), start_seconds: start };
    })
    .filter((p) => p.title);
}

export function summaryToLines(points: SummaryPoint[] | undefined | null): string {
  return (points ?? [])
    .map((p) => `${p.start_seconds !== null ? `${formatTimestamp(p.start_seconds)} ` : ""}${p.title}${p.detail ? ` — ${p.detail}` : ""}`)
    .join("\n");
}

export function parseChecklistLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*([-•*]|\[\s?\]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 15);
}
