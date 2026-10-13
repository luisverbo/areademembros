// Teste ponta a ponta: módulos extras (order bump) dentro do curso, liberados pela compra na Kiwify.
// Uso: npm run dev (com KIWIFY_WEBHOOK_TOKEN no .env.local) e depois: node tests/e2e/order-bump-smoke.mjs
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
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
await sb.from("courses").delete().eq("slug", "e2e-plug");
await sb.from("webhook_events").delete().like("idempotency_key", "e2e-plug-%");
const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => u.email?.startsWith("e2e-plug"))) await sb.auth.admin.deleteUser(u.id);
const { data: adminUser } = await sb.auth.admin.createUser({
  email: "e2e-plug-admin@lc.test",
  email_confirm: true,
  user_metadata: { full_name: "Admin Plug" },
});
await must(sb.from("profiles").update({ role: "admin" }).eq("id", adminUser.user.id));

const course = await must(
  sb.from("courses").insert({ slug: "e2e-plug", title: "E2E Plug Editor", is_published: true }).select("id").single(),
);
const mods = await must(
  sb
    .from("modules")
    .insert([
      { course_id: course.id, title: "Começando", position: 0, is_addon: false, addon_checkout_url: null },
      {
        course_id: course.id,
        title: "Atualizações constantes",
        position: 1,
        is_addon: true,
        addon_checkout_url: "https://pay.kiwify.com.br/atualizacoes",
      },
      { course_id: course.id, title: "Suporte via WhatsApp", position: 2, is_addon: true, addon_checkout_url: null },
    ])
    .select("id, title"),
);
const modBy = Object.fromEntries(mods.map((m) => [m.title, m.id]));
const lessons = await must(
  sb
    .from("lessons")
    .insert([
      { module_id: modBy["Começando"], title: "Instalando o Plug", position: 0, is_published: true },
      { module_id: modBy["Atualizações constantes"], title: "Novidades da versão 2", position: 0, is_published: true },
      { module_id: modBy["Suporte via WhatsApp"], title: "Como chamar o suporte", position: 0, is_published: true },
    ])
    .select("id, title"),
);
const lessonBy = Object.fromEntries(lessons.map((l) => [l.title, l.id]));
for (const l of lessons)
  await must(sb.from("lesson_contents").insert({ lesson_id: l.id, video_provider: "youtube", video_id: "dQw4w9WgXcQ" }));
const cohort = await must(sb.from("cohorts").insert({ course_id: course.id, name: "Plug" }).select("id").single());
await must(
  sb.rpc("set_cohort_lessons", {
    p_cohort_id: cohort.id,
    p_items: lessons.map((l) => ({ lesson_id: l.id, release_at: null, release_offset_days: null })),
  }),
);
await must(sb.from("cohort_products").insert({ cohort_id: cohort.id, provider: "kiwify", external_product_id: "e2e-plug-main" }));
await must(
  sb.from("module_products").insert([
    { module_id: modBy["Atualizações constantes"], provider: "kiwify", external_product_id: "e2e-plug-upd" },
    { module_id: modBy["Suporte via WhatsApp"], provider: "kiwify", external_product_id: "e2e-plug-sup" },
  ]),
);

async function postKiwify(body) {
  const raw = JSON.stringify(body);
  const sig = createHmac("sha1", env.KIWIFY_WEBHOOK_TOKEN).update(raw).digest("hex");
  const res = await fetch(`${BASE}/api/webhooks/kiwify?signature=${sig}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
  return { status: res.status, body: await res.json() };
}
const order = (id, type, status, email, name, products, bumps = []) => ({
  order_id: id,
  order_status: status,
  webhook_event_type: type,
  Product: { product_id: products, product_name: "x" },
  order_bumps: bumps.map((b) => ({ product_id: b })),
  Customer: { full_name: name, email },
});
const grantsOf = async (email) => {
  const p = await must(sb.from("profiles").select("id").eq("email", email).single());
  const g = await must(sb.from("module_grants").select("module_id, status").eq("user_id", p.id));
  const e = await must(sb.from("enrollments").select("status").eq("user_id", p.id).eq("cohort_id", cohort.id).maybeSingle());
  return {
    userId: p.id,
    grants: Object.fromEntries(g.map((x) => [mods.find((m) => m.id === x.module_id).title, x.status])),
    enrollment: e?.status,
  };
};

await step("compra com order bump no MESMO aviso libera o curso e o extra", async () => {
  const r = await postKiwify(
    order("e2e-plug-o1", "order_approved", "paid", "e2e-plug-ana@lc.test", "Ana Bump", "e2e-plug-main", ["e2e-plug-upd"]),
  );
  assert(r.status === 200 && r.body.result === "processed", JSON.stringify(r));
  const ana = await grantsOf("e2e-plug-ana@lc.test");
  assert(ana.enrollment === "active", "matrícula");
  assert(ana.grants["Atualizações constantes"] === "active" && !ana.grants["Suporte via WhatsApp"], JSON.stringify(ana.grants));
});

await step("bump em aviso SEPARADO (só o produto do extra) libera só o extra", async () => {
  const r = await postKiwify(order("e2e-plug-o2", "order_approved", "paid", "e2e-plug-ana@lc.test", "Ana Bump", "e2e-plug-sup"));
  assert(r.status === 200 && r.body.result === "processed", JSON.stringify(r));
  const ana = await grantsOf("e2e-plug-ana@lc.test");
  assert(ana.grants["Suporte via WhatsApp"] === "active", JSON.stringify(ana.grants));
});

await step("compra sem bump: só o curso", async () => {
  await postKiwify(order("e2e-plug-o3", "order_approved", "paid", "e2e-plug-bruno@lc.test", "Bruno Sembump", "e2e-plug-main"));
  const bruno = await grantsOf("e2e-plug-bruno@lc.test");
  assert(bruno.enrollment === "active" && !Object.keys(bruno.grants).length, JSON.stringify(bruno));
});

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

await step("sem o extra: aparece dentro do curso com cadeado e botão de desbloquear", async () => {
  const page = await loginPage("e2e-plug-bruno@lc.test", "/curso/e2e-plug");
  await page.getByRole("heading", { name: "Módulos" }).waitFor({ timeout: 20000 });
  const card = page.getByRole("link", { name: /Atualizações constantes/ });
  assert(/extra/i.test(await card.innerText()) && /Conteúdo extra/i.test(await card.innerText()), await card.innerText());
  assert(/0 de 1 aulas concluídas/.test(await page.locator("main").innerText()), "progresso do curso só conta o que ele tem");
  await page.screenshot({ path: `${SHOTS}/bump-curso.png`, caret: "initial", fullPage: true });
  await card.click();
  await page.getByText("Este módulo é um conteúdo extra do curso").waitFor();
  const buy = page.getByRole("link", { name: "Desbloquear este extra" });
  assert((await buy.getAttribute("href"))?.startsWith("https://pay.kiwify.com.br/atualizacoes"), "link do checkout do extra");
  await page.screenshot({ path: `${SHOTS}/bump-modulo.png`, caret: "initial", fullPage: true });
  await page.goto(`${BASE}/aula/${lessonBy["Novidades da versão 2"]}`);
  await page.getByText("Esta aula faz parte de um conteúdo extra do curso.").waitFor();
  assert(!(await page.locator("iframe").count()), "vídeo do extra não pode aparecer");
  await page.close();
});

await step("com o extra: assiste normalmente", async () => {
  const page = await loginPage("e2e-plug-ana@lc.test", `/aula/${lessonBy["Novidades da versão 2"]}`);
  await page.locator("iframe").first().waitFor({ state: "attached", timeout: 20000 });
  await page.close();
});

await step("reembolso do bump separado tira só o extra", async () => {
  const r = await postKiwify(order("e2e-plug-o2", "order_refunded", "refunded", "e2e-plug-ana@lc.test", "Ana Bump", "e2e-plug-sup"));
  assert(r.status === 200 && r.body.result === "processed", JSON.stringify(r));
  const ana = await grantsOf("e2e-plug-ana@lc.test");
  assert(ana.enrollment === "active", "curso continua");
  assert(
    ana.grants["Suporte via WhatsApp"] === "refunded" && ana.grants["Atualizações constantes"] === "active",
    JSON.stringify(ana.grants),
  );
});

await step("admin libera o extra à mão na ficha do aluno", async () => {
  const bruno = await grantsOf("e2e-plug-bruno@lc.test");
  const admin = await loginPage("e2e-plug-admin@lc.test", `/admin/alunos/${bruno.userId}`);
  await admin.getByLabel("Liberar módulo extra").selectOption(modBy["Suporte via WhatsApp"]);
  await admin.getByRole("button", { name: "Liberar" }).last().click();
  await admin.getByText("Módulo extra liberado para o aluno.").waitFor();
  const after = await grantsOf("e2e-plug-bruno@lc.test");
  assert(after.grants["Suporte via WhatsApp"] === "active", JSON.stringify(after.grants));
  await admin.goto(`${BASE}/admin/cursos/${course.id}`);
  await admin.getByText("Extra pago", { exact: true }).first().waitFor();
  await admin.getByText("Módulo extra (order bump)").nth(1).click();
  await admin.getByText("e2e-plug-upd").waitFor();
  await admin.screenshot({ path: `${SHOTS}/bump-admin.png`, caret: "initial", fullPage: true });
  await admin.close();
});

await browser.close();
await sb.from("courses").delete().eq("slug", "e2e-plug");
await sb.from("webhook_events").delete().like("idempotency_key", "e2e-plug-%");
for (const u of (await sb.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.email?.startsWith("e2e-plug")))
  await sb.auth.admin.deleteUser(u.id);
if (errors.length) {
  console.error("Erros no navegador:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Order bump ok");
