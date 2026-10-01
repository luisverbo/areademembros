import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/auth";
import { channelReady } from "@/lib/messaging/deliver";
import { createClient } from "@/lib/supabase/server";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Nova mensagem" };

export default async function NewMessagePage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: courses }, { data: cohorts }] = await Promise.all([
    supabase.from("courses").select("id, title").order("showcase_order"),
    supabase.from("cohorts").select("id, name, course_id").order("created_at", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader title="Nova mensagem" back={{ href: "/admin/mensagens", label: "Mensagens" }} />
      <Composer
        courses={courses ?? []}
        cohorts={cohorts ?? []}
        ready={{ email: channelReady("email"), whatsapp: channelReady("whatsapp") }}
      />
    </>
  );
}
