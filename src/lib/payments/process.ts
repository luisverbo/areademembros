import "server-only";
import { createAuthLink } from "@/lib/auth-links";
import { accessEmail, sendEmail } from "@/lib/email";
import { dispatchEvent } from "@/lib/outgoing-webhooks";
import { normalizeWhatsapp } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateUser } from "@/lib/users";
import { adapters, isProviderConfigured } from "./index";
import type { Provider, PurchaseEvent, WebhookContext } from "./types";

export type WebhookOutcome = { status: number; body: Record<string, unknown> };

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Recebe o webhook de uma plataforma: valida, registra (idempotente) e aplica.
 * Responde 2xx para tudo que foi entendido (mesmo ignorado), para a plataforma não reenviar nem desativar o webhook.
 * Responde 5xx só em falha temporária, para a plataforma tentar de novo.
 */
export async function handleWebhook(
  provider: Provider,
  ctx: WebhookContext,
): Promise<{ outcome: WebhookOutcome; after?: () => Promise<void> }> {
  if (!isProviderConfigured(provider)) return { outcome: { status: 503, body: { error: "provider_not_configured" } } };
  const adapter = adapters[provider];
  if (!adapter.verify(ctx)) return { outcome: { status: 401, body: { error: "invalid_signature" } } };

  const event = await adapter.parse(ctx);
  if (!event) return { outcome: { status: 200, body: { ok: true, ignored: true } } };

  const admin = createAdminClient();
  const { data: logged, error: logError } = await admin
    .from("webhook_events")
    .insert({ provider, idempotency_key: event.idempotencyKey, event_type: event.eventType, payload: ctx.json as never })
    .select("id")
    .single();

  let eventRowId = logged?.id ?? null;
  if (logError) {
    if (logError.code !== "23505") throw new Error(`webhook_events: ${logError.message}`);
    // Já recebido: só reprocessa se a tentativa anterior falhou.
    const { data: previous } = await admin
      .from("webhook_events")
      .select("id, status")
      .eq("provider", provider)
      .eq("idempotency_key", event.idempotencyKey)
      .single();
    if (previous?.status !== "failed" && previous?.status !== "received") {
      return { outcome: { status: 200, body: { ok: true, duplicate: true } } };
    }
    eventRowId = previous.id;
  }

  const finish = async (status: "processed" | "ignored" | "failed", error: string | null = null) => {
    await admin.from("webhook_events").update({ status, error, processed_at: new Date().toISOString() }).eq("id", eventRowId!);
  };

  try {
    if (event.kind === "ignored") {
      await finish("ignored");
      return { outcome: { status: 200, body: { ok: true, ignored: true } } };
    }
    const result = event.kind === "approved" ? await applyApproved(admin, event) : await applyRefund(admin, event);
    await finish(result.status, result.note ?? null);
    return { outcome: { status: 200, body: { ok: true, result: result.status } }, after: result.after };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await finish("failed", message.slice(0, 500));
    return { outcome: { status: 500, body: { error: "processing_failed" } } };
  }
}

type Applied = { status: "processed" | "ignored"; note?: string; after?: () => Promise<void> };

async function cohortsForProducts(admin: Admin, event: PurchaseEvent) {
  if (!event.productIds.length) return [];
  const { data } = await admin
    .from("cohort_products")
    .select("cohort_id, cohort:cohorts(id, name, course:courses!cohorts_course_id_fkey(id, title))")
    .eq("provider", event.provider)
    .in("external_product_id", event.productIds);
  return data ?? [];
}

async function applyApproved(admin: Admin, event: PurchaseEvent): Promise<Applied> {
  const links = await cohortsForProducts(admin, event);
  if (!links.length) return { status: "ignored", note: `Produto não ligado a nenhuma turma (${event.productIds.join(", ") || "sem ID"})` };
  if (!event.buyer.email) throw new Error("Compra sem e-mail do comprador");

  const userId = await findOrCreateUser({
    email: event.buyer.email,
    fullName: event.buyer.name,
    whatsapp: event.buyer.phone ? normalizeWhatsapp(event.buyer.phone) : null,
  });

  const newlyActive: { courseTitle: string; cohortId: string }[] = [];
  for (const link of links) {
    const { data: before } = await admin
      .from("enrollments")
      .select("status, expires_at")
      .eq("user_id", userId)
      .eq("cohort_id", link.cohort_id)
      .maybeSingle();
    const wasActive = before?.status === "active" && (!before.expires_at || new Date(before.expires_at) > new Date());

    const { error } = await admin.rpc("enroll_user", {
      p_user_id: userId,
      p_cohort_id: link.cohort_id,
      p_origin: "purchase",
      p_provider: event.provider,
      p_transaction_id: event.transactionId ?? undefined,
    });
    if (error) {
      // Já ativo em outra turma do mesmo curso: o acesso existe, não é falha.
      if (error.message.includes("outra turma deste curso")) continue;
      throw new Error(`enroll_user: ${error.message}`);
    }
    if (!wasActive) newlyActive.push({ courseTitle: link.cohort?.course?.title ?? "seu curso", cohortId: link.cohort_id });
  }

  const email = event.buyer.email;
  return {
    status: "processed",
    note: newlyActive.length ? undefined : "Aluno já tinha acesso",
    after: async () => {
      // E-mail de acesso só quando o acesso nasce agora (evita repetir em CONFIRMED + RECEIVED, renovações etc.).
      if (newlyActive.length) {
        const link = await createAuthLink(email, "password");
        if (link)
          await sendEmail(
            accessEmail(email, link, { name: event.buyer.name, courseTitle: newlyActive.map((n) => n.courseTitle).join(" + ") }),
          );
      }
      await dispatchEvent("purchase.approved", {
        provider: event.provider,
        transaction_id: event.transactionId,
        buyer: event.buyer,
        cohorts: links.map((l) => ({ id: l.cohort_id, name: l.cohort?.name, course: l.cohort?.course?.title })),
      });
    },
  };
}

async function applyRefund(admin: Admin, event: PurchaseEvent): Promise<Applied> {
  let refunded = 0;
  if (event.transactionId) {
    const { data } = await admin
      .from("enrollments")
      .update({ status: "refunded" })
      .eq("provider", event.provider)
      .eq("external_transaction_id", event.transactionId)
      .eq("status", "active")
      .select("id");
    refunded = data?.length ?? 0;
  }

  // Sem a transação gravada (ex.: matrícula manual antes do webhook): procura pelo comprador + turma do produto.
  if (!refunded && event.buyer.email) {
    const { data: profile } = await admin.from("profiles").select("id").eq("email", event.buyer.email).maybeSingle();
    const links = await cohortsForProducts(admin, event);
    if (profile && links.length) {
      const { data } = await admin
        .from("enrollments")
        .update({ status: "refunded" })
        .eq("user_id", profile.id)
        .in(
          "cohort_id",
          links.map((l) => l.cohort_id),
        )
        .eq("status", "active")
        .select("id");
      refunded = data?.length ?? 0;
    }
  }

  if (!refunded) return { status: "ignored", note: "Nenhuma matrícula ativa encontrada para esta venda" };
  return {
    status: "processed",
    after: () =>
      dispatchEvent("purchase.refunded", {
        provider: event.provider,
        transaction_id: event.transactionId,
        buyer: event.buyer,
        enrollments: refunded,
      }),
  };
}
