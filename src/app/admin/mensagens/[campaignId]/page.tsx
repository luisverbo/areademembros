import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { channelLabels, deliveryStatusLabels, deliveryStatusTone, purposeLabels } from "@/lib/messaging/labels";
import { SEGMENT_LABELS, type Segment } from "@/lib/messaging/segments";
import { createClient } from "@/lib/supabase/server";
import { ContinueButton } from "./continue-button";

export const metadata: Metadata = { title: "Envio" };

export default async function CampaignPage({ params }: PageProps<"/admin/mensagens/[campaignId]">) {
  await requireAdmin();
  const { campaignId } = await params;
  const supabase = await createClient();
  const [{ data: campaign }, { data: deliveries }] = await Promise.all([
    supabase.from("message_campaigns").select("*").eq("id", campaignId).maybeSingle(),
    supabase
      .from("message_deliveries")
      .select("id, user_id, to_address, status, error, sent_at, user:profiles(full_name)")
      .eq("campaign_id", campaignId)
      .order("created_at")
      .limit(5000),
  ]);
  if (!campaign) notFound();

  const n = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const d of deliveries ?? []) n[d.status]++;
  const audience = campaign.audience as { segment?: Segment };

  return (
    <>
      <PageHeader
        title={campaign.name}
        back={{ href: "/admin/mensagens", label: "Mensagens" }}
        description={`${channelLabels[campaign.channel]} · ${purposeLabels[campaign.purpose as "notice" | "promo"]} · ${audience.segment ? SEGMENT_LABELS[audience.segment] : ""} · ${formatDateTime(campaign.created_at)}`}
        actions={n.pending ? <ContinueButton campaignId={campaign.id} pending={n.pending} /> : <Badge>Concluído</Badge>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["sent", "pending", "failed", "skipped"] as const).map((s) => (
          <div key={s} className="border-border bg-surface rounded-[var(--radius-card)] border p-4">
            <p className="text-fg-muted text-sm">{deliveryStatusLabels[s]}</p>
            <p className="font-display mt-1 text-3xl font-bold">{n[s]}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Mensagem" />
          {campaign.subject ? <p className="mb-2 font-semibold">{campaign.subject}</p> : null}
          <p className="text-fg-soft text-sm whitespace-pre-line">{campaign.body}</p>
        </Card>
        <Card>
          <CardHeader title="Destinatários" />
          <ul className="divide-border flex max-h-[32rem] flex-col divide-y overflow-y-auto text-sm">
            {(deliveries ?? []).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                {d.user_id ? (
                  <Link href={`/admin/alunos/${d.user_id}`} className="hover:text-accent font-semibold">
                    {d.user?.full_name || d.to_address}
                  </Link>
                ) : (
                  <span className="font-semibold">{d.to_address}</span>
                )}
                <span className="text-fg-muted">{d.to_address}</span>
                <Badge tone={deliveryStatusTone[d.status]} className="ml-auto">
                  {deliveryStatusLabels[d.status]}
                </Badge>
                {d.error ? <span className="text-fg-muted w-full text-xs">{d.error}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
