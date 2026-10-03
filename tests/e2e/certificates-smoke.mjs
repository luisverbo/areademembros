// Teste ponta a ponta da Etapa 3B: certificado, verificação pública, recomendação e painel de desempenho.
// Uso: npm run dev (em outro terminal) e depois: node tests/e2e/certificates-smoke.mjs
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
await sb.from("courses").delete().in("slug", ["e2e-cert", "e2e-cert-proximo"]);
const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => u.email?.startsWith("e2e-cert"))) await sb.auth.admin.deleteUser(u.id);
async function user(email, name, extra = {}) {
  const { data } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: name ? { full_name: name } : {} });
  if (Object.keys(extra).length) await must(sb.from("profiles").update(extra).eq("id", data.user.id));
  return data.user.id;
}
const adminId = await user("e2e-cert-admin@lc.test", "Admin Cert", { role: "admin" });
const gabiId = await user("e2e-cert-gabi@lc.test", "Gabriela Certificada");
const semNomeId = await user("e2e-cert-semnome@lc.test", null);

const course = await must(
  sb
    .from("courses")
    .insert({ slug: "e2e-cert", title: "E2E Certificado", is_published: true, certificate_enabled: true })
    .select("id")
    .single(),
);
const nextCourse = await must(
  sb
    .from("courses")
    .insert({ slug: "e2e-cert-proximo", title: "E2E Próximo Passo", is_published: true, showcase_order: 999 })
    .select("id")
    .single(),
);
const mod = await must(sb.from("modules").insert({ course_id: course.id, title: "M1" }).select("id").single());
const lessons = await must(
  sb
    .from("lessons")
    .insert([
      { module_id: mod.id, title: "Aula um", position: 0, is_published: true, duration_seconds: 1800 },
      { module_id: mod.id, title: "Aula dois", position: 1, is_published: true, duration_seconds: 1800 },
    ])
    .select("id, title"),
);
lessons.sort((a, b) => a.title.localeCompare(b.title) * -1); // "Aula um" antes de "Aula dois"
for (const l of lessons)
  await must(sb.from("lesson_contents").insert({ lesson_id: l.id, video_provider: "youtube", video_id: "dQw4w9WgXcQ" }));
const cohort = await must(sb.from("cohorts").insert({ course_id: course.id, name: "T-Cert" }).select("id").single());
await must(
  sb.rpc("set_cohort_lessons", {
    p_cohort_id: cohort.id,
    p_items: lessons.map((l) => ({ lesson_id: l.id, release_at: null, release_offset_days: null })),
  }),
);
await must(sb.from("enrollments").insert([gabiId, semNomeId].map((user_id) => ({ user_id, cohort_id: cohort.id, origin: "purchase" }))));
// As duas alunas já concluíram a primeira aula; a sem nome concluiu tudo.
await must(
  sb
    .from("lesson_progress")
    .insert([
      { user_id: gabiId, lesson_id: lessons[0].id, percent: 100, completed_at: new Date().toISOString() },
      ...lessons.map((l) => ({ user_id: semNomeId, lesson_id: l.id, percent: 100, completed_at: new Date().toISOString() })),
    ]),
);

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const errors = [];
async function loginPage(email, next) {
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/youtube|net::ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text());
  });
  const link = await must(sb.auth.admin.generateLink({ type: "magiclink", email }));
  await page.goto(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=${encodeURIComponent(next)}`);
  return page;
}

let code;
await step("admin define carga horária e próximo curso", async () => {
  const admin = await loginPage("e2e-cert-admin@lc.test", `/admin/cursos/${course.id}`);
  await admin.getByLabel("Carga horária (horas)").fill("8");
  await admin.getByLabel("Próximo curso recomendado").selectOption(nextCourse.id);
  await admin.getByRole("button", { name: "Salvar curso" }).click();
  await admin.getByText(/salvo/i).first().waitFor();
  const saved = await must(
    sb.from("courses").select("certificate_hours, next_course_id, certificate_enabled").eq("id", course.id).single(),
  );
  assert(saved.certificate_hours === 8 && saved.next_course_id === nextCourse.id && saved.certificate_enabled, JSON.stringify(saved));
  await admin.close();
});

const page = await loginPage("e2e-cert-gabi@lc.test", `/aula/${lessons[1].id}`);

await step("vitrine: o próximo curso recomendado vem primeiro em 'Mais cursos'", async () => {
  await page.goto(`${BASE}/`);
  const row = page.locator("section", { has: page.getByRole("heading", { name: /Mais cursos para você/ }) });
  await row.waitFor();
  const first = await row
    .getByRole("link")
    .first()
    .getAttribute("aria-label")
    .catch(() => null);
  const firstText = first ?? (await row.getByRole("link").first().innerText());
  assert(/E2E Próximo Passo/.test(firstText), `primeiro card: ${firstText}`);
});

await step("concluir a última aula libera certificado e próximo passo", async () => {
  await page.goto(`${BASE}/curso/e2e-cert`);
  assert(!(await page.getByText("Você concluiu este curso!").count()), "ainda não concluiu");
  await page.goto(`${BASE}/aula/${lessons[1].id}`);
  await page.getByRole("button", { name: "Marcar como concluída" }).click();
  await page.getByRole("button", { name: "Concluída" }).waitFor();
  await page.goto(`${BASE}/curso/e2e-cert`);
  await page.getByText("Você concluiu este curso!").waitFor();
  await page.getByRole("link", { name: "Ver E2E Próximo Passo" }).waitFor();
  await page.screenshot({ path: `${SHOTS}/3b-concluido.png`, caret: "initial" });
  const res = await page.request.get(`${BASE}/curso/e2e-cert/certificado`);
  assert(res.ok() && (await res.body()).subarray(0, 4).toString() === "%PDF", `PDF: ${res.status()}`);
  assert(/attachment; filename="certificado-e2e-cert.pdf"/.test(res.headers()["content-disposition"]), "download");
  const cert = await must(sb.from("certificates").select("code, hours, student_name").eq("user_id", gabiId).single());
  assert(cert.hours === 8 && cert.student_name === "Gabriela Certificada", JSON.stringify(cert));
  code = cert.code;
  await page.goto(`${BASE}/conta`);
  await page.getByText(`código ${code}`).waitFor();
});

await step("verificação pública do certificado", async () => {
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${BASE}/certificado/${code}`);
  await anon.getByText("Certificado válido").waitFor();
  await anon.getByRole("heading", { name: "Gabriela Certificada" }).waitFor();
  await anon.screenshot({ path: `${SHOTS}/3b-verificar.png`, caret: "initial" });
  await anon.goto(`${BASE}/certificado/000000000000`);
  await anon.getByRole("heading", { name: "Certificado não encontrado" }).waitFor();
});

await step("sem nome: pede o nome antes de emitir", async () => {
  const p = await loginPage("e2e-cert-semnome@lc.test", "/curso/e2e-cert");
  await p.getByRole("link", { name: "Baixar certificado" }).click();
  await p.waitForURL(/\/conta\?certificado=e2e-cert/);
  await p.getByText("Para emitir o certificado").waitFor();
  await p.getByLabel("Nome completo").fill("Helena Sem Nome Antes");
  await p.getByRole("button", { name: "Salvar" }).click();
  await p.getByText("Dados salvos.").waitFor();
  const res = await p.request.get(`${BASE}/curso/e2e-cert/certificado`);
  assert(res.ok() && (await res.body()).subarray(0, 4).toString() === "%PDF", `PDF depois do nome: ${res.status()}`);
  await p.close();
});

await step("painel de desempenho mostra a turma e o abandono por aula", async () => {
  const admin = await loginPage("e2e-cert-admin@lc.test", `/admin/desempenho?turma=${cohort.id}`);
  await admin.getByRole("heading", { name: "Desempenho" }).waitFor();
  const funnel = admin.getByRole("list", { name: "Porcentagem que concluiu cada aula" });
  const text = await funnel.innerText();
  assert(/Aula um[\s\S]*100%[\s\S]*Aula dois[\s\S]*100%/.test(text), `funil: ${text}`);
  const row = admin.getByRole("row", { name: /T-Cert/ });
  assert(/T-Cert[\s\S]*2[\s\S]*100%/.test(await row.innerText()), await row.innerText());
  await admin.screenshot({ path: `${SHOTS}/3b-desempenho.png`, caret: "initial", fullPage: true });
});

await browser.close();
await sb.from("courses").delete().in("slug", ["e2e-cert", "e2e-cert-proximo"]);
for (const id of [adminId, gabiId, semNomeId]) await sb.auth.admin.deleteUser(id);
if (errors.length) {
  console.error("Erros no navegador:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Etapa 3B ok");
