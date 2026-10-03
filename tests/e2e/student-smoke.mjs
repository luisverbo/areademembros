// Teste de fumaça da área do aluno (Etapa 1B) contra o app local + Supabase local.
// Uso: npm run dev (em outro terminal) e depois: node tests/e2e/student-smoke.mjs
// Cria os próprios dados (prefixo "e2e-") e apaga ao final.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs";

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
const DAY = 86400000;

const must = async (p) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};

async function user(email, name) {
  const existing = await must(sb.from("profiles").select("id").eq("email", email).maybeSingle());
  if (existing) return existing.id;
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  return data.user.id;
}

async function course(slug, title, opts = {}) {
  await sb.from("courses").delete().eq("slug", slug);
  const c = await must(
    sb
      .from("courses")
      .insert({ slug, title, is_published: true, description: `Descrição de ${title}.`, ...opts })
      .select("id")
      .single(),
  );
  const m = await must(sb.from("modules").insert({ course_id: c.id, title: "Módulo 1" }).select("id").single());
  return { id: c.id, moduleId: m.id };
}

async function lesson(moduleId, title, position, provider = "bunny", extra = {}) {
  const l = await must(
    sb
      .from("lessons")
      .insert({ module_id: moduleId, title, position, is_published: true, duration_seconds: 600, ...extra })
      .select("id")
      .single(),
  );
  await must(
    sb.from("lesson_contents").insert({
      lesson_id: l.id,
      video_provider: provider,
      video_id: provider === "youtube" ? "dQw4w9WgXcQ" : "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    }),
  );
  return l.id;
}

// ---------------- dados ----------------
const studentId = await user("e2e-aluna@lc.test", "Maria Souza");
const otherId = await user("e2e-colega@lc.test", "João Pereira");

const mentoria = await course("e2e-mentoria", "E2E Mentoria IA", { showcase_order: 1 });
const ml = [];
for (let i = 0; i < 4; i++) ml.push(await lesson(mentoria.moduleId, `Aula ${i + 1} da mentoria`, i));
// Turma: dias após a entrada, 7 em 7 dias; aluna entrou há 8 dias -> aulas 1 e 2 liberadas, 3 e 4 travadas.
const cohort = await must(
  sb
    .from("cohorts")
    .insert({
      course_id: mentoria.id,
      name: "Mentoria T1",
      release_mode: "days_after_join",
      release_config: { interval_days: 7 },
    })
    .select("id")
    .single(),
);
await must(sb.from("cohort_live_links").insert({ cohort_id: cohort.id, live_url: "https://meet.google.com/abc" }));
await must(
  sb.rpc("set_cohort_lessons", {
    p_cohort_id: cohort.id,
    p_items: ml.map((id) => ({ lesson_id: id, release_at: null, release_offset_days: null })),
  }),
);
await must(
  sb
    .from("enrollments")
    .insert({ user_id: studentId, cohort_id: cohort.id, origin: "manual", started_at: new Date(Date.now() - 8 * DAY).toISOString() }),
);
await must(sb.from("enrollments").insert({ user_id: otherId, cohort_id: cohort.id, origin: "manual" }));
// Material da aula 1
await sb.storage
  .from("lesson-materials")
  .upload(`${ml[0]}/apostila.pdf`, Buffer.from("%PDF-1.4 e2e"), { contentType: "application/pdf", upsert: true });
await must(sb.from("lesson_materials").insert({ lesson_id: ml[0], name: "apostila.pdf", storage_path: `${ml[0]}/apostila.pdf` }));
// Comentário do colega
await must(
  sb.from("comments").insert({ lesson_id: ml[0], cohort_id: cohort.id, user_id: otherId, content: "Ótima aula! Como conecto o WhatsApp?" }),
);

const gratis = await course("e2e-gratis", "E2E Curso Grátis", { is_free: true, showcase_order: 2 });
const gl = await lesson(gratis.moduleId, "Aula grátis", 0, "youtube");

const travado = await course("e2e-travado", "E2E Minicurso Instagram", { showcase_order: 3 });
await lesson(travado.moduleId, "Aula do minicurso", 0);
const sale = await must(
  sb
    .from("cohorts")
    .insert({ course_id: travado.id, name: "Perpétua", checkout_url: "https://pay.kiwify.com.br/xyz" })
    .select("id")
    .single(),
);
await must(sb.from("courses").update({ sales_cohort_id: sale.id }).eq("id", travado.id));

// ---------------- navegador ----------------
const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/youtube|mediadelivery|ERR_|net::|Failed to load resource/i.test(m.text())) errors.push(m.text());
});
const step = async (name, fn) => {
  process.stdout.write(`- ${name} ... `);
  await fn();
  console.log("ok");
};

const link = await must(sb.auth.admin.generateLink({ type: "magiclink", email: "e2e-aluna@lc.test" }));
await page.goto(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=/`);

await step("vitrine: banner, fileiras e cadeado", async () => {
  await page.waitForURL(`${BASE}/`);
  await page.getByRole("heading", { level: 1, name: "E2E Mentoria IA" }).waitFor();
  await page.getByText("Mentoria T1").first().waitFor();
  await page.getByRole("heading", { name: "Sua turma" }).waitFor();
  await page.getByRole("heading", { name: "Grátis" }).waitFor();
  const locked = page.getByRole("link", { name: "E2E Minicurso Instagram (desbloquear)" });
  const href = await locked.getAttribute("href");
  if (!href.startsWith("https://pay.kiwify.com.br/xyz") || !href.includes("email=e2e-aluna%40lc.test") || !href.includes("name=Maria"))
    throw new Error("checkout sem dados do aluno: " + href);
  const lockedLessons = await page.getByText(/^Libera /).count();
  if (lockedLessons < 2) throw new Error("esperava 2 aulas travadas com data, achei " + lockedLessons);
  await page.screenshot({ caret: "initial", path: `${SHOTS}/b1-home.png` });
});

await step("página do curso com aulas e cadeado", async () => {
  await page.getByRole("link", { name: "Ver turma" }).click();
  await page.waitForURL(`${BASE}/curso/e2e-mentoria`);
  await page.getByText("Aula 3 da mentoria").waitFor();
  await page
    .getByText(/faltam/)
    .first()
    .waitFor();
  await page.screenshot({ caret: "initial", path: `${SHOTS}/b2-course.png`, fullPage: true });
});

await step("aula liberada: player, materiais, comentários", async () => {
  await page
    .getByRole("link", { name: /Começar|Continuar/ })
    .first()
    .click();
  await page.waitForURL(`${BASE}/aula/${ml[0]}`);
  await page.locator("iframe[src*='iframe.mediadelivery.net/embed/']").waitFor({ state: "attached" });
  await page.getByText("Comentários da turma (1)").waitFor();
  await page.getByText("João P.").waitFor();
  await page.getByText("Ótima aula! Como conecto o WhatsApp?").waitFor();
  await page.screenshot({ caret: "initial", path: `${SHOTS}/b3-lesson.png`, fullPage: true });
});

await step("baixar material (link temporário)", async () => {
  const res = await page.request.get(
    `${BASE}/aula/${ml[0]}/material/${(await must(sb.from("lesson_materials").select("id").eq("lesson_id", ml[0]).single())).id}`,
    { maxRedirects: 0 },
  );
  const loc = res.headers()["location"] ?? "";
  if (res.status() !== 307 || !loc.includes("/storage/v1/object/sign/lesson-materials/"))
    throw new Error(`redirect inesperado ${res.status()} ${loc}`);
});

await step("comentar e responder", async () => {
  await page.getByRole("textbox", { name: "Escreva um comentário ou dúvida…" }).fill("Minha primeira dúvida");
  await page.getByRole("button", { name: "Comentar" }).click();
  await page.getByText("Minha primeira dúvida").waitFor();
  await page.getByRole("button", { name: "Responder" }).first().click();
  await page.getByRole("textbox", { name: /Responder a/ }).fill("Resposta de teste");
  await page.locator('form:has(textarea[aria-label^="Responder a"]) button[type="submit"]').click();
  await page.getByText("Resposta de teste").waitFor();
});

await step("progresso salvo pelo player (API)", async () => {
  const res = await page.request.post(`${BASE}/api/progresso`, { data: { lessonId: ml[0], position: 300, duration: 600 } });
  if (res.status() !== 200) throw new Error("progresso " + res.status());
  const denied = await page.request.post(`${BASE}/api/progresso`, { data: { lessonId: ml[3], position: 10, duration: 600 } });
  if (denied.status() !== 403) throw new Error("aula travada deveria recusar progresso: " + denied.status());
  const p = await must(sb.from("lesson_progress").select("percent").eq("user_id", studentId).eq("lesson_id", ml[0]).single());
  if (Number(p.percent) !== 50) throw new Error("percent " + p.percent);
});

await step("marcar como concluída e ir para a próxima", async () => {
  await page.reload();
  await page.getByRole("button", { name: "Marcar como concluída" }).click();
  await page.getByRole("button", { name: "Concluída" }).waitFor();
  await page.getByRole("link", { name: /Próxima aula/ }).click();
  await page.waitForURL(`${BASE}/aula/${ml[1]}`);
});

await step("aula futura mostra cadeado e contagem", async () => {
  await page.goto(`${BASE}/aula/${ml[2]}`);
  await page
    .getByText(/^Libera /)
    .first()
    .waitFor();
  await page
    .getByText(/faltam/)
    .first()
    .waitFor();
  const iframes = await page.locator("iframe").count();
  if (iframes) throw new Error("aula travada não pode ter player");
  await page.screenshot({ caret: "initial", path: `${SHOTS}/b4-locked.png` });
});

await step("curso grátis com YouTube", async () => {
  await page.goto(`${BASE}/aula/${gl}`);
  await page.locator("iframe[src*='youtube-nocookie.com/embed/dQw4w9WgXcQ']").waitFor({ state: "attached" });
});

await step("curso travado: aula não abre", async () => {
  await page.goto(`${BASE}/curso/e2e-travado`);
  await page.getByRole("link", { name: "Desbloquear" }).waitFor();
});

await step("vitrine mostra 'Continuar assistindo' e progresso", async () => {
  await sb.from("lesson_progress").delete().eq("user_id", studentId).eq("lesson_id", ml[1]);
  await page.request.post(`${BASE}/api/progresso`, { data: { lessonId: ml[1], position: 120, duration: 600 } });
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: "Continuar assistindo" }).waitFor();
  await page
    .getByRole("link", { name: /Continuar/ })
    .first()
    .waitFor();
});

await step("celular: sem rolagem lateral da página", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/curso/e2e-mentoria", `/aula/${ml[0]}`]) {
    await page.goto(`${BASE}${path}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) throw new Error("rolagem lateral em " + path);
  }
  await page.goto(`${BASE}/`);
  await page.screenshot({ caret: "initial", path: `${SHOTS}/b5-mobile-home.png` });
  await page.goto(`${BASE}/aula/${ml[0]}`);
  await page.screenshot({ caret: "initial", path: `${SHOTS}/b6-mobile-lesson.png` });
});

await browser.close();

// limpeza
for (const slug of ["e2e-mentoria", "e2e-gratis", "e2e-travado"]) await sb.from("courses").delete().eq("slug", slug);
await sb.auth.admin.deleteUser(studentId);
await sb.auth.admin.deleteUser(otherId);
console.log("console errors:", errors.length ? errors : "none");
if (errors.length) process.exit(1);
