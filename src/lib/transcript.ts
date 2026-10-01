// Leitura de transcrições: legendas WebVTT (.vtt), SubRip (.srt), texto com minutos
// ("[12:30] texto" ou "12:30 texto") ou texto corrido (sem minutos).

export type Segment = { start: number; end: number | null; text: string };

const CUE_TIME = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const ARROW = /-->/;

function cueSeconds(value: string): number {
  const m = CUE_TIME.exec(value);
  if (!m) return NaN;
  const h = m[1] ? Number(m[1].slice(0, -1)) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "") // tags de estilo da legenda (<c>, <i>, <00:00:01.000>)
    .replace(/\{\\an\d\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Legendas (.vtt/.srt): blocos com "início --> fim" seguidos do texto. */
function parseCues(input: string): Segment[] {
  const segments: Segment[] = [];
  const blocks = input.replace(/\r/g, "").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeIndex = lines.findIndex((l) => ARROW.test(l));
    if (timeIndex < 0) continue;
    const [from, to] = lines[timeIndex].split(ARROW);
    const start = cueSeconds(from);
    if (Number.isNaN(start)) continue;
    const end = cueSeconds(to ?? "");
    const text = cleanText(lines.slice(timeIndex + 1).join(" "));
    if (!text) continue;
    // Legendas automáticas repetem a linha anterior; descarta repetição exata.
    if (segments.at(-1)?.text === text) continue;
    segments.push({ start, end: Number.isNaN(end) ? null : end, text });
  }
  return segments;
}

const LINE_TIME = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–—:]?\s*(.+)$/;

function lineSeconds(stamp: string): number {
  const parts = stamp.split(":").map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

/** Texto com minutos no começo da linha. */
function parseStampedLines(input: string): Segment[] {
  const segments: Segment[] = [];
  for (const raw of input.replace(/\r/g, "").split("\n")) {
    const m = LINE_TIME.exec(raw);
    if (m) {
      segments.push({ start: lineSeconds(m[1]), end: null, text: cleanText(m[2]) });
    } else if (raw.trim() && segments.length) {
      segments[segments.length - 1].text += ` ${cleanText(raw)}`;
    }
  }
  return segments.filter((s) => s.text);
}

/** Junta trechos curtos em blocos de ~30 s (melhor para busca e para a IA). */
export function mergeSegments(segments: Segment[], targetSeconds = 30, maxChars = 900): Segment[] {
  const merged: Segment[] = [];
  for (const seg of segments) {
    const last = merged.at(-1);
    if (last && seg.start - last.start < targetSeconds && last.text.length + seg.text.length < maxChars) {
      last.text = `${last.text} ${seg.text}`;
      last.end = seg.end ?? last.end;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

export type ParsedTranscript = { segments: Segment[]; hasTimestamps: boolean; text: string };

export function parseTranscript(input: string): ParsedTranscript {
  const source = input.trim();
  if (!source) return { segments: [], hasTimestamps: false, text: "" };

  let segments: Segment[] = [];
  if (ARROW.test(source)) segments = parseCues(source);
  if (!segments.length) {
    const stamped = parseStampedLines(source);
    // Considera "com minutos" se a maior parte das linhas tiver horário.
    const lines = source.split("\n").filter((l) => l.trim()).length;
    if (stamped.length >= Math.max(2, lines * 0.3)) segments = stamped;
  }

  if (segments.length) {
    const merged = mergeSegments(segments);
    return { segments: merged, hasTimestamps: true, text: merged.map((s) => s.text).join("\n") };
  }

  // Texto corrido: divide em parágrafos, sem minutos.
  const paragraphs = source
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map(cleanText)
    .filter(Boolean);
  return { segments: paragraphs.map((text) => ({ start: 0, end: null, text })), hasTimestamps: false, text: paragraphs.join("\n") };
}

/** "754" -> "12:34"; "3723" -> "1:02:03" */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Transcrição no formato enviado à IA: uma linha por trecho, com o minuto. */
export function transcriptForPrompt(segments: { start_seconds: number; text: string }[], hasTimestamps = true): string {
  return segments.map((s) => (hasTimestamps ? `[${formatTimestamp(s.start_seconds)}] ${s.text}` : s.text)).join("\n");
}

/** Acha "[12:34]" ou "[1:02:03]" num texto (citações de minuto da IA). */
export const TIMESTAMP_PATTERN = /\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]/g;

export function timestampToSeconds(stamp: string): number {
  return lineSeconds(stamp);
}
