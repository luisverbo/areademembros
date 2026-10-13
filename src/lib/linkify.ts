/** Separa o texto em pedaços de texto e links (http/https, ou www.), para deixar links clicáveis. */
export type TextPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
// Pontuação no fim normalmente é da frase, não do link: "veja https://x.com/a." → link sem o ponto.
const TRAILING = /[.,;:!?)\]}'"»]+$/;

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    let url = match[0];
    const trailing = url.match(TRAILING)?.[0] ?? "";
    // Mantém ")" quando o link tem "(" (ex.: links da Wikipédia).
    const keepParen = trailing.startsWith(")") && url.includes("(");
    if (trailing && !keepParen) url = url.slice(0, -trailing.length);
    const start = match.index;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "link", value: url, href: url.toLowerCase().startsWith("www.") ? `https://${url}` : url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
