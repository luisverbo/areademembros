import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Cliente com a service role: IGNORA o RLS. Use só no servidor, em operações de
 * sistema (webhooks, convites, magic link enviado pelo admin) e sempre depois de
 * checar a permissão de quem pediu.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Variável de ambiente ausente: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
