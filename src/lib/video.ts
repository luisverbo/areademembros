export type VideoProvider = "bunny" | "youtube";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Aceita o ID puro ou o link colado do painel e devolve só o ID.
 *  - Bunny: GUID do vídeo (também extrai de links iframe.mediadelivery.net/embed/<lib>/<guid>)
 *  - YouTube: 11 caracteres (também extrai de youtube.com/watch?v=, youtu.be/, /embed/, /shorts/)
 */
export function normalizeVideoId(provider: VideoProvider, input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (provider === "bunny") {
    const match = UUID.exec(value.split("?")[0].split("/").pop() ?? "") ?? UUID.exec(value);
    return match ? match[0].toLowerCase() : null;
  }

  if (YOUTUBE_ID.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null;
    }
    return id && YOUTUBE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}
