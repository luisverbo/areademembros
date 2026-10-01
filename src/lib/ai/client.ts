import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Modelo padrão da área. Com "fallbacks: default", se o modelo recusar por política,
// a própria API refaz o pedido no modelo indicado pela Anthropic.
export const AI_MODEL = "claude-opus-5-5";
export const AI_BETAS = ["server-side-fallback-2026-07-01"];

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
export function aiClient(): Anthropic {
  client ??= new Anthropic(); // lê ANTHROPIC_API_KEY
  return client;
}
