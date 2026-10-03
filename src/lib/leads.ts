import "server-only";
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

  const { data: existing } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();

  if (existing) {
    const { count } = await admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", existing.id)
      .in("origin", ["purchase", "manual"]);
    if (existing.role === "admin" || (count ?? 0) > 0) return { status: "needs_login", email };
    // Conta já existe: nada no perfil muda por um formulário público (quem digitou pode não ser o dono).
  }

  const userId =
    existing?.id ?? (await findOrCreateUser({ email, fullName: input.name, whatsapp: input.whatsapp, marketingConsent: input.consent }));

  await admin.from("leads").insert({ user_id: userId, course_id: input.courseId, source: "gratis", utm: input.utm });
  return { status: "ok", userId, email, isNew: !existing };
}
