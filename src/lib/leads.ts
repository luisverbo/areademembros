import "server-only";
import type { TablesUpdate } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateUser } from "@/lib/users";

export type LeadInput = {
  courseId: string;
  name: string | null;
  email: string | null;
  whatsapp: string | null; // já normalizado (+55...)
  consent: boolean;
  utm: Record<string, string>;
};

export type LeadResult = { status: "ok"; userId: string; email: string; isNew: boolean } | { status: "needs_login"; email: string };

/** E-mail técnico para quem se cadastra só com WhatsApp (o Auth exige e-mail). */
export function whatsappOnlyEmail(whatsapp: string): string {
  return `wa${whatsapp.replace(/\D/g, "")}@leads.invalid`;
}

/**
 * Registra o lead do curso grátis: cria ou atualiza a conta e grava a captação.
 * Conta de aluno pagante ou admin NUNCA é aberta só por digitar o e-mail: devolve "needs_login".
 */
export async function captureLead(input: LeadInput): Promise<LeadResult> {
  const admin = createAdminClient();

  let email = input.email?.trim().toLowerCase() ?? null;
  if (!email && input.whatsapp) {
    const { data: byPhone } = await admin.from("profiles").select("email").eq("whatsapp", input.whatsapp).limit(1).maybeSingle();
    email = byPhone?.email ?? whatsappOnlyEmail(input.whatsapp);
  }
  if (!email) throw new Error("lead sem e-mail nem WhatsApp");

  const { data: existing } = await admin
    .from("profiles")
    .select("id, role, full_name, whatsapp, marketing_consent")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    const { count } = await admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", existing.id)
      .in("origin", ["purchase", "manual"]);
    if (existing.role === "admin" || (count ?? 0) > 0) return { status: "needs_login", email };

    const patch: TablesUpdate<"profiles"> = {};
    if (input.name && !existing.full_name) patch.full_name = input.name;
    if (input.whatsapp && existing.whatsapp !== input.whatsapp) patch.whatsapp = input.whatsapp;
    if (input.consent && !existing.marketing_consent) {
      patch.marketing_consent = true;
      patch.marketing_consent_at = new Date().toISOString();
    }
    if (Object.keys(patch).length) await admin.from("profiles").update(patch).eq("id", existing.id);
  }

  const userId =
    existing?.id ?? (await findOrCreateUser({ email, fullName: input.name, whatsapp: input.whatsapp, marketingConsent: input.consent }));

  await admin.from("leads").insert({ user_id: userId, course_id: input.courseId, source: "gratis", utm: input.utm });
  return { status: "ok", userId, email, isNew: !existing };
}
