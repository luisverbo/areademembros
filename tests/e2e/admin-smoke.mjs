// Teste de fumaça do admin (Etapa 1A) contra o app rodando localmente com o Supabase local.
// Uso: npm run dev (em outro terminal) e depois: node tests/e2e/admin-smoke.mjs
// Cria dados reais no banco local; rode com o banco recém-resetado (npx supabase db reset).
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SHOTS = process.env.E2E_SHOTS_DIR ?? "test-results/shots";
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function ensureUser(email, role) {
  let { data: p } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: role === "admin" ? "Luís Admin" : "Aluna Teste" },
    });
    if (error) throw error;
    p = { id: data.user.id };
  }
  if (role === "admin") await sb.from("profiles").update({ role: "admin" }).eq("id", p.id);
  return p.id;
}

async function login(page, email, next = "/") {
  const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=${encodeURIComponent(next)}`);
}

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

const step = async (name, fn) => {
  process.stdout.write(`- ${name} ... `);
  await fn();
  console.log("ok");
};

await ensureUser("admin@lc.test", "admin");
await ensureUser("aluna@lc.test", "student");

await step("login screen", async () => {
  await page.goto(`${BASE}/entrar`);
  await page.screenshot({ caret: "initial", path: `${SHOTS}/01-login.png` });
});

await step("admin login via magic link", async () => {
  await login(page, "admin@lc.test", "/admin");
  await page.waitForURL(`${BASE}/admin`);
  await page.screenshot({ caret: "initial", path: `${SHOTS}/02-admin-home.png` });
});

await step("create course", async () => {
  await page.goto(`${BASE}/admin/cursos/novo`);
  await page.fill("#title", "IA para Negócios Locais");
  if ((await page.inputValue("#slug")) !== "ia-para-negocios-locais") throw new Error("slug auto");
  await page.click("text=Criar e continuar");
  await page.waitForURL(/\/admin\/cursos\/[0-9a-f-]{36}$/);
});
const courseUrl = page.url();

await step("upload cover", async () => {
  // gera uma imagem 9:16 em memória
  const png = Buffer.from(
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 270;
      c.height = 480;
      const g = c.getContext("2d");
      g.fillStyle = "#D63A42";
      g.fillRect(0, 0, 270, 480);
      g.fillStyle = "#fff";
      g.font = "bold 28px sans-serif";
      g.fillText("IA Negócios", 40, 240);
      const b = await new Promise((r) => c.toBlob(r, "image/png"));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    }),
  );
  const inputs = page.locator('input[type="file"][accept^="image"]');
  await inputs.nth(0).setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: png });
  await page.getByText("Enviada. Salve o curso para aplicar.").waitFor();
});

await step("save course details", async () => {
  await page.fill("#description", "Mentoria para aplicar IA em negócios locais.");
  await page.check('input[name="is_published"]');
  await page.click("text=Salvar curso");
  await page.getByText("Curso salvo.").waitFor();
});

await step("modules and lessons", async () => {
  await page.fill('input[placeholder="Nome do novo módulo"]', "Módulo 1 · Fundamentos");
  await page.click("text=+ Módulo");
  await page.getByRole("textbox", { name: "Nome do módulo" }).first().waitFor();
  for (const title of ["Boas-vindas", "Conectando o WhatsApp", "Primeira automação"]) {
    await page.goto(courseUrl);
    await page.fill('input[placeholder="Título da nova aula"]', title);
    await page.click("text=+ Aula");
    await page.waitForURL(/\/aulas\//);
    await page.fill("#video_id", `https://iframe.mediadelivery.net/embed/1234/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5${title.length % 10}`);
    await page.fill("#duration_seconds", "12:30");
    await page.check('input[name="is_published"]');
    await page.click("text=Salvar aula");
    await page.getByText("Aula salva.").waitFor();
  }
  await page.screenshot({ caret: "initial", path: `${SHOTS}/04-lesson.png`, fullPage: true });
});

await step("youtube on paid lesson is rejected", async () => {
  await page.selectOption("#video_provider", "youtube");
  await page.fill("#video_id", "https://youtu.be/dQw4w9WgXcQ");
  await page.click("text=Salvar aula");
  await page.getByText("YouTube só pode ser usado em aula ou curso grátis").waitFor();
});

await step("material upload", async () => {
  await page.reload();
  await page
    .locator('input[aria-label="Enviar materiais"]')
    .setInputFiles({ name: "checklist.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });
  await page.getByText("checklist.pdf").waitFor();
});

await step("reorder lesson", async () => {
  await page.goto(courseUrl);
  await page.getByRole("button", { name: "Descer aula" }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ caret: "initial", path: `${SHOTS}/03-course.png`, fullPage: true });
});

await step("create weekly cohort", async () => {
  await page.goto(courseUrl);
  await page.click("text=+ Turma");
  await page.fill("#name", "Mentoria T1");
  await page.click("text=Criar e configurar");
  await page.waitForURL(/\/admin\/turmas\/[0-9a-f-]{36}$/);
  await page.selectOption("#release_mode", "weekly");
  await page.selectOption("#weekday", "1");
  await page.fill("#time", "19:00");
  await page.fill("#starts_at", "2026-10-01T10:00");
  await page.fill("#checkout_url", "https://pay.kiwify.com.br/abc123");
  await page.click("text=Salvar turma");
  await page.getByText("Turma salva.").waitFor();
  await page.reload();
  const text = await page.locator("table").first().innerText();
  if (!text.includes("seg, 05/10 · 19h")) throw new Error("preview semanal: " + text);
  await page.screenshot({ caret: "initial", path: `${SHOTS}/05-cohort.png`, fullPage: true });
});
const cohortUrl = page.url();

await step("exclude a lesson from cohort", async () => {
  await page.getByRole("checkbox", { name: /Incluir Primeira automação/ }).uncheck();
  await page.click("text=Salvar aulas da turma");
  await page.getByText("Aulas da turma salvas.").waitFor();
  await page.reload();
  await page.getByText("Aulas da turma (2 de 3)").waitFor();
});

await step("link products (two providers) and reject duplicate", async () => {
  for (const [prov, id] of [
    ["kiwify", "kw-prod-1"],
    ["hotmart", "HM-998"],
  ]) {
    await page.selectOption("#provider", prov);
    await page.fill("#external_product_id", id);
    await page.click("text=Ligar produto");
    await page.getByText(id).waitFor();
  }
  await page.selectOption("#provider", "kiwify");
  await page.fill("#external_product_id", "kw-prod-1");
  await page.click("text=Ligar produto");
  await page.getByText("Esse produto já está ligado a uma turma").waitFor();
});

await step("enroll student by email", async () => {
  await page.fill("#enroll_email", "aluna@lc.test");
  await page.click("text=Matricular");
  await page.getByText("aluna@lc.test matriculado(a)").waitFor();
  await page.reload();
  await page.getByRole("link", { name: /Aluna Teste/ }).waitFor();
});

await step("duplicate cohort", async () => {
  await page.click("text=Duplicar turma");
  await page.waitForURL((u) => u.toString() !== cohortUrl && /\/admin\/turmas\//.test(u.toString()));
  await page.getByRole("heading", { name: "Mentoria T1 (cópia)" }).waitFor();
});

await step("students list + detail + unlock", async () => {
  await page.goto(`${BASE}/admin/alunos?q=aluna`);
  await page.getByRole("link", { name: /Aluna Teste/ }).click();
  await page.waitForURL(/\/admin\/alunos\/[0-9a-f-]{36}$/);
  await page.selectOption("#unlock_lesson", { label: "IA para Negócios Locais · Módulo 1 · Fundamentos · Primeira automação" });
  await page.getByRole("button", { name: "Liberar", exact: true }).click();
  await page.getByText("Aula liberada para o aluno.").waitFor();
  await page.screenshot({ caret: "initial", path: `${SHOTS}/06-student.png`, fullPage: true });
});

await step("student cannot access admin", async () => {
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await login(p2, "aluna@lc.test", "/admin");
  await p2.waitForURL(`${BASE}/`);
  await p2.getByText("IA para Negócios Locais").waitFor();
  await p2.screenshot({ caret: "initial", path: `${SHOTS}/07-student-home.png` });
  await ctx2.close();
});

await step("mobile admin", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(cohortUrl);
  await page.screenshot({ caret: "initial", path: `${SHOTS}/08-mobile-cohort.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error("horizontal overflow on mobile");
});

await browser.close();
console.log("console errors:", errors.length ? errors : "none");
