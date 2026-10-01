// Teste ponta a ponta da Etapa 2C: Radar de Comentários (sem IA).
// Uso: npm run dev (em outro terminal) e depois: node tests/e2e/radar-smoke.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { chromium } from "playwright";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SHOTS_DIR ?? "test-results/shots";
fs.mkdirSync(SHOTS, { recursive: true });
const must = async (p) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};
const step = async (name, fn) => {
  process.stdout.write(`- ${name} ... `);
  await fn();
  console.log("ok");
};
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

// limpeza + dados
await sb.from("courses").delete().eq("slug", "e2e-radar");
const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => u.email?.startsWith("e2e-radar"))) await sb.auth.admin.deleteUser(u.id);
async function user(email, name, extra = {}) {
  const { data } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
  if (Object.keys(extra).length) await must(sb.from("profiles").update(extra).eq("id", data.user.id));
  return data.user.id;
}
const adminId = await user("e2e-radar-admin@lc.test", "Admin Radar", { role: "admin" });
const anaId = await user("e2e-radar-ana@lc.test", "Ana Radar", { last_seen_at: new Date().toISOString() });
const brunoId = await user("e2e-radar-bruno@lc.test", "Bruno Sumido", {
  whatsapp: "11988887777",
  last_seen_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
});

const course = await must(
  sb.from("courses").insert({ slug: "e2e-radar", title: "E2E Radar Curso", is_published: true }).select("id").single(),
);
const mod = await must(sb.from("modules").insert({ course_id: course.id, title: "M1" }).select("id").single());
const lesson = await must(
  sb.from("lessons").insert({ module_id: mod.id, title: "Aula confusa", is_published: true }).select("id").single(),
);
const cohort = await must(sb.from("cohorts").insert({ course_id: course.id, name: "T1" }).select("id").single());
await must(
  sb.rpc("set_cohort_lessons", {
    p_cohort_id: cohort.id,
    p_items: [{ lesson_id: lesson.id, release_at: null, release_offset_days: null }],
  }),
);
const longAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
await must(
  sb.from("enrollments").insert([
    { user_id: anaId, cohort_id: cohort.id, origin: "manual", started_at: longAgo },
    { user_id: brunoId, cohort_id: cohort.id, origin: "manual", started_at: longAgo },
  ]),
);
const comment = (user_id, content) => ({ lesson_id: lesson.id, cohort_id: cohort.id, user_id, content });
const inserted = await must(
  sb
    .from("comments")
    .insert([
      comment(anaId, "Como eu conecto o WhatsApp na automação?"),
      comment(brunoId, "Quero meu reembolso, não consegui acessar"),
      comment(anaId, "Excelente aula, parabéns!"),
      comment(brunoId, "Poderia fazer uma aula sobre tráfego pago"),
      comment(anaId, "O vídeo não carrega no WhatsApp web"),
    ])
    .select("id, content"),
);
const praiseId = inserted.find((c) => c.content.startsWith("Excelente")).id;
// Elogio já respondido pelo professor: sai da fila.
await must(sb.from("comments").insert({ ...comment(adminId, "Valeu, Ana!"), parent_id: praiseId }));
await must(
  sb.from("ai_searches").insert([
    { user_id: anaId, query: "instagram" },
    { user_id: brunoId, query: "instagram" },
  ]),
);

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/net::ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text());
});
const link = await must(sb.auth.admin.generateLink({ type: "magiclink", email: "e2e-radar-admin@lc.test" }));
await page.goto(
  `${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=${encodeURIComponent(`/admin/radar?curso=${course.id}`)}`,
);

const queue = () => page.locator("section", { has: page.getByRole("heading", { name: "Fila de atendimento" }) });

await step("fila: urgente primeiro, respondido fora", async () => {
  await page.getByRole("heading", { name: "Radar de Comentários" }).waitFor({ timeout: 20000 });
  const items = queue().locator("li");
  await items.first().waitFor();
  assert((await items.count()) === 4, `4 na fila (veio ${await items.count()})`);
  const first = await items.first().innerText();
  assert(/Urgente/.test(first) && /reembolso/.test(first), `primeiro é o urgente: ${first}`);
  assert(!(await queue().getByText("Excelente aula").count()), "elogio respondido não está na fila");
  await page.screenshot({ path: `${SHOTS}/2c-radar.png`, caret: "initial", fullPage: true });
});

await step("aula com mais dúvidas, busca sem resultado, pedidos, elogios e palavras", async () => {
  const lessons = page.locator("section", { has: page.getByRole("heading", { name: "Aulas com mais dúvidas" }) });
  assert(/Aula confusa[\s\S]*2 dúvidas/.test(await lessons.innerText()), "2 dúvidas na aula");
  const searches = page.locator("section", { has: page.getByRole("heading", { name: "O que os alunos procuram" }) });
  assert(/instagram[\s\S]*2×[\s\S]*sem resultado/.test(await searches.innerText()), "busca sem resultado");
  const requests = page.locator("section", { has: page.getByRole("heading", { name: "Pedidos de conteúdo" }) });
  assert(/tráfego pago/.test(await requests.innerText()), "pedido listado");
  const praises = page.locator("section", { has: page.getByRole("heading", { name: "Elogios" }) });
  assert(/Excelente aula/.test(await praises.innerText()), "elogio listado");
  const words = page.locator("section", { has: page.getByRole("heading", { name: "Palavras mais citadas" }) });
  assert(/whatsapp\s*2/.test(await words.innerText()), "whatsapp citado 2x");
});

await step("responder publica na aula e tira da fila", async () => {
  const item = queue().locator("li", { hasText: "Como eu conecto o WhatsApp" });
  await item.getByRole("button", { name: "Responder" }).click();
  await item.getByRole("textbox").fill("Ana, veja o minuto 2:30 desta aula.");
  await item.getByRole("button", { name: "Publicar resposta" }).click();
  await item.waitFor({ state: "detached", timeout: 10000 });
  const replies = await must(
    sb.from("comments").select("parent_id, cohort_id").eq("user_id", adminId).eq("content", "Ana, veja o minuto 2:30 desta aula."),
  );
  assert(replies.length === 1 && replies[0].cohort_id === cohort.id, "resposta na mesma turma");
  await page.reload();
  await queue().locator("li").first().waitFor();
  assert(!(await queue().getByText("Como eu conecto o WhatsApp").count()), "respondido continua fora da fila");
});

await step("marcar como resolvido", async () => {
  const item = queue().locator("li", { hasText: "tráfego pago" });
  await item.getByRole("button", { name: "Marcar como resolvido" }).click();
  await item.waitFor({ state: "detached", timeout: 10000 });
  const [row] = await must(sb.from("comments").select("handled_at").ilike("content", "%tráfego pago%"));
  assert(row.handled_at, "handled_at gravado");
});

await step("alunos parados com link do WhatsApp", async () => {
  const idle = page.locator("section", { has: page.getByRole("heading", { name: "Alunos parados" }) });
  const text = await idle.innerText();
  assert(/Bruno Sumido/.test(text) && /há 20 dias/.test(text), `Bruno parado: ${text}`);
  assert(!/Ana Radar/.test(text), "Ana entrou hoje");
  const wa = await idle.getByRole("link", { name: "Chamar no WhatsApp" }).getAttribute("href");
  assert(wa?.startsWith("https://wa.me/5511988887777?text="), `wa: ${wa}`);
  await idle.getByRole("link", { name: "30+ dias" }).click();
  await page.waitForURL(/parados=30/);
  assert(!/Bruno Sumido/.test(await idle.innerText()), "com 30+ dias o Bruno não aparece");
});

await browser.close();
await sb.from("courses").delete().eq("slug", "e2e-radar");
for (const id of [adminId, anaId, brunoId]) await sb.auth.admin.deleteUser(id);
if (errors.length) {
  console.error("Erros no navegador:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Etapa 2C ok");
