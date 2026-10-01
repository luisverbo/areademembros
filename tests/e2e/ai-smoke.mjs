// Teste ponta a ponta da Etapa 2A (sem chave da IA): transcrição, resumo na aula, busca e Professor IA.
// Uso: npm run dev (em outro terminal) e depois: node tests/e2e/ai-smoke.mjs
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
await sb.from("courses").delete().eq("slug", "e2e-ia");
const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => u.email?.startsWith("e2e-ia"))) await sb.auth.admin.deleteUser(u.id);
async function user(email, name, role) {
  const { data } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
  if (role === "admin") await must(sb.from("profiles").update({ role: "admin" }).eq("id", data.user.id));
  return data.user.id;
}
await user("e2e-ia-admin@lc.test", "Admin IA", "admin");
const studentId = await user("e2e-ia-aluno@lc.test", "Aluno IA");
const course = await must(sb.from("courses").insert({ slug: "e2e-ia", title: "E2E IA Curso", is_published: true }).select("id").single());
const mod = await must(sb.from("modules").insert({ course_id: course.id, title: "M1" }).select("id").single());
const lesson = await must(
  sb.from("lessons").insert({ module_id: mod.id, title: "Conectando o WhatsApp", is_published: true }).select("id").single(),
);
await must(sb.from("lesson_contents").insert({ lesson_id: lesson.id, video_provider: "youtube", video_id: "dQw4w9WgXcQ" }));
const cohort = await must(sb.from("cohorts").insert({ course_id: course.id, name: "T1" }).select("id").single());
await must(
  sb.rpc("set_cohort_lessons", {
    p_cohort_id: cohort.id,
    p_items: [{ lesson_id: lesson.id, release_at: null, release_offset_days: null }],
  }),
);
await must(sb.from("enrollments").insert({ user_id: studentId, cohort_id: cohort.id, origin: "manual" }));

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const errors = [];
async function loginPage(email, next) {
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/youtube|mediadelivery|net::ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text());
  });
  const link = await must(sb.auth.admin.generateLink({ type: "magiclink", email }));
  await page.goto(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=${encodeURIComponent(next)}`);
  return page;
}

const VTT = `WEBVTT

00:00:05.000 --> 00:00:09.000
Olá, boas-vindas à aula

00:02:30.000 --> 00:02:36.000
Agora vamos conectar o WhatsApp na ferramenta de automação

00:05:10.000 --> 00:05:15.000
Para terminar, teste enviando uma mensagem para você mesmo
`;

await step("admin envia a legenda e vê os trechos salvos", async () => {
  const page = await loginPage("e2e-ia-admin@lc.test", `/admin/cursos/${course.id}/aulas/${lesson.id}`);
  await page.waitForURL(`${BASE}/admin/cursos/${course.id}/aulas/${lesson.id}`);
  await page
    .locator('input[aria-label="Enviar arquivo de legenda"]')
    .setInputFiles({ name: "aula.vtt", mimeType: "text/vtt", buffer: Buffer.from(VTT) });
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Transcrição"]')?.value.includes("WEBVTT"));
  await page.getByRole("button", { name: "Salvar transcrição" }).click();
  await page.getByText(/Transcrição salva \(3 trechos, com minutos\)/).waitFor();
  const segs = await must(sb.from("lesson_transcript_segments").select("start_seconds").eq("lesson_id", lesson.id).order("start_seconds"));
  assert(JSON.stringify(segs.map((s) => s.start_seconds)) === "[5,150,310]", JSON.stringify(segs));
  // Sem chave da IA, a tela avisa o que falta
  await page.reload();
  await page.getByText("Pontos principais (um por linha)").waitFor();
  await page.screenshot({ caret: "initial", path: `${SHOTS}/d1-admin-transcricao.png`, fullPage: true });
});

await step("admin escreve o resumo e o checklist (sem IA)", async () => {
  const page = await loginPage("e2e-ia-admin@lc.test", `/admin/cursos/${course.id}/aulas/${lesson.id}`);
  await page.waitForURL(`${BASE}/admin/cursos/${course.id}/aulas/${lesson.id}`);
  await page
    .locator('textarea[name="summary"]')
    .fill("0:05 Boas-vindas — o que você vai aprender\n2:30 Conectar o WhatsApp — ligando o número\n5:10 Teste final — envie uma mensagem");
  await page.locator('textarea[name="checklist"]').fill("Conectar o número\nEnviar mensagem de teste");
  await page.getByRole("button", { name: "Salvar resumo" }).click();
  await page.getByText("Resumo salvo. Já aparece na aula.").waitFor();
  const c = await must(sb.from("lesson_contents").select("ai_summary, ai_checklist").eq("lesson_id", lesson.id).single());
  assert(c.ai_summary.points[1].start_seconds === 150 && c.ai_checklist.length === 2, JSON.stringify(c));
});

const student = await loginPage("e2e-ia-aluno@lc.test", `/aula/${lesson.id}`);

await step("aluno vê resumo com minutos e checklist que fica marcado", async () => {
  await student.waitForURL(`${BASE}/aula/${lesson.id}`);
  await student.getByRole("heading", { name: "Resumo da aula" }).waitFor();
  await student.getByRole("button", { name: "Ir para 2:30" }).click();
  await student.getByLabel("Conectar o número").check();
  await student.reload();
  assert(await student.getByLabel("Conectar o número").isChecked(), "checklist não ficou salvo");
  await student.screenshot({ caret: "initial", path: `${SHOTS}/d2-aula-resumo.png`, fullPage: true });
});

await step("Professor IA foi removido", async () => {
  assert((await student.getByRole("tab", { name: /Professor IA/ }).count()) === 0, "aba do Professor IA ainda aparece");
  const res = await student.request.post(`${BASE}/api/professor`, { data: { lessonId: lesson.id, message: "oi" } });
  assert(res.status() === 404, `esperava 404, veio ${res.status()}`);
});

await step("busca acha a aula e o minuto, com link direto", async () => {
  await student.getByRole("link", { name: /Buscar nas aulas/ }).click();
  await student.waitForURL(`${BASE}/busca`);
  await student.getByLabel("O que você procura").fill("como conecto o whatsapp");
  await student.getByRole("button", { name: "Buscar", exact: true }).click();
  await student.getByText("Trechos encontrados (1)").waitFor();
  const href = await student.locator(`a[href="/aula/${lesson.id}?t=150"]`).first().getAttribute("href");
  assert(href, "link para o minuto 2:30 não encontrado");
  await student.screenshot({ caret: "initial", path: `${SHOTS}/d3-busca.png`, fullPage: true });
  await student.goto(`${BASE}${href}`);
  await student.locator("iframe[src*='youtube-nocookie.com']").waitFor({ state: "attached" });
});

await step("visitante de outro curso não acha trechos desta aula", async () => {
  const outsider = await user("e2e-ia-fora@lc.test", "Fora");
  void outsider;
  const page = await loginPage("e2e-ia-fora@lc.test", "/busca?q=whatsapp");
  await page.getByText("Nenhuma aula sua fala sobre isso ainda").waitFor();
});

await browser.close();
await sb.from("courses").delete().eq("slug", "e2e-ia");
const { data: after } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of after.users.filter((u) => u.email?.startsWith("e2e-ia"))) await sb.auth.admin.deleteUser(u.id);
console.log("erros:", errors.length ? errors : "nenhum");
if (errors.length) process.exit(1);
