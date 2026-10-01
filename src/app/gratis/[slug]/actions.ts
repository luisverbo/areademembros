"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { sendAuthEmail } from "@/lib/auth-emails";
import { env } from "@/lib/env";
import { leadFieldsFor } from "@/lib/lead-fields";
import { captureLead } from "@/lib/leads";
import { dispatchEvent } from "@/lib/outgoing-webhooks";
import { normalizeWhatsapp } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LeadFormState = FormState & { loginHref?: string };

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export async function submitLead(slug: string, _prev: LeadFormState | undefined, formData: FormData): Promise<LeadFormState> {
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, title, is_free, is_published, lead_fields, lead_access")
    .eq("slug", slug)
    .maybeSingle();
  if (!course || !course.is_free || !course.is_published) return { ok: false, message: "Este curso não está disponível." };

  const fields = leadFieldsFor(course.lead_fields);
  const errors: Record<string, string[]> = {};
  const name =
    String(formData.get("name") ?? "")
      .trim()
      .slice(0, 120) || null;
  const emailRaw = String(formData.get("email") ?? "").trim();
  const whatsappRaw = String(formData.get("whatsapp") ?? "").trim();
  const consent = formData.get("consent") === "on";

  if (fields.name && !name) errors.name = ["Informe seu nome."];
  const email = fields.email ? z.email().safeParse(emailRaw.toLowerCase()) : null;
  if (fields.email && !email?.success) errors.email = ["Informe um e-mail válido."];
  const whatsapp = fields.whatsapp ? normalizeWhatsapp(whatsappRaw) : null;
  if (fields.whatsapp && !whatsapp) errors.whatsapp = ["Informe um WhatsApp válido, com DDD."];
  if (!consent) errors.consent = ["Para liberar o acesso, aceite receber nossas mensagens."];
  if (Object.keys(errors).length) return { ok: false, errors };

  const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, String(formData.get(k) ?? "").slice(0, 200)]).filter(([, v]) => v)) as Record<
    string,
    string
  >;

  const result = await captureLead({
    courseId: course.id,
    name,
    email: email?.success ? email.data : null,
    whatsapp,
    consent,
    utm,
  });

  const next = `/curso/${course.slug}`;
  if (result.status === "needs_login") {
    return {
      ok: false,
      message: "Este e-mail já tem acesso à área de membros. Entre com sua senha para assistir.",
      loginHref: `/entrar?next=${encodeURIComponent(next)}`,
    };
  }

  // Avisa o funil (FunilPro etc.) depois de responder ao visitante.
  after(() =>
    dispatchEvent("lead.created", {
      lead: { name, email: email?.success ? email.data : null, whatsapp, marketing_consent: consent, is_new: result.isNew },
      course: { id: course.id, slug: course.slug, title: course.title, url: `${env.siteUrl}/gratis/${course.slug}` },
      utm,
    }),
  );

  // Só WhatsApp não tem e-mail para confirmar: entra direto.
  const direct = course.lead_access === "direct" || !fields.email;
  if (direct) {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: result.email });
    const tokenHash = data?.properties?.hashed_token;
    const { error } = tokenHash
      ? await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash })
      : { error: new Error("no token") };
    if (error) {
      console.error("lead direct sign-in", error);
      return { ok: false, message: "Cadastro feito, mas não conseguimos abrir o curso agora. Tente de novo em instantes." };
    }
    redirect(next);
  }

  const sent = await sendAuthEmail(result.email, "login", next);
  if (sent === "not_configured") {
    await supabase.auth.signInWithOtp({
      email: result.email,
      options: { shouldCreateUser: false, emailRedirectTo: `${env.siteUrl}/auth/confirm?next=${encodeURIComponent(next)}` },
    });
  }
  return { ok: true, message: `Pronto! Enviamos o link de acesso para ${result.email}. Abra seu e-mail para assistir.` };
}
