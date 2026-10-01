import type { Metadata } from "next";
import { IntegrationCard } from "@/components/admin/integration-card";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { isEmailConfigured } from "@/lib/email";
import { isProviderConfigured } from "@/lib/payments";
import type { Provider } from "@/lib/payments/types";
import { createClient } from "@/lib/supabase/server";
import { OTHER_INTEGRATIONS, PAYMENT_INTEGRATIONS } from "./catalog";

export const metadata: Metadata = { title: "Integrações" };

export default async function IntegrationsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: events }, { count: hooks }] = await Promise.all([
    supabase.from("webhook_events").select("provider, received_at").order("received_at", { ascending: false }).limit(200),
    supabase.from("outgoing_webhooks").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  const lastByProvider = new Map<string, string>();
  for (const e of events ?? []) if (!lastByProvider.has(e.provider)) lastByProvider.set(e.provider, e.received_at);

  const providers = Object.keys(PAYMENT_INTEGRATIONS) as Provider[];

  return (
    <>
      <PageHeader title="Integrações" description="Clique numa integração para configurar." />
      <section className="flex flex-col gap-3">
        <h2 className="text-fg-muted text-sm font-semibold tracking-wide uppercase">Plataformas de pagamento</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => {
            const info = PAYMENT_INTEGRATIONS[p];
            const last = lastByProvider.get(p);
            return (
              <IntegrationCard
                key={p}
                href={`/admin/integracoes/${info.slug}`}
                monogram={info.monogram}
                name={info.name}
                summary={info.summary}
                status={isProviderConfigured(p) ? "active" : "pending"}
                footer={last ? `Último aviso: ${formatDateTime(last)}` : "Nenhum aviso ainda"}
              />
            );
          })}
        </div>
      </section>
      <section className="mt-8 flex flex-col gap-3">
        <h2 className="text-fg-muted text-sm font-semibold tracking-wide uppercase">Comunicação</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <IntegrationCard
            href="/admin/integracoes/funil"
            monogram={OTHER_INTEGRATIONS.funil.monogram}
            name={OTHER_INTEGRATIONS.funil.name}
            summary={OTHER_INTEGRATIONS.funil.summary}
            status={hooks ? "active" : "pending"}
            footer={hooks ? `${hooks} ${hooks === 1 ? "destino ativo" : "destinos ativos"}` : "Nenhum destino"}
          />
          <IntegrationCard
            href="/admin/integracoes/email"
            monogram={OTHER_INTEGRATIONS.email.monogram}
            name={OTHER_INTEGRATIONS.email.name}
            summary={OTHER_INTEGRATIONS.email.summary}
            status={isEmailConfigured() ? "active" : "later"}
            footer={isEmailConfigured() ? `Enviando como ${process.env.EMAIL_FROM}` : "Usando o e-mail padrão do Supabase"}
          />
        </div>
      </section>
    </>
  );
}
