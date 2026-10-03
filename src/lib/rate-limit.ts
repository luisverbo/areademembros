import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/** Identifica a origem da requisição (IP atrás da Vercel), sem guardar o IP em si. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "desconhecido";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * Limite por origem para formulários públicos. true = pode seguir.
 * Se o banco falhar, deixa passar (o limite por e-mail continua valendo).
 */
export async function allowRequest(route: string, max: number, windowMinutes: number): Promise<boolean> {
  try {
    const key = `${route}:${await clientKey()}`;
    const { data, error } = await createAdminClient().rpc("claim_rate_limit", {
      p_key: key,
      p_max: max,
      p_window: `${windowMinutes} minutes`,
    });
    if (error) {
      console.error("rate limit", error.message);
      return true;
    }
    return data !== false;
  } catch (error) {
    console.error("rate limit", error instanceof Error ? error.message : error);
    return true;
  }
}

export const TOO_MANY = "Muitas tentativas vindas da sua conexão. Aguarde alguns minutos e tente de novo.";
