// Teste de fumaça do login com senha e do "primeiro acesso / esqueci a senha".
// Uso: npm run dev (em outro terminal) e depois: node tests/e2e/password-smoke.mjs
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
const EMAIL = "e2e-senha@lc.test";

const { data: list } = await sb.auth.admin.listUsers();
for (const u of list.users.filter((u) => u.email === EMAIL)) await sb.auth.admin.deleteUser(u.id);
const { data: created, error } = await sb.auth.admin.createUser({
  email: EMAIL,
  password: "senha-inicial-123",
  email_confirm: true,
  user_metadata: { full_name: "Ana Senha" },
});
if (error) throw error;

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const step = async (name, fn) => {
  process.stdout.write(`- ${name} ... `);
  await fn();
  console.log("ok");
};

async function login(password) {
  await page.goto(`${BASE}/entrar`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

await step("senha errada mostra mensagem clara", async () => {
  await login("errada-000");
  await page.getByText("E-mail ou senha incorretos").waitFor();
});

await step("entra com e-mail e senha", async () => {
  await login("senha-inicial-123");
  await page.waitForURL(`${BASE}/`);
});

await step("sair", async () => {
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL(`${BASE}/entrar`);
});

await step("aba de link por e-mail continua disponível", async () => {
  await page.getByRole("tab", { name: "Link por e-mail" }).click();
  await page.getByRole("button", { name: "Receber link de acesso" }).waitFor();
});

await step("primeiro acesso: pedir link", async () => {
  await page.getByRole("tab", { name: "Com senha" }).click();
  await page.getByRole("link", { name: "Primeiro acesso ou esqueci a senha" }).click();
  await page.waitForURL(`${BASE}/entrar/senha`);
  await page.fill("#email", "ninguem@lc.test");
  await page.getByRole("button", { name: "Enviar link para criar a senha" }).click();
  await page.getByText("Se ninguem@lc.test tiver acesso").waitFor();
});

await step("link de recuperação leva a criar a senha", async () => {
  const { data } = await sb.auth.admin.generateLink({ type: "recovery", email: EMAIL });
  await page.goto(`${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/conta/senha`);
  await page.waitForURL(`${BASE}/conta/senha`);
  await page.fill("#password", "nova-senha-456");
  await page.fill("#confirm", "outra-coisa-789");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await page.getByText("As senhas não conferem.").waitFor();
  await page.fill("#password", "nova-senha-456");
  await page.fill("#confirm", "nova-senha-456");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await page.getByText("Senha salva.").waitFor();
});

await step("entra com a senha nova", async () => {
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL(`${BASE}/entrar`);
  await login("nova-senha-456");
  await page.waitForURL(`${BASE}/`);
});

await browser.close();
await sb.auth.admin.deleteUser(created.user.id);
console.log("page errors:", errors.length ? errors : "none");
if (errors.length) process.exit(1);
