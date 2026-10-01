"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/** Sai da lista: não recebe mais mensagens da Central (e retira o aceite de promoções). */
export async function unsubscribe(token: string, resubscribe = false): Promise<boolean> {
  if (!z.uuid().safeParse(token).success) return false;
  const admin = createAdminClient();
  const patch = resubscribe ? { messages_opt_out_at: null } : { messages_opt_out_at: new Date().toISOString(), marketing_consent: false };
  const { data } = await admin.from("profiles").update(patch).eq("unsubscribe_token", token).select("id");
  return Boolean(data?.length);
}
