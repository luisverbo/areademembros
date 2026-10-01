import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";

export type Embed = { provider: "bunny" | "youtube"; src: string } | null;

const BUNNY_TOKEN_TTL_SECONDS = 6 * 60 * 60;

/**
 * URL do player embutido.
 *  - Bunny: link assinado com validade (Token Authentication do Bunny Stream). Sem a chave
 *    configurada, gera o link simples (só para teste; em produção a chave é obrigatória).
 *  - YouTube: vídeo não listado (liberado também para aulas pagas até a conta do Bunny).
 */
export function embedFor(provider: "bunny" | "youtube", videoId: string | null): Embed {
  if (!videoId) return null;

  if (provider === "youtube") {
    const params = new URLSearchParams({ enablejsapi: "1", rel: "0", modestbranding: "1", playsinline: "1", origin: env.siteUrl });
    return { provider, src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params}` };
  }

  const libraryId = process.env.BUNNY_LIBRARY_ID;
  if (!libraryId) return null;
  const params = new URLSearchParams({ autoplay: "false", preload: "true", responsive: "true" });
  const tokenKey = process.env.BUNNY_TOKEN_KEY;
  if (tokenKey) {
    const expires = Math.floor(Date.now() / 1000) + BUNNY_TOKEN_TTL_SECONDS;
    params.set("token", bunnyToken(tokenKey, videoId, expires));
    params.set("expires", String(expires));
  }
  return {
    provider,
    src: `https://iframe.mediadelivery.net/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(videoId)}?${params}`,
  };
}

/** SHA256_HEX(chave + videoId + expiração), conforme a documentação do Bunny Stream (embed view token). */
export function bunnyToken(tokenKey: string, videoId: string, expires: number): string {
  return createHash("sha256").update(`${tokenKey}${videoId}${expires}`).digest("hex");
}
