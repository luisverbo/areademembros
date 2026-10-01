// Teste ponta a ponta da Etapa 1C: webhooks de pagamento, curso grátis com lead e webhook de saída.
// Uso: npm run dev (com KIWIFY_WEBHOOK_TOKEN, HOTMART_HOTTOK e YAMPI_WEBHOOK_SECRET no .env.local)
//      e depois: node tests/e2e/webhooks-smoke.mjs
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
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
const step = async (name, fn) => {
  process.stdout.write(`- ${name} ... `);
  await fn();
  console.log("ok");
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Receptor local fazendo papel do FunilPro
const received = [];
const SECRET = "funil-secret";
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const expected = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
    received.push({ event: req.headers["x-lc-event"], valid: req.headers["x-lc-signature"] === expected, body: JSON.parse(body) });
    res.end("ok");
  });
});
await new Promise((r) => server.listen(4599, r));

// Limpeza de execuções anteriores
for (const slug of ["e2e-pago", "e2e-free"]) await sb.from("courses").delete().eq("slug", slug);
await sb.from("outgoing_webhooks").delete().like("name", "e2e%");
await sb.from("webhook_events").delete().like("idempotency_key", "e2e-%");
const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of users.users.filter((u) => u.email?.startsWith("e2e-wh"))) await sb.auth.admin.deleteUser(u.id);

// Dados
const course = await must(
  sb.from("courses").insert({ slug: "e2e-pago", title: "E2E Curso Pago", is_published: true }).select("id").single(),
);
const cohort = await must(sb.from("cohorts").insert({ course_id: course.id, name: "Perpétua", access_months: 12 }).select("id").single());
await must(
  sb.from("cohort_products").insert([
    { cohort_id: cohort.id, provider: "kiwify", external_product_id: "e2e-kw-prod" },
    { cohort_id: cohort.id, provider: "hotmart", external_product_id: "777001" },
    { cohort_id: cohort.id, provider: "yampi", external_product_id: "88001" },
  ]),
);
await must(
  sb.from("outgoing_webhooks").insert({
    name: "e2e FunilPro",
    url: "http://localhost:4599/hook",
    secret: SECRET,
    events: ["lead.created", "purchase.approved", "purchase.refunded"],
  }),
);

const kiwiOrder = (status, type) => ({
  order_id: "e2e-kw-order-1",
  order_status: status,
  webhook_event_type: type,
  Product: { product_id: "e2e-kw-prod", product_name: "Curso" },
  Customer: { full_name: "Carla Webhook", email: "e2e-wh-carla@lc.test", mobile: "+5511988887777" },
});
async function postKiwify(body, token = env.KIWIFY_WEBHOOK_TOKEN) {
  const raw = JSON.stringify(body);
  const sig = createHmac("sha1", token).update(raw).digest("hex");
  const res = await fetch(`${BASE}/api/webhooks/kiwify?signature=${sig}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
  return { status: res.status, body: await res.json() };
}
const enrollmentOf = async (email) => {
  const p = await must(sb.from("profiles").select("id, full_name, whatsapp").eq("email", email).maybeSingle());
  if (!p) return null;
  const e = await must(sb.from("enrollments").select("*").eq("user_id", p.id).eq("cohort_id", cohort.id).maybeSingle());
  return { profile: p, enrollment: e };
};

await step("Kiwify: assinatura errada é recusada", async () => {
  const r = await postKiwify(kiwiOrder("paid", "order_approved"), "token-errado");
  assert(r.status === 401, `esperava 401, veio ${r.status}`);
});

await step("Kiwify: compra aprovada cria aluno e matrícula", async () => {
  const r = await postKiwify(kiwiOrder("paid", "order_approved"));
  assert(r.status === 200 && r.body.result === "processed", JSON.stringify(r));
  const x = await enrollmentOf("e2e-wh-carla@lc.test");
  assert(x?.enrollment?.status === "active", "matrícula não ativa");
  assert(
    x.enrollment.origin === "purchase" && x.enrollment.provider === "kiwify" && x.enrollment.external_transaction_id === "e2e-kw-order-1",
    "dados da venda",
  );
  assert(x.enrollment.expires_at, "prazo de 12 meses não aplicado");
  assert(x.profile.full_name === "Carla Webhook" && x.profile.whatsapp === "+5511988887777", "perfil incompleto");
});

await step("Kiwify: mesmo aviso de novo não duplica", async () => {
  const r = await postKiwify(kiwiOrder("paid", "order_approved"));
  assert(r.status === 200 && r.body.duplicate === true, JSON.stringify(r.body));
});

await step("Kiwify: reembolso tira o acesso", async () => {
  const r = await postKiwify(kiwiOrder("refunded", "order_refunded"));
  assert(r.status === 200 && r.body.result === "processed", JSON.stringify(r.body));
  const x = await enrollmentOf("e2e-wh-carla@lc.test");
  assert(x.enrollment.status === "refunded", "continua ativa");
});

await step("Kiwify: produto não ligado é ignorado (ex.: teste do painel)", async () => {
  const r = await postKiwify({ ...kiwiOrder("paid", "order_approved"), order_id: "e2e-kw-order-2", Product: { product_id: "22" } });
  assert(r.status === 200 && r.body.result === "ignored", JSON.stringify(r.body));
});

await step("Hotmart: hottok errado recusado; compra aprovada matricula", async () => {
  const body = {
    id: "e2e-hm-evt-1",
    event: "PURCHASE_APPROVED",
    data: { product: { id: 777001 }, buyer: { email: "e2e-wh-hugo@lc.test", name: "Hugo Hotmart" }, purchase: { transaction: "HP-E2E-1" } },
  };
  const bad = await fetch(`${BASE}/api/webhooks/hotmart`, {
    method: "POST",
    headers: { "X-HOTMART-HOTTOK": "x" },
    body: JSON.stringify(body),
  });
  assert(bad.status === 401, "hottok errado passou");
  const ok = await fetch(`${BASE}/api/webhooks/hotmart`, {
    method: "POST",
    headers: { "X-HOTMART-HOTTOK": env.HOTMART_HOTTOK },
    body: JSON.stringify(body),
  });
  assert(ok.status === 200, `status ${ok.status}`);
  assert((await enrollmentOf("e2e-wh-hugo@lc.test"))?.enrollment?.status === "active", "sem matrícula");
});

await step("Yampi: assinatura base64 e matrícula pelo SKU", async () => {
  const body = {
    event: "order.paid",
    resource: {
      id: 990001,
      status: { data: { alias: "paid" } },
      customer: { data: { email: "e2e-wh-yara@lc.test", name: "Yara Yampi" } },
      items: { data: [{ sku_id: 88001 }] },
    },
  };
  const raw = JSON.stringify(body);
  const sig = createHmac("sha256", env.YAMPI_WEBHOOK_SECRET).update(raw).digest("base64");
  const res = await fetch(`${BASE}/api/webhooks/yampi`, { method: "POST", headers: { "X-Yampi-Hmac-SHA256": sig }, body: raw });
  assert(res.status === 200, `status ${res.status}`);
  assert((await enrollmentOf("e2e-wh-yara@lc.test"))?.enrollment?.status === "active", "sem matrícula");
});

await step("Plataforma sem chave configurada responde 503", async () => {
  const res = await fetch(`${BASE}/api/webhooks/asaas`, { method: "POST", body: "{}" });
  assert(res.status === 503, `status ${res.status}`);
});

await step("Webhook de saída recebeu compra e reembolso, assinados", async () => {
  await sleep(1500);
  const events = received.map((r) => r.event);
  assert(events.includes("purchase.approved") && events.includes("purchase.refunded"), JSON.stringify(events));
  assert(
    received.every((r) => r.valid),
    "assinatura inválida",
  );
});

// ---------------- curso grátis ----------------
const free = await must(
  sb
    .from("courses")
    .insert({
      slug: "e2e-free",
      title: "E2E Grátis",
      is_published: true,
      is_free: true,
      lead_fields: "name_email_whatsapp",
      lead_access: "direct",
    })
    .select("id")
    .single(),
);
const fm = await must(sb.from("modules").insert({ course_id: free.id, title: "M" }).select("id").single());
await must(sb.from("lessons").insert({ module_id: fm.id, title: "Aula aberta", is_published: true }));

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});

await step("Curso grátis: cadastro rápido entra direto e vira lead", async () => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/gratis/e2e-free?utm_source=instagram&utm_campaign=lancamento`);
  await page.fill("#name", "Lia Lead");
  await page.fill("#email", "e2e-wh-lia@lc.test");
  await page.fill("#whatsapp", "(11) 97777-6666");
  await page.check('input[name="consent"]');
  await page.getByRole("button", { name: "Assistir agora" }).click();
  await page.waitForURL(`${BASE}/curso/e2e-free`);
  await page.getByText("Aula aberta").waitFor();
  const p = await must(sb.from("profiles").select("id, whatsapp, marketing_consent").eq("email", "e2e-wh-lia@lc.test").single());
  assert(p.whatsapp === "+5511977776666" && p.marketing_consent, "perfil do lead");
  const leads = await must(sb.from("leads").select("utm, source").eq("user_id", p.id));
  assert(leads.length === 1 && leads[0].utm.utm_source === "instagram", JSON.stringify(leads));
});

await step("Curso grátis: e-mail de aluno pagante exige senha", async () => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/gratis/e2e-free`);
  await page.fill("#name", "Hugo");
  await page.fill("#email", "e2e-wh-hugo@lc.test");
  await page.fill("#whatsapp", "11999990000");
  await page.check('input[name="consent"]');
  await page.getByRole("button", { name: "Assistir agora" }).click();
  await page.getByText("Este e-mail já tem acesso").waitFor();
  await page.getByRole("link", { name: "Entrar com minha senha" }).waitFor();
  assert(!page.url().includes("/curso/"), "abriu a conta do pagante");
});

await step("Curso grátis: sem aceite não libera", async () => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/gratis/e2e-free`);
  const required = await page.locator('input[name="consent"]').evaluate((el) => el.required);
  assert(required, "aceite deveria ser obrigatório");
});

await step("Webhook de saída recebeu o lead com UTM", async () => {
  await sleep(1500);
  const lead = received.find((r) => r.event === "lead.created");
  assert(lead && lead.valid, "lead não chegou");
  assert(lead.body.data.lead.email === "e2e-wh-lia@lc.test" && lead.body.data.utm.utm_campaign === "lancamento", JSON.stringify(lead.body));
});

await browser.close();
server.close();
for (const slug of ["e2e-pago", "e2e-free"]) await sb.from("courses").delete().eq("slug", slug);
await sb.from("outgoing_webhooks").delete().like("name", "e2e%");
const { data: after } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of after.users.filter((u) => u.email?.startsWith("e2e-wh"))) await sb.auth.admin.deleteUser(u.id);
console.log("todos os passos ok");
