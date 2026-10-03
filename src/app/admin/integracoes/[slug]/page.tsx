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
import { whatsappProvider, whatsappProviderLabels } from "@/lib/messaging/whatsapp";
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
  if (slug === "whatsapp") return OTHER_INTEGRATIONS.whatsapp.name;
  if (slug === "cron") return OTHER_INTEGRATIONS.cron.name;
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

  if (slug === "whatsapp") {
    const wa = whatsappProvider();
    return (
      <>
        <PageHeader
          title={OTHER_INTEGRATIONS.whatsapp.name}
          back={back}
          actions={wa ? <Badge>Ativa: {whatsappProviderLabels[wa]}</Badge> : <Badge tone="muted">Para depois</Badge>}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="API oficial (recomendada)" description="WhatsApp Cloud API, da Meta. Sem risco de bloqueio do número." />
            <Steps
              steps={[
                "Em business.facebook.com, crie (ou use) a sua conta empresarial e verifique a empresa.",
                "Em developers.facebook.com, crie um app do tipo Empresa e adicione o produto WhatsApp.",
                "Cadastre e verifique o número que vai enviar (não pode estar em uso no WhatsApp do celular).",
                "Gere um token permanente (Usuário do sistema com permissão whatsapp_business_messaging) e copie o ID do número (Phone number ID).",
                'Em Modelos de mensagem, crie um modelo de Utilidade em português com o corpo: "Olá, {{1}}! {{2}}" e espere a aprovação.',
                "Na Vercel, crie as variáveis abaixo (WHATSAPP_TEMPLATE = nome do modelo) e faça Redeploy.",
              ]}
            />
            <div className="mt-5">
              <EnvList names={["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TOKEN", "WHATSAPP_TEMPLATE"]} />
            </div>
            <p className="text-fg-muted mt-3 text-xs">
              A Meta cobra por conversa iniciada pela empresa (valores em developers.facebook.com → WhatsApp → Preços). Sem modelo aprovado,
              só chegam mensagens para quem falou com o número nas últimas 24 horas.
            </p>
          </Card>
          <Card>
            <CardHeader
              title="Z-API (alternativa)"
              description="Conecta o WhatsApp do celular por QR Code. Mais rápido de ligar, mas o número pode ser bloqueado se enviar muito."
            />
            <Steps
              steps={[
                "Crie a conta em z-api.io e uma instância.",
                "Leia o QR Code com o WhatsApp do número que vai enviar.",
                "Copie o ID da instância, o Token e o Client-Token (em Segurança).",
                "Na Vercel, crie WHATSAPP_PROVIDER=zapi e as variáveis abaixo, e faça Redeploy.",
              ]}
            />
            <div className="mt-5">
              <EnvList names={["WHATSAPP_PROVIDER", "ZAPI_INSTANCE_ID", "ZAPI_TOKEN", "ZAPI_CLIENT_TOKEN"]} />
            </div>
            <p className="text-fg-muted mt-3 text-xs">Para não ser bloqueado, a área envia uma mensagem a cada 1,5 segundo pela Z-API.</p>
          </Card>
        </div>
      </>
    );
  }

  if (slug === "cron") {
    return (
      <>
        <PageHeader
          title={OTHER_INTEGRATIONS.cron.name}
          back={back}
          actions={process.env.CRON_SECRET ? <Badge>Ativo</Badge> : <Badge tone="muted">Falta configurar</Badge>}
        />
        <Card className="max-w-2xl">
          <CardHeader
            title="Passo a passo"
            description="A Vercel chama a área uma vez por dia (9h de Brasília) para rodar as automações de Mensagens."
          />
          <Steps
            steps={[
              "Na Vercel, crie a variável CRON_SECRET com uma senha longa qualquer (ex.: gere em 1password.com/password-generator, 32+ caracteres).",
              "Faça Redeploy. O agendamento já vem no projeto (vercel.json) e aparece em Settings → Cron Jobs.",
              "Ligue as automações em Mensagens → Automações.",
            ]}
          />
          <div className="mt-5">
            <EnvList names={["CRON_SECRET"]} />
          </div>
        </Card>
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
                    <span className={d.error ? "text-accent-soft text-xs" : "text-fg-muted text-xs"}>
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
