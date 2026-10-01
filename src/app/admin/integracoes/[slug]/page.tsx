import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { isEmailConfigured } from "@/lib/email";
import { env } from "@/lib/env";
import { OUTGOING_EVENTS } from "@/lib/outgoing-webhooks";
import { adapters, isProvider, isProviderConfigured } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { deleteOutgoingWebhook, toggleOutgoingWebhook } from "../actions";
import { OTHER_INTEGRATIONS, PAYMENT_INTEGRATIONS } from "../catalog";
import { CopyField, NewWebhookForm, SecretField, TestButton } from "../forms";

type Props = PageProps<"/admin/integracoes/[slug]">;

const back = { href: "/admin/integracoes", label: "Integrações" };
const eventLabel = Object.fromEntries(OUTGOING_EVENTS.map((e) => [e.id, e.label]));
const statusTone = { processed: "neutral", ignored: "muted", failed: "accent", received: "muted" } as const;
const statusLabel = { processed: "Processado", ignored: "Ignorado", failed: "Falhou", received: "Recebido" } as const;

function nameFor(slug: string) {
  if (isProvider(slug)) return PAYMENT_INTEGRATIONS[slug].name;
  if (slug === "email") return OTHER_INTEGRATIONS.email.name;
  if (slug === "funil") return OTHER_INTEGRATIONS.funil.name;
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: nameFor(slug) ?? "Integração" };
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={i} className="text-fg-soft flex gap-3 text-sm">
          <span className="bg-accent flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
            {i + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function EnvList({ names }: { names: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {names.map((name) => (
        <li key={name} className="border-border bg-surface-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <code className="text-sm">{name}</code>
          {process.env[name] ? <Badge>Configurada</Badge> : <Badge tone="muted">Falta</Badge>}
        </li>
      ))}
    </ul>
  );
}

export default async function IntegrationPage({ params }: Props) {
  await requireAdmin();
  const { slug } = await params;
  const supabase = await createClient();

  if (isProvider(slug)) {
    const info = PAYMENT_INTEGRATIONS[slug];
    const ready = isProviderConfigured(slug);
    const { data: events } = await supabase
      .from("webhook_events")
      .select("id, event_type, status, error, received_at")
      .eq("provider", slug)
      .order("received_at", { ascending: false })
      .limit(30);

    return (
      <>
        <PageHeader title={info.name} back={back} actions={ready ? <Badge>Ativa</Badge> : <Badge tone="muted">Falta configurar</Badge>} />
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="URL do webhook" description={`Cole este endereço no painel da ${info.name}.`} />
            <CopyField value={`${env.siteUrl}/api/webhooks/${slug}`} label="Copiar URL do webhook" />
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Passo a passo" />
              <Steps steps={info.steps} />
            </Card>
            <Card>
              <CardHeader title="Chaves na Vercel" description="Depois de criar ou mudar, faça Redeploy para valer." />
              <EnvList names={adapters[slug].requiredEnv} />
              {info.productHint ? (
                <p className="text-fg-muted mt-4 text-sm">
                  <span className="text-fg-soft font-semibold">Na turma</span> (Produtos do checkout), cadastre: {info.productHint}
                </p>
              ) : null}
            </Card>
          </div>
          <Card>
            <CardHeader title="Últimos avisos" description="O que a plataforma mandou e o que a área fez." />
            {events?.length ? (
              <ul className="divide-border divide-y">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-fg-soft">{e.event_type}</p>
                      {e.error ? <p className="text-fg-muted text-xs">{e.error}</p> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={statusTone[e.status]}>{statusLabel[e.status]}</Badge>
                      <span className="text-fg-muted text-xs">{formatDateTime(e.received_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted text-sm">Nenhum aviso recebido ainda. Faça uma venda de teste depois de configurar.</p>
            )}
          </Card>
        </div>
      </>
    );
  }

  if (slug === "email") {
    const ready = isEmailConfigured();
    return (
      <>
        <PageHeader
          title={OTHER_INTEGRATIONS.email.name}
          back={back}
          actions={ready ? <Badge>Ativa</Badge> : <Badge tone="muted">Para depois</Badge>}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Para que serve" />
            <p className="text-fg-soft text-sm">
              O próprio site envia os e-mails de acesso, de criar senha e de boas-vindas da compra, com o visual da área e em português. Sem
              ele, o login e a troca de senha usam o e-mail padrão do Supabase (poucos por hora), e o e-mail de boas-vindas da compra não é
              enviado.
            </p>
          </Card>
          <Card>
            <CardHeader title="Passo a passo" />
            <Steps
              steps={[
                "Crie a conta em resend.com (grátis até 3.000 e-mails por mês).",
                "Em Domains, adicione o seu domínio e crie os registros de DNS que o Resend mostrar.",
                "Em API Keys, crie uma chave com permissão de envio.",
                "Na Vercel, crie RESEND_API_KEY e EMAIL_FROM (ex.: LC.Academy <acesso@seudominio.com.br>) e faça Redeploy.",
              ]}
            />
            <div className="mt-5">
              <EnvList names={["RESEND_API_KEY", "EMAIL_FROM"]} />
            </div>
          </Card>
        </div>
      </>
    );
  }

  if (slug === "funil") {
    const [{ data: hooks }, { data: deliveries }] = await Promise.all([
      supabase.from("outgoing_webhooks").select("*").order("created_at"),
      supabase
        .from("webhook_deliveries")
        .select("id, webhook_id, event, status_code, error, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const hookName = Object.fromEntries((hooks ?? []).map((h) => [h.id, h.name]));
    return (
      <>
        <PageHeader
          title={OTHER_INTEGRATIONS.funil.name}
          back={back}
          description="A área avisa outro sistema (FunilPro, n8n, Make…) a cada lead ou venda."
        />
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="Destinos"
              description="Cada aviso vai assinado no cabeçalho X-LC-Signature (sha256=HMAC do corpo com o segredo)."
            />
            {hooks?.length ? (
              <ul className="mb-6 flex flex-col gap-3">
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
                          <ConfirmSubmit variant="ghost" size="sm" message={`Excluir o destino “${h.name}”?`}>
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
          </Card>
          {deliveries?.length ? (
            <Card>
              <CardHeader title="Últimos envios" />
              <ul className="divide-border divide-y text-sm">
                {deliveries.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-fg-soft">
                      {hookName[d.webhook_id] ?? "—"} · {eventLabel[d.event] ?? d.event}
                    </span>
                    <span className={d.error ? "text-accent text-xs" : "text-fg-muted text-xs"}>
                      {d.error ? d.error : `HTTP ${d.status_code}`} · {formatDateTime(d.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </>
    );
  }

  notFound();
}
