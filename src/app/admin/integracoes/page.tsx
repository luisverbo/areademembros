import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { isEmailConfigured } from "@/lib/email";
import { env } from "@/lib/env";
import { providerLabels } from "@/lib/labels";
import { OUTGOING_EVENTS } from "@/lib/outgoing-webhooks";
import { adapters, isProviderConfigured } from "@/lib/payments";
import type { Provider } from "@/lib/payments/types";
import { createClient } from "@/lib/supabase/server";
import { deleteOutgoingWebhook, toggleOutgoingWebhook } from "./actions";
import { CopyField, NewWebhookForm, SecretField, TestButton } from "./forms";

export const metadata: Metadata = { title: "Integrações" };

/** Onde colar a URL e o que copiar de cada plataforma. */
const HOW_TO: Record<Provider, string> = {
  kiwify: "Kiwify → Apps → Webhooks → Criar webhook. Cole a URL, marque Compra aprovada, Reembolso e Chargeback. Copie o Token gerado.",
  hotmart: "Hotmart → Ferramentas → Webhook (API e notificações). Cole a URL (versão 2.0.0) e copie o Hottok.",
  yampi: "Yampi → Configurações → Webhooks. Cole a URL, marque Pedido pago e Status do pedido atualizado. Copie a chave secreta.",
  mercadopago:
    "Mercado Pago → Suas integrações → sua aplicação → Webhooks. Cole a URL, marque Pagamentos e copie a Assinatura secreta. O Access Token fica em Credenciais de produção. No produto da turma, use a referência externa do link de pagamento.",
  asaas:
    "Asaas → Integrações → Webhooks → Cobranças. Cole a URL, crie um token de autenticação (32+ caracteres) e copie. A chave da API fica em Integrações → Chave de API. No produto da turma, use o ID do link de pagamento.",
};

const eventLabel = Object.fromEntries(OUTGOING_EVENTS.map((e) => [e.id, e.label]));
const statusTone = { processed: "neutral", ignored: "muted", failed: "accent", received: "muted" } as const;
const statusLabel = { processed: "Processado", ignored: "Ignorado", failed: "Falhou", received: "Recebido" } as const;

export default async function IntegrationsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: hooks }, { data: deliveries }, { data: events }] = await Promise.all([
    supabase.from("outgoing_webhooks").select("*").order("created_at"),
    supabase
      .from("webhook_deliveries")
      .select("id, webhook_id, event, status_code, error, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("webhook_events")
      .select("id, provider, event_type, status, error, received_at")
      .order("received_at", { ascending: false })
      .limit(20),
  ]);
  const providers = Object.keys(adapters) as Provider[];
  const hookName = Object.fromEntries((hooks ?? []).map((h) => [h.id, h.name]));

  return (
    <>
      <PageHeader title="Integrações" description="Pagamentos que liberam o acesso, e-mails e avisos para o seu funil." />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader
            title="Plataformas de pagamento"
            description="Cole a URL no painel da plataforma. As chaves vão nas variáveis de ambiente da Vercel (Settings → Environment Variables) e valem depois de um Redeploy."
          />
          <ul className="divide-border flex flex-col divide-y">
            {providers.map((p) => {
              const ready = isProviderConfigured(p);
              const missing = adapters[p].requiredEnv.filter((name) => !process.env[name]);
              return (
                <li key={p} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{providerLabels[p]}</span>
                    {ready ? <Badge>Ativa</Badge> : <Badge tone="muted">Falta configurar</Badge>}
                  </div>
                  <CopyField value={`${env.siteUrl}/api/webhooks/${p}`} label={`Copiar URL do webhook ${providerLabels[p]}`} />
                  <p className="text-fg-muted text-xs">{HOW_TO[p]}</p>
                  {missing.length ? (
                    <p className="text-fg-soft text-xs">
                      Variáveis que faltam:{" "}
                      {missing.map((m) => (
                        <code key={m} className="bg-surface-2 mr-1.5 rounded px-1.5 py-0.5">
                          {m}
                        </code>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="E-mail (Resend)"
            description="Envia os e-mails de acesso, de criar senha e de boas-vindas da compra, com a identidade da área."
          />
          {isEmailConfigured() ? (
            <p className="text-fg-soft text-sm">
              <Badge>Ativo</Badge> <span className="ml-2">Enviando como {process.env.EMAIL_FROM}</span>
            </p>
          ) : (
            <p className="text-fg-soft text-sm">
              <Badge tone="muted">Falta configurar</Badge>
              <span className="ml-2">
                Variáveis: <code className="bg-surface-2 rounded px-1.5 py-0.5">RESEND_API_KEY</code>{" "}
                <code className="bg-surface-2 rounded px-1.5 py-0.5">EMAIL_FROM</code>. Enquanto isso, só o login e a troca de senha usam o
                e-mail padrão do Supabase, e o e-mail de boas-vindas da compra não é enviado.
              </span>
            </p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Webhooks de saída"
            description="A área avisa outro sistema (FunilPro, n8n, Make…) a cada lead ou venda. Cada aviso vai assinado no cabeçalho X-LC-Signature (sha256=HMAC do corpo com o segredo)."
          />
          {hooks?.length ? (
            <ul className="mb-5 flex flex-col gap-3">
              {hooks.map((h) => (
                <li key={h.id} className="border-border bg-surface-2 flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {h.name} {!h.is_active ? <Badge tone="muted">Pausado</Badge> : null}
                    </span>
                    <div className="flex items-center gap-2">
                      <form action={toggleOutgoingWebhook.bind(null, h.id, !h.is_active)}>
                        <button className="text-fg-muted hover:text-fg text-xs font-semibold">{h.is_active ? "Pausar" : "Ativar"}</button>
                      </form>
                      <form action={deleteOutgoingWebhook.bind(null, h.id)}>
                        <ConfirmSubmit variant="ghost" size="sm" message={`Excluir o webhook “${h.name}”?`}>
                          Excluir
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </div>
                  <p className="text-fg-soft truncate text-xs">{h.url}</p>
                  <p className="text-fg-muted text-xs">{h.events.map((e) => eventLabel[e] ?? e).join(" · ")}</p>
                  <SecretField secret={h.secret} />
                  <TestButton id={h.id} />
                </li>
              ))}
            </ul>
          ) : null}
          <NewWebhookForm events={OUTGOING_EVENTS} />
          {deliveries?.length ? (
            <div className="mt-6">
              <h3 className="text-fg-soft mb-2 text-sm font-semibold">Últimos envios</h3>
              <ul className="divide-border divide-y text-xs">
                {deliveries.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-fg-soft">
                      {hookName[d.webhook_id] ?? "—"} · {eventLabel[d.event] ?? d.event}
                    </span>
                    <span className={d.error ? "text-accent" : "text-fg-muted"}>
                      {d.error ? d.error : `HTTP ${d.status_code}`} · {formatDateTime(d.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Últimos avisos de pagamento" description="O que as plataformas mandaram e o que a área fez com cada aviso." />
          {events?.length ? (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-border text-fg-muted border-y text-left text-xs">
                    <th className="px-5 py-2 font-medium">Plataforma</th>
                    <th className="py-2 font-medium">Evento</th>
                    <th className="py-2 font-medium">Resultado</th>
                    <th className="px-5 py-2 text-right font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-border border-b align-top">
                      <td className="px-5 py-2">{providerLabels[e.provider]}</td>
                      <td className="text-fg-soft py-2">{e.event_type}</td>
                      <td className="py-2">
                        <Badge tone={statusTone[e.status]}>{statusLabel[e.status]}</Badge>
                        {e.error ? <p className="text-fg-muted mt-1 max-w-xs text-xs">{e.error}</p> : null}
                      </td>
                      <td className="text-fg-soft px-5 py-2 text-right">{formatDateTime(e.received_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-fg-muted text-sm">Nenhum aviso recebido ainda.</p>
          )}
        </Card>
      </div>
    </>
  );
}
