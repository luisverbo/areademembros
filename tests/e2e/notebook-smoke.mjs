// Teste ponta a ponta da Etapa 2B: caderno com minuto, Meu Caderno, exportação, oferta na aula e prévia de curso bloqueado.
// Uso: npm run dev (em outro terminal) e depois: node tests/e2e/notebook-smoke.mjs
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
await sb.from("courses").delete().in("slug", ["e2e-caderno", "e2e-caderno-vitrine"]);
const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => u.email?.startsWith("e2e-caderno"))) await sb.auth.admin.deleteUser(u.id);
const { data: created } = await sb.auth.admin.createUser({
  email: "e2e-caderno@lc.test",
  email_confirm: true,
  user_metadata: { full_name: "Aluna Caderno" },
});
const studentId = created.user.id;

const course = await must(
  sb.from("courses").insert({ slug: "e2e-caderno", title: "E2E Caderno Curso", is_published: true }).select("id").single(),
);
const mod = await must(sb.from("modules").insert({ course_id: course.id, title: "M1" }).select("id").single());
const lesson = await must(
  sb
    .from("lessons")
    .insert({
      module_id: mod.id,
      title: "Aula do caderno",
      is_published: true,
      offer_at_seconds: 0,
      offer_label: "Garanta a mentoria",
      offer_url: "https://exemplo.com/oferta",
    })
    .select("id")
    .single(),
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

// Curso que a aluna não tem, com trailer configurado.
const locked = await must(
  sb.from("courses").insert({ slug: "e2e-caderno-vitrine", title: "E2E Vitrine Bloqueada", is_published: true }).select("id").single(),
);
const lmod = await must(sb.from("modules").insert({ course_id: locked.id, title: "M1" }).select("id").single());
const llesson = await must(sb.from("lessons").insert({ module_id: lmod.id, title: "Trailer", is_published: true }).select("id").single());
await must(sb.from("lesson_contents").insert({ lesson_id: llesson.id, video_provider: "youtube", video_id: "dQw4w9WgXcQ" }));
const sales = await must(
  sb.from("cohorts").insert({ course_id: locked.id, name: "Venda", checkout_url: "https://exemplo.com/checkout" }).select("id").single(),
);
await must(
  sb
    .from("courses")
    .update({ sales_cohort_id: sales.id, preview_lesson_id: llesson.id, preview_start_seconds: 10, preview_end_seconds: 40 })
    .eq("id", locked.id),
);

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const errors = [];
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/youtube|mediadelivery|net::ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text());
});
const link = await must(sb.auth.admin.generateLink({ type: "magiclink", email: "e2e-caderno@lc.test" }));
await page.goto(
  `${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=${encodeURIComponent(`/aula/${lesson.id}?t=95`)}`,
);

await step("oferta aparece sobre o vídeo e fecha", async () => {
  const offer = page.getByRole("link", { name: /Garanta a mentoria/ });
  await offer.waitFor({ timeout: 15000 });
  assert((await offer.getAttribute("href")) === "https://exemplo.com/oferta", "link da oferta");
  await page.screenshot({ path: `${SHOTS}/2b-oferta.png`, caret: "initial" });
  await page.getByRole("button", { name: "Fechar oferta" }).click();
  await offer.waitFor({ state: "detached" });
});

await step("nova nota com o minuto do vídeo e salvamento automático", async () => {
  await page.getByRole("tab", { name: /Caderno/ }).click();
  const add = page.getByRole("button", { name: /Nova nota em/ });
  await add.waitFor();
  await add.click();
  const box = page.getByRole("textbox", { name: /Nota/ }).first();
  await box.waitFor();
  await box.fill("Lembrar de testar o webhook antes de publicar");
  // espera o autosave (debounce)
  await page.waitForTimeout(1800);
  const rows = await must(sb.from("notes").select("content, timestamp_seconds").eq("user_id", studentId));
  assert(rows.length === 1, `uma nota salva (veio ${rows.length})`);
  assert(rows[0].content.includes("webhook"), "conteúdo salvo");
  assert(rows[0].timestamp_seconds !== null, "minuto salvo");
  await page.screenshot({ path: `${SHOTS}/2b-caderno-aula.png`, caret: "initial" });
});

await step("Meu Caderno lista, busca e exporta PDF e Word", async () => {
  await page.goto(`${BASE}/caderno`);
  await page.getByText("Lembrar de testar o webhook").waitFor();
  await page.getByRole("textbox", { name: "Buscar nas suas anotações" }).fill("inexistente-xyz");
  assert(!(await page.getByText("Lembrar de testar o webhook").isVisible()), "busca filtra");
  await page.getByRole("textbox", { name: "Buscar nas suas anotações" }).fill("webhook");
  await page.getByText("Lembrar de testar o webhook").waitFor();
  await page.screenshot({ path: `${SHOTS}/2b-meu-caderno.png`, caret: "initial" });
  for (const [formato, magic] of [
    ["pdf", "%PDF"],
    ["docx", "PK"],
  ]) {
    const res = await page.request.get(`${BASE}/caderno/exportar?formato=${formato}`);
    assert(res.ok(), `exportar ${formato}: ${res.status()}`);
    const body = await res.body();
    assert(body.subarray(0, magic.length).toString("latin1") === magic, `arquivo ${formato} válido`);
    assert(/attachment/.test(res.headers()["content-disposition"] ?? ""), `download ${formato}`);
  }
});

await step("exportação exige login", async () => {
  const anon = await browser.newContext();
  const res = await anon.request.get(`${BASE}/caderno/exportar?formato=pdf`, { maxRedirects: 0 });
  assert(res.status() >= 300 && res.status() < 400, `sem login deveria redirecionar (veio ${res.status()})`);
  await anon.close();
});

await step("prévia do curso bloqueado ao passar o mouse", async () => {
  await page.goto(`${BASE}/`);
  const card = page.getByRole("link", { name: /E2E Vitrine Bloqueada \(desbloquear\)/ });
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  const dialog = page.getByRole("dialog", { name: /Prévia de E2E Vitrine Bloqueada/ });
  await dialog.waitFor({ timeout: 5000 });
  const src = await dialog.locator("iframe").getAttribute("src");
  assert(
    src?.includes("youtube-nocookie.com") && src.includes("start=10") && src.includes("end=40") && src.includes("mute=1"),
    `src: ${src}`,
  );
  assert(
    (await dialog.getByRole("link", { name: "Desbloquear" }).getAttribute("href"))?.startsWith("https://exemplo.com/checkout"),
    "checkout",
  );
  assert((await dialog.getByRole("link", { name: "Ver detalhes" }).getAttribute("href")) === "/curso/e2e-caderno-vitrine", "detalhes");
  await page.screenshot({ path: `${SHOTS}/2b-previa.png`, caret: "initial" });
  await page.mouse.move(5, 5);
  await dialog.waitFor({ state: "detached" });
});

await browser.close();
await sb.from("courses").delete().in("slug", ["e2e-caderno", "e2e-caderno-vitrine"]);
await sb.auth.admin.deleteUser(studentId);
if (errors.length) {
  console.error("Erros no navegador:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Etapa 2B ok");
