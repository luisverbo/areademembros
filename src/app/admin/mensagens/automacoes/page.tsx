import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/auth";
import { isoDaysAgo } from "@/lib/datetime";
import { AUTOMATIONS } from "@/lib/messaging/automations";
import { createClient } from "@/lib/supabase/server";
import { AutomationForm, RunNowButton } from "./forms";

export const metadata: Metadata = { title: "Automações" };

const ORDER = ["idle", "lesson_released", "course_completed", "free_no_purchase", "urgent_comment", "weekly_report"];

export default async function AutomationsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const since = isoDaysAgo(30);
  const [{ data: automations }, { data: sent }] = await Promise.all([
    supabase.from("automations").select("*"),
    supabase
      .from("message_deliveries")
      .select("automation_key")
      .eq("status", "sent")
      .not("automation_key", "is", null)
      .gte("created_at", since)
      .limit(50_000),
  ]);
  const sentBy = new Map<string, number>();
  for (const d of sent ?? []) sentBy.set(d.automation_key!, (sentBy.get(d.automation_key!) ?? 0) + 1);
  const list = (automations ?? []).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  return (
    <>
      <PageHeader
        title="Automações"
        back={{ href: "/admin/mensagens", label: "Mensagens" }}
        description="Mensagens que saem sozinhas. Rodam todo dia às 9h (o alerta de comentário urgente sai na hora). Ninguém recebe a mesma mensagem duas vezes."
        actions={<RunNowButton />}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        {list.map((a) => (
          <AutomationForm
            key={a.key}
            automation={{
              key: a.key,
              enabled: a.enabled,
              channels: a.channels,
              subject: a.subject,
              body: a.body,
              settings: a.settings as { days?: number; link?: string; email?: string; whatsapp?: string },
            }}
            info={AUTOMATIONS[a.key]}
            sentLast30={sentBy.get(a.key) ?? 0}
          />
        ))}
      </div>
    </>
  );
}
