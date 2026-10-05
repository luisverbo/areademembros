// Varredura de acessibilidade (axe) nas telas principais. Uso: npm run dev e depois: node tests/e2e/a11y-scan.mjs
// Usa os dados que já existem no banco local (curso publicado, aula, turma). Falha se houver violação séria ou crítica.
import AxeBuilder from "@axe-core/playwright";
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
const must = async (p) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};

const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => u.email?.startsWith("e2e-a11y"))) await sb.auth.admin.deleteUser(u.id);
const { data: created } = await sb.auth.admin.createUser({
  email: "e2e-a11y@lc.test",
  email_confirm: true,
  user_metadata: { full_name: "Admin A11y" },
});
await must(sb.from("profiles").update({ role: "admin", whatsapp: "+5511999990000" }).eq("id", created.user.id));

const course = await must(sb.from("courses").select("id, slug").eq("is_published", true).order("created_at").limit(1).maybeSingle());
const lesson = course
  ? await must(
      sb
        .from("lessons")
        .select("id, module:modules!inner(course_id)")
        .eq("module.course_id", course.id)
        .eq("is_published", true)
        .limit(1)
        .maybeSingle(),
    )
  : null;
const firstModule = course
  ? await must(sb.from("modules").select("id").eq("course_id", course.id).order("position").limit(1).maybeSingle())
  : null;
const cohort = course ? await must(sb.from("cohorts").select("id").eq("course_id", course.id).limit(1).maybeSingle()) : null;
const freeCourse = await must(sb.from("courses").select("slug").eq("is_free", true).eq("is_published", true).limit(1).maybeSingle());

const pages = [
  "/entrar",
  "/",
  course && `/curso/${course.slug}`,
  course && firstModule && `/curso/${course.slug}/modulo/${firstModule.id}`,
  lesson && `/aula/${lesson.id}`,
  "/caderno",
  "/busca?q=whatsapp",
  "/conta",
  "/conta/senha",
  freeCourse && `/gratis/${freeCourse.slug}`,
  "/certificado/000000000000",
  "/admin",
  "/admin/cursos",
  course && `/admin/cursos/${course.id}`,
  "/admin/turmas",
  cohort && `/admin/turmas/${cohort.id}`,
  "/admin/alunos",
  `/admin/alunos/${created.user.id}`,
  "/admin/radar",
  "/admin/desempenho",
  "/admin/mensagens",
  "/admin/mensagens/nova",
  "/admin/mensagens/automacoes",
  "/admin/integracoes",
  "/admin/integracoes/kiwify",
].filter(Boolean);

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
const link = await must(sb.auth.admin.generateLink({ type: "magiclink", email: "e2e-a11y@lc.test" }));
await page.goto(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=%2F`);
await page.waitForURL(`${BASE}/`);

let serious = 0;
for (const path of pages) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .exclude("iframe")
    .analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = results.violations.filter((v) => !(v.impact === "serious" || v.impact === "critical"));
  console.log(`${bad.length ? "✗" : "✓"} ${path}  (${bad.length} sérias, ${minor.length} menores)`);
  for (const v of results.violations) {
    console.log(`   [${v.impact}] ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 3)) console.log(`      ${n.target.join(" ")}`);
  }
  serious += bad.length;
}
await browser.close();
await sb.auth.admin.deleteUser(created.user.id);
if (serious) process.exit(1);
console.log("Acessibilidade ok");
