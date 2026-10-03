import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { AUTOMATIONS } from "@/lib/messaging/automations";
import { channelReady } from "@/lib/messaging/deliver";
import { channelLabels, deliveryStatusLabels, deliveryStatusTone, purposeLabels } from "@/lib/messaging/labels";
import { whatsappProvider, whatsappProviderLabels } from "@/lib/messaging/whatsapp";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mensagens" };

export default async function MessagesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: campaigns }, { data: deliveries }, { data: automationDeliveries }, { data: automations }] = await Promise.all([
    supabase.from("message_campaigns").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("message_deliveries").select("campaign_id, status").not("campaign_id", "is", null).limit(50_000),
    supabase
      .from("message_deliveries")
      .select("id, automation_key, channel, to_address, status, error, created_at")
      .not("automation_key", "is", null)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase.from("automations").select("key, enabled"),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const d of deliveries ?? []) {
    const c = counts.get(d.campaign_id!) ?? {};
    c[d.status] = (c[d.status] ?? 0) + 1;
    counts.set(d.campaign_id!, c);
  }
  const wa = whatsappProvider();
  const enabled = (automations ?? []).filter((a) => a.enabled).length;

  return (
    <>
      <PageHeader
        title="Mensagens"
        description="Envie avisos e promoções por e-mail e WhatsApp, e ligue as mensagens automáticas."
        actions={
          <>
            <Link href="/admin/mensagens/automacoes" className={buttonClasses("secondary")}>
              Automações ({enabled} ligada{enabled === 1 ? "" : "s"})
            </Link>
            <Link href="/admin/mensagens/nova" className={buttonClasses("primary")}>
              Nova mensagem
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/integracoes/email"
          className="border-border bg-surface hover:border-fg-muted rounded-[var(--radius-card)] border p-4"
        >
          <p className="text-fg-muted text-sm">E-mail</p>
          <p className="mt-1 font-semibold">{channelReady("email") ? "Pronto (Resend)" : "Não configurado"}</p>
        </Link>
        <Link
          href="/admin/integracoes/whatsapp"
          className="border-border bg-surface hover:border-fg-muted rounded-[var(--radius-card)] border p-4"
        >
          <p className="text-fg-muted text-sm">WhatsApp</p>
          <p className="mt-1 font-semibold">{wa ? `Pronto (${whatsappProviderLabels[wa]})` : "Não configurado"}</p>
        </Link>
        <Link
          href="/admin/integracoes/cron"
          className="border-border bg-surface hover:border-fg-muted rounded-[var(--radius-card)] border p-4"
        >
          <p className="text-fg-muted text-sm">Envios automáticos</p>
          <p className="mt-1 font-semibold">{process.env.CRON_SECRET ? "Todo dia às 9h" : "Falta o CRON_SECRET"}</p>
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Envios" />
          {campaigns?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-fg-muted text-left text-xs">
                  <tr>
                    <th className="pb-2 font-medium">Nome</th>
                    <th className="pb-2 font-medium">Canal</th>
                    <th className="pb-2 font-medium">Data</th>
                    <th className="pb-2 font-medium">Enviadas</th>
                    <th className="pb-2 font-medium">Falhas</th>
                    <th className="pb-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {campaigns.map((c) => {
                    const n = counts.get(c.id) ?? {};
                    return (
                      <tr key={c.id}>
                        <td className="py-2 pr-3">
                          <Link href={`/admin/mensagens/${c.id}`} className="hover:text-accent-soft font-semibold">
                            {c.name}
                          </Link>{" "}
                          <Badge tone="muted">{purposeLabels[c.purpose as "notice" | "promo"]}</Badge>
                        </td>
                        <td className="text-fg-soft py-2 pr-3">{channelLabels[c.channel]}</td>
                        <td className="text-fg-soft py-2 pr-3">{formatDateTime(c.created_at)}</td>
                        <td className="py-2 pr-3 tabular-nums">{n.sent ?? 0}</td>
                        <td className="py-2 pr-3 tabular-nums">{(n.failed ?? 0) + (n.skipped ?? 0)}</td>
                        <td className="py-2">
                          {c.status === "sent" ? (
                            <Badge>Concluído</Badge>
                          ) : (
                            <Badge tone="accent">Enviando ({n.pending ?? 0} na fila)</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nenhum envio ainda" description="Crie a primeira mensagem para seus alunos." />
          )}
        </Card>

        <Card>
          <CardHeader title="Últimas mensagens automáticas" />
          {automationDeliveries?.length ? (
            <ul className="divide-border flex flex-col divide-y text-sm">
              {automationDeliveries.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-semibold">{AUTOMATIONS[d.automation_key!]?.title ?? d.automation_key}</span>
                  <span className="text-fg-muted">
                    {channelLabels[d.channel]} · {d.to_address} · {formatDateTime(d.created_at)}
                  </span>
                  <Badge tone={deliveryStatusTone[d.status]} className="ml-auto">
                    {deliveryStatusLabels[d.status]}
                  </Badge>
                  {d.error ? <span className="text-fg-muted w-full text-xs">{d.error}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted text-sm">Nenhuma ainda.</p>
          )}
        </Card>
      </div>
    </>
  );
}
