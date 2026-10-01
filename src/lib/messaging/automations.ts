import "server-only";
import { env } from "@/lib/env";
import { classifyComment, isUrgent } from "@/lib/radar/classify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { enqueue, processPending, type Channel, type NewDelivery } from "./deliver";
import { firstName, renderTemplate } from "./render";

export type AutomationKey = Database["public"]["Tables"]["automations"]["Row"]["key"];
type Automation = Database["public"]["Tables"]["automations"]["Row"];
type Settings = { days?: number; link?: string; email?: string; whatsapp?: string };

export const AUTOMATIONS: Record<
  string,
  { title: string; description: string; audience: "students" | "admin"; promo?: boolean; variables: string[] }
> = {
  idle: {
    title: "Aluno parado",
    description: "Quando o aluno fica X dias sem entrar. Uma vez a cada sumiço.",
    audience: "students",
    variables: ["nome", "curso", "link"],
  },
  lesson_released: {
    title: "Aula liberada",
    description: "Quando uma aula programada libera para o aluno (não avisa o que já estava liberado na entrada).",
    audience: "students",
    variables: ["nome", "curso", "aula", "link"],
  },
  course_completed: {
    title: "Concluiu o curso",
    description: "Quando o aluno conclui todas as aulas da turma.",
    audience: "students",
    variables: ["nome", "curso", "link"],
  },
  free_no_purchase: {
    title: "Grátis sem compra",
    description: "X dias depois de entrar num curso grátis, para quem ainda não comprou nada. Só para quem aceitou receber mensagens.",
    audience: "students",
    promo: true,
    variables: ["nome", "curso", "link"],
  },
  urgent_comment: {
    title: "Alerta de comentário urgente (para você)",
    description: "Na hora em que um aluno comenta sobre reembolso, cancelamento, Procon etc.",
    audience: "admin",
    variables: ["aluno", "curso", "aula", "comentario", "link"],
  },
  weekly_report: {
    title: "Resumo semanal (para você)",
    description: "Toda segunda de manhã: alunos novos, vendas, comentários sem resposta, urgentes e alunos parados.",
    audience: "admin",
    variables: [],
  },
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  whatsapp: string | null;
  marketing_consent: boolean;
  messages_opt_out_at: string | null;
};

async function loadProfiles(ids: string[]): Promise<Map<string, Profile>> {
  const admin = createAdminClient();
  const map = new Map<string, Profile>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, whatsapp, marketing_consent, messages_opt_out_at")
      .in("id", ids.slice(i, i + 500));
    for (const p of data ?? []) map.set(p.id, p);
  }
  return map;
}

/** Uma mensagem por canal para cada aluno, respeitando descadastro e (em promoção) o aceite. */
function studentDeliveries(
  automation: Automation,
  profile: Profile | undefined,
  vars: Record<string, string>,
  dedupe: string,
): NewDelivery[] {
  if (!profile || profile.messages_opt_out_at) return [];
  if (AUTOMATIONS[automation.key]?.promo && !profile.marketing_consent) return [];
  const allVars = { nome: firstName(profile.full_name), link: env.siteUrl, ...vars };
  return automation.channels.flatMap((channel: Channel) => {
    const to = channel === "email" ? profile.email : profile.whatsapp;
    if (!to) return [];
    return [
      {
        automation_key: automation.key,
        user_id: profile.id,
        channel,
        to_address: to,
        subject: channel === "email" ? renderTemplate(automation.subject || env.appName, allVars) : null,
        body: renderTemplate(automation.body, allVars),
        dedupe_key: `${dedupe}:${channel}`,
      },
    ];
  });
}

/** Para onde vão os avisos do admin: o que estiver na automação ou, se vazio, o primeiro admin que tiver aquele contato. */
async function adminAddresses(automation: Automation): Promise<{ email: string | null; whatsapp: string | null }> {
  const settings = automation.settings as Settings;
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("email, whatsapp").eq("role", "admin").order("created_at").limit(20);
  return {
    email: settings.email?.trim() || data?.find((a) => a.email)?.email || null,
    whatsapp: settings.whatsapp?.trim() || data?.find((a) => a.whatsapp)?.whatsapp || null,
  };
}

async function adminDeliveries(automation: Automation, subject: string, body: string, dedupe: string): Promise<NewDelivery[]> {
  const to = await adminAddresses(automation);
  return automation.channels.flatMap((channel: Channel) => {
    const address = channel === "email" ? to.email : to.whatsapp;
    if (!address) return [];
    return [
      {
        automation_key: automation.key,
        user_id: null,
        channel,
        to_address: address,
        subject: channel === "email" ? subject : null,
        body,
        dedupe_key: `${dedupe}:${channel}`,
      },
    ];
  });
}

const DAY = 86_400_000;
const spDate = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // yyyy-mm-dd
const spWeekday = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getDay();

async function buildRows(automation: Automation, now: Date): Promise<NewDelivery[]> {
  const admin = createAdminClient();
  const settings = automation.settings as Settings;
  const days = Math.max(1, Math.min(365, Number(settings.days) || 3));

  switch (automation.key) {
    case "idle": {
      const { data } = await admin.rpc("automation_idle_students", { p_days: days });
      const profiles = await loadProfiles((data ?? []).map((r) => r.user_id));
      return (data ?? []).flatMap((r) =>
        studentDeliveries(
          automation,
          profiles.get(r.user_id),
          { curso: r.course_title },
          `idle:${r.user_id}:${r.last_seen_at ? spDate(new Date(r.last_seen_at)) : "nunca"}`,
        ),
      );
    }
    case "lesson_released": {
      const { data } = await admin.rpc("automation_lessons_released", {
        p_from: new Date(now.getTime() - 2 * DAY).toISOString(),
        p_to: now.toISOString(),
      });
      const profiles = await loadProfiles([...new Set((data ?? []).map((r) => r.user_id))]);
      return (data ?? []).flatMap((r) =>
        studentDeliveries(
          automation,
          profiles.get(r.user_id),
          { curso: r.course_title, aula: r.lesson_title, link: `${env.siteUrl}/aula/${r.lesson_id}` },
          `released:${r.user_id}:${r.lesson_id}`,
        ),
      );
    }
    case "course_completed": {
      const { data } = await admin.rpc("automation_courses_completed");
      const recent = (data ?? []).filter((r) => r.completed_at && new Date(r.completed_at).getTime() > now.getTime() - 3 * DAY);
      const profiles = await loadProfiles(recent.map((r) => r.user_id));
      return recent.flatMap((r) =>
        studentDeliveries(automation, profiles.get(r.user_id), { curso: r.course_title }, `completed:${r.user_id}:${r.course_id}`),
      );
    }
    case "free_no_purchase": {
      const { data } = await admin.rpc("automation_free_no_purchase", { p_days: days });
      const profiles = await loadProfiles((data ?? []).map((r) => r.user_id));
      const link = settings.link?.trim() || env.siteUrl;
      return (data ?? []).flatMap((r) =>
        studentDeliveries(
          automation,
          profiles.get(r.user_id),
          { curso: r.course_title, link },
          `freenopurchase:${r.user_id}:${r.course_id}`,
        ),
      );
    }
    case "weekly_report": {
      if (spWeekday(now) !== 1) return []; // segunda-feira
      const report = await weeklyReport(now);
      return adminDeliveries(automation, report.subject, report.body, `weekly:${spDate(now)}`);
    }
    default:
      return []; // urgent_comment roda na hora do comentário
  }
}

/** Roda as automações ligadas (cron diário) e depois envia a fila. */
export async function runDailyAutomations(now = new Date(), budgetMs = 240_000) {
  const admin = createAdminClient();
  const { data: automations } = await admin.from("automations").select("*").eq("enabled", true);
  const queued: Record<string, number> = {};
  for (const automation of automations ?? []) {
    try {
      queued[automation.key] = await enqueue(await buildRows(automation, now));
    } catch (error) {
      console.error("automation", automation.key, error);
      queued[automation.key] = -1;
    }
  }
  const delivery = await processPending({ budgetMs });
  return { queued, delivery };
}

/** Avisa o admin na hora (chamado depois que o aluno publica um comentário). */
export async function alertUrgentComment(commentId: string) {
  const admin = createAdminClient();
  const { data: automation } = await admin.from("automations").select("*").eq("key", "urgent_comment").eq("enabled", true).maybeSingle();
  if (!automation) return;
  const { data: comment } = await admin
    .from("comments")
    .select("content, author:profiles(full_name, email, role), lesson:lessons(title, module:modules(course:courses(title)))")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment || comment.author?.role === "admin" || !isUrgent(comment.content)) return;
  const vars = {
    aluno: comment.author?.full_name?.trim() || comment.author?.email || "Aluno",
    curso: comment.lesson?.module?.course?.title ?? "",
    aula: comment.lesson?.title ?? "",
    comentario: comment.content.length > 300 ? `${comment.content.slice(0, 300)}…` : comment.content,
    link: `${env.siteUrl}/admin/radar`,
  };
  const rows = await adminDeliveries(
    automation,
    renderTemplate(automation.subject || "Comentário urgente", vars),
    renderTemplate(automation.body, vars),
    `urgent:${commentId}`,
  );
  if (await enqueue(rows)) await processPending({ budgetMs: 20_000, limit: 5 });
}

/** Resumo dos últimos 7 dias para o admin. */
export async function weeklyReport(now = new Date()): Promise<{ subject: string; body: string }> {
  const admin = createAdminClient();
  const since = new Date(now.getTime() - 7 * DAY).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [newStudents, sales, freeLeads, comments, idle] = await Promise.all([
    count(admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student").gte("created_at", since)),
    count(admin.from("enrollments").select("id", { count: "exact", head: true }).eq("origin", "purchase").gte("created_at", since)),
    count(admin.from("enrollments").select("id", { count: "exact", head: true }).eq("origin", "free").gte("created_at", since)),
    admin
      .from("comments")
      .select("id, parent_id, content, created_at, handled_at, author:profiles(role)")
      .gte("created_at", since)
      .limit(3000),
    admin.rpc("automation_idle_students", { p_days: 7 }),
  ]);

  const rows = comments.data ?? [];
  const lastAdmin = new Map<string, string>();
  for (const r of rows) {
    if (r.author?.role !== "admin") continue;
    const root = r.parent_id ?? r.id;
    if ((lastAdmin.get(root) ?? "") < r.created_at) lastAdmin.set(root, r.created_at);
  }
  const students = rows.filter((r) => r.author?.role !== "admin");
  const pending = students.filter((r) => !r.handled_at && (lastAdmin.get(r.parent_id ?? r.id) ?? "") < r.created_at);
  const urgent = pending.filter((r) => isUrgent(r.content)).length;
  const doubts = students.filter((r) => ["question", "technical"].includes(classifyComment(r.content) ?? "")).length;

  const body = [
    `Resumo dos últimos 7 dias em ${env.appName}:`,
    "",
    `• Alunos novos: ${newStudents}`,
    `• Vendas (matrículas por compra): ${sales}`,
    `• Leads de curso grátis: ${freeLeads}`,
    `• Comentários de alunos: ${students.length} (${doubts} dúvidas ou problemas técnicos)`,
    `• Sem resposta: ${pending.length}${urgent ? ` (${urgent} urgente${urgent > 1 ? "s" : ""})` : ""}`,
    `• Alunos parados há 7+ dias: ${idle.data?.length ?? 0}`,
    "",
    `Abra o Radar: ${env.siteUrl}/admin/radar`,
  ].join("\n");
  return { subject: `Resumo da semana: ${pending.length} comentário${pending.length === 1 ? "" : "s"} sem resposta`, body };
}
