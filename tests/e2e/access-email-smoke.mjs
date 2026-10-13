// Teste ponta a ponta: e-mail de acesso no cadastro pelo admin, reenvio na ficha e teste em Integrações → E-mail.
// Usa um servidor falso no lugar do Resend. Rode o site assim (em outro terminal):
//   RESEND_API_KEY=re_test EMAIL_FROM="LC <a@lc.test>" RESEND_API_URL=http://127.0.0.1:4011 npm run dev
// e depois: node tests/e2e/access-email-smoke.mjs
import { createClient } from "@supabase/supabase-js";
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
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

// Resend falso: aceita, ou recusa como "domínio não verificado" quando refuse = true
const inbox = [];
let refuse = false;
const fake = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    if (refuse) {
      res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ message: "The lc.test domain is not verified." }));
      return;
    }
    inbox.push({ to: body.to[0], subject: body.subject, html: body.html });
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `em_${inbox.length}` }));
  });
});
await new Promise((r) => fake.listen(4011, "127.0.0.1", r));

await sb.from("courses").delete().eq("slug", "e2e-acesso");
const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => u.email?.startsWith("e2e-acesso"))) await sb.auth.admin.deleteUser(u.id);
const { data: admin } = await sb.auth.admin.createUser({
  email: "e2e-acesso-admin@lc.test",
  email_confirm: true,
  user_metadata: { full_name: "Admin Acesso" },
});
await must(sb.from("profiles").update({ role: "admin" }).eq("id", admin.user.id));
const course = await must(
  sb.from("courses").insert({ slug: "e2e-acesso", title: "E2E Plug Acesso", is_published: true }).select("id").single(),
);
await must(sb.from("cohorts").insert({ course_id: course.id, name: "Turma Acesso" }).select("id").single());

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const link = await must(sb.auth.admin.generateLink({ type: "magiclink", email: "e2e-acesso-admin@lc.test" }));
await page.goto(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=%2Fadmin%2Falunos`);

await step("cadastro com turma envia o e-mail de acesso e avisa na ficha", async () => {
  await page.getByText("Adicionar aluno manualmente").click();
  await page.locator("#new_email").fill("e2e-acesso-aluno@lc.test");
  await page.locator("#new_name").fill("Aluno Acesso");
  const option = await page.locator("#new_cohort option", { hasText: "Turma Acesso" }).getAttribute("value");
  await page.locator("#new_cohort").selectOption(option);
  await page.getByRole("button", { name: "Adicionar aluno" }).click();
  await page.getByText("E-mail de acesso enviado para e2e-acesso-aluno@lc.test.").waitFor({ timeout: 20000 });
  const mail = inbox.find((m) => m.to === "e2e-acesso-aluno@lc.test");
  assert(mail && /E2E Plug Acesso/.test(mail.subject) && /\/auth\/confirm\?token_hash=/.test(mail.html), JSON.stringify(mail));
});

await step("reenviar acesso pela ficha", async () => {
  await page.getByRole("button", { name: "Reenviar e-mail de acesso" }).click();
  for (let i = 0; i < 60 && inbox.filter((m) => m.to === "e2e-acesso-aluno@lc.test").length < 2; i++) await page.waitForTimeout(250);
  assert(inbox.filter((m) => m.to === "e2e-acesso-aluno@lc.test").length === 2, "segundo e-mail");
  await page.getByRole("status").filter({ hasText: "E-mail de acesso enviado" }).nth(1).waitFor();
});

await step("se o Resend recusa, a ficha mostra o motivo", async () => {
  refuse = true;
  await page.getByRole("button", { name: "Reenviar e-mail de acesso" }).click();
  await page.getByText(/NÃO foi enviado: o Resend recusou: resend_403: The lc.test domain is not verified/).waitFor();
  refuse = false;
});

await step("teste em Integrações → E-mail", async () => {
  await page.goto(`${BASE}/admin/integracoes/email`);
  await page.getByRole("button", { name: "Enviar e-mail de teste para mim" }).click();
  await page.getByText("Enviado para e2e-acesso-admin@lc.test").waitFor();
  assert(
    inbox.some((m) => m.to === "e2e-acesso-admin@lc.test" && m.subject === "Teste de e-mail da área de membros"),
    "e-mail de teste",
  );
});

await browser.close();
fake.close();
await sb.from("courses").delete().eq("slug", "e2e-acesso");
for (const u of (await sb.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.email?.startsWith("e2e-acesso")))
  await sb.auth.admin.deleteUser(u.id);
console.log("E-mail de acesso ok");
