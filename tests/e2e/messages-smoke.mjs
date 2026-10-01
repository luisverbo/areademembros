// Teste ponta a ponta da Etapa 3A: Central de Mensagens, automações, descadastro e alerta urgente.
// Usa um servidor falso no lugar do Resend e da Z-API. Rode o site assim (em outro terminal):
//   RESEND_API_KEY=re_test EMAIL_FROM="LC <a@lc.test>" RESEND_API_URL=http://127.0.0.1:4010 \
//   WHATSAPP_PROVIDER=zapi ZAPI_INSTANCE_ID=inst ZAPI_TOKEN=ztok ZAPI_CLIENT_TOKEN=ctok ZAPI_API_URL=http://127.0.0.1:4010 \
//   CRON_SECRET=cron-test-secret npm run dev
// e depois: node tests/e2e/messages-smoke.mjs
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
const waitFor = async (fn, what, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`tempo esgotado: ${what}`);
};

// Servidor falso (Resend + Z-API)
const inbox = [];
const fake = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    if (req.url === "/emails") {
      inbox.push({ kind: "email", to: body.to[0], subject: body.subject, text: body.text, html: body.html, headers: body.headers ?? {} });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `em_${inbox.length}` }));
    } else if (/^\/instances\/inst\/token\/ztok\/send-text$/.test(req.url) && req.headers["client-token"] === "ctok") {
      inbox.push({ kind: "whatsapp", to: body.phone, text: body.message });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ messageId: `wa_${inbox.length}` }));
    } else {
      res.writeHead(404).end();
    }
  });
});
await new Promise((r) => fake.listen(4010, "127.0.0.1", r));

// limpeza + dados
await sb.from("courses").delete().eq("slug", "e2e-msg");
const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => u.email?.startsWith("e2e-msg"))) await sb.auth.admin.deleteUser(u.id);
await sb.from("message_campaigns").delete().like("name", "E2E%");
async function user(email, name, extra = {}) {
  const { data } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
  if (Object.keys(extra).length) await must(sb.from("profiles").update(extra).eq("id", data.user.id));
  return data.user.id;
}
const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
const adminId = await user("e2e-msg-admin@lc.test", "Admin Msg", { role: "admin", whatsapp: "+5511900000001" });
const anaId = await user("e2e-msg-ana@lc.test", "Ana Mensagem", { whatsapp: "+5511911112222", marketing_consent: true, last_seen_at: old });
const biaId = await user("e2e-msg-bia@lc.test", "Bia Semzap", { last_seen_at: new Date().toISOString() });
const caioId = await user("e2e-msg-caio@lc.test", "Caio Saiu", { messages_opt_out_at: new Date().toISOString(), marketing_consent: true });

const course = await must(sb.from("courses").insert({ slug: "e2e-msg", title: "E2E Mensagens", is_published: true }).select("id").single());
const mod = await must(sb.from("modules").insert({ course_id: course.id, title: "M1" }).select("id").single());
const lesson = await must(
  sb.from("lessons").insert({ module_id: mod.id, title: "Aula das mensagens", is_published: true }).select("id").single(),
);
const cohort = await must(sb.from("cohorts").insert({ course_id: course.id, name: "T1" }).select("id").single());
await must(
  sb.rpc("set_cohort_lessons", {
    p_cohort_id: cohort.id,
    p_items: [{ lesson_id: lesson.id, release_at: null, release_offset_days: null }],
  }),
);
await must(
  sb
    .from("enrollments")
    .insert([anaId, biaId, caioId].map((user_id) => ({ user_id, cohort_id: cohort.id, origin: "manual", started_at: old }))),
);
// Automações começam desligadas (estado conhecido).
await must(sb.from("automations").update({ enabled: false }).neq("key", ""));

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
const page = await loginPage("e2e-msg-admin@lc.test", "/admin/mensagens/nova");

async function compose({ channel, purpose, name, subject, body, expected }) {
  await page.goto(`${BASE}/admin/mensagens/nova`);
  await page.getByRole("radio", { name: channel === "email" ? /E-mail/ : /WhatsApp/ }).check();
  await page.locator(`input[name=purpose][value=${purpose}]`).check();
  await page.getByLabel("Público", { exact: true }).selectOption("active");
  await page.getByLabel("Curso", { exact: true }).selectOption(course.id);
  await page.getByRole("button", { name: "Ver quantos vão receber" }).click();
  const status = page.getByRole("status").filter({ hasText: "pessoa" });
  await status.waitFor();
  const text = await status.innerText();
  assert(text.startsWith(`${expected.total} pessoa`), `público: ${text}`);
  for (const bit of expected.out) assert(text.includes(bit), `excluídos (${bit}): ${text}`);
  await page.getByLabel("Nome do envio").fill(name);
  if (subject) await page.getByLabel("Assunto", { exact: true }).fill(subject);
  await page.getByLabel("Texto", { exact: true }).fill(body);
}

await step("e-mail de aviso: público sem quem se descadastrou, teste para o admin e envio", async () => {
  await compose({
    channel: "email",
    purpose: "notice",
    name: "E2E aviso",
    subject: "{{nome}}, live hoje",
    body: "Oi, {{nome}}!\n\nHoje tem live de {{curso}}: {{link}}",
    expected: { total: 2, out: ["1 descadastrado"] },
  });
  await page.screenshot({ path: `${SHOTS}/3a-nova-mensagem.png`, caret: "initial", fullPage: true });
  await page.getByRole("button", { name: "Enviar teste para mim" }).click();
  await page.getByText("Teste enviado para e2e-msg-admin@lc.test.").waitFor({ timeout: 20000 });
  const test = inbox.find((m) => m.to === "e2e-msg-admin@lc.test");
  assert(test?.subject === "[Teste] Admin, live hoje", `teste: ${test?.subject}`);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Enviar para 2 pessoas" }).click();
  await page.waitForURL(/\/admin\/mensagens\/[0-9a-f-]{36}$/);
  await waitFor(
    () => inbox.filter((m) => m.kind === "email" && m.subject?.endsWith("live hoje") && !m.subject.startsWith("[Teste]")).length === 2,
    "2 e-mails",
  );
  const ana = inbox.find((m) => m.to === "e2e-msg-ana@lc.test");
  assert(
    ana.subject === "Ana, live hoje" && ana.text.includes("Oi, Ana!") && ana.text.includes("Hoje tem live de E2E Mensagens"),
    ana.text,
  );
  assert(/\/descadastro\/[0-9a-f-]{36}\/um-clique>$/.test(ana.headers["List-Unsubscribe"]), "cabeçalho de descadastro");
  assert(!inbox.some((m) => m.to === "e2e-msg-caio@lc.test"), "Caio se descadastrou");
  await waitFor(async () => {
    await page.reload();
    return (await page.getByText("Concluído").count()) > 0;
  }, "campanha concluída");
  await page.screenshot({ path: `${SHOTS}/3a-envio.png`, caret: "initial" });
});

await step("WhatsApp de promoção: só quem aceitou e tem número", async () => {
  await compose({
    channel: "whatsapp",
    purpose: "promo",
    name: "E2E promo",
    body: "{{nome}}, condição especial hoje: {{link}}",
    expected: { total: 1, out: ["1 sem aceite"] },
  });
  await page.getByLabel("Link (opcional)").fill("https://exemplo.com/oferta");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Enviar para 1 pessoa" }).click();
  const wa = await waitFor(() => inbox.find((m) => m.kind === "whatsapp" && m.to === "5511911112222"), "WhatsApp da Ana");
  assert(wa.text === "Ana, condição especial hoje: https://exemplo.com/oferta", wa.text);
});

await step("descadastro pelo link do e-mail (e voltar atrás)", async () => {
  const url = inbox.find((m) => m.to === "e2e-msg-ana@lc.test").html.match(/href="([^"]+\/descadastro\/[^"]+)"/)[1];
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(url);
  await anon.getByRole("button", { name: "Não quero mais receber" }).click();
  await anon.getByText("Pronto. Você não vai mais receber").waitFor();
  let [p] = await must(sb.from("profiles").select("messages_opt_out_at, marketing_consent").eq("id", anaId));
  assert(p.messages_opt_out_at && !p.marketing_consent, "descadastrada");
  await anon.screenshot({ path: `${SHOTS}/3a-descadastro.png`, caret: "initial" });
  await anon.getByRole("button", { name: /Mudei de ideia/ }).click();
  await anon.getByRole("button", { name: "Não quero mais receber" }).waitFor();
  [p] = await must(sb.from("profiles").select("messages_opt_out_at").eq("id", anaId));
  assert(!p.messages_opt_out_at, "voltou a receber");
  // Um clique (Gmail): POST no endereço do cabeçalho
  const res = await anon.request.post(`${url}/um-clique`, { form: { "List-Unsubscribe": "One-Click" } });
  assert(res.ok(), `um clique: ${res.status()}`);
  [p] = await must(sb.from("profiles").select("messages_opt_out_at").eq("id", anaId));
  assert(p.messages_opt_out_at, "um clique descadastrou");
  await must(sb.from("profiles").update({ messages_opt_out_at: null }).eq("id", anaId));
});

await step("automação 'Aluno parado': liga, roda agora e não repete", async () => {
  await page.goto(`${BASE}/admin/mensagens/automacoes`);
  const form = page.getByRole("form", { name: "Aluno parado" });
  await form.getByRole("switch").check();
  await form.getByLabel("Dias sem entrar").fill("3");
  await form.getByRole("button", { name: "Salvar" }).click();
  await form.getByText("Salvo. Automação ligada.").waitFor();
  await page.screenshot({ path: `${SHOTS}/3a-automacoes.png`, caret: "initial", fullPage: true });
  await page.getByRole("button", { name: "Rodar agora" }).click();
  await page.getByText(/Automações rodadas:/).waitFor({ timeout: 60000 });
  const toAna = () => inbox.filter((m) => (m.to === "e2e-msg-ana@lc.test" || m.to === "5511911112222") && /falta|aparece/i.test(m.text));
  await waitFor(() => toAna().length === 2, "e-mail e WhatsApp de aluno parado para a Ana");
  assert(!inbox.some((m) => m.to === "e2e-msg-bia@lc.test" && /aparece/.test(m.text)), "Bia entrou hoje");
  await page.getByRole("button", { name: "Rodar agora" }).click();
  await page.getByText(/Automações rodadas:/).waitFor();
  await new Promise((r) => setTimeout(r, 2000));
  assert(toAna().length === 2, "não repetiu");
});

await step("cron diário exige o segredo", async () => {
  const anon = await browser.newContext();
  assert((await anon.request.get(`${BASE}/api/cron/diario`)).status() === 401, "sem segredo = 401");
  const ok = await anon.request.get(`${BASE}/api/cron/diario`, { headers: { authorization: "Bearer cron-test-secret" }, timeout: 120000 });
  assert(ok.ok(), `com segredo: ${ok.status()}`);
  const json = await ok.json();
  assert(json.queued && "idle" in json.queued, JSON.stringify(json));
  await anon.close();
});

await step("comentário urgente avisa o admin na hora", async () => {
  await must(
    sb
      .from("automations")
      .update({ enabled: true, channels: ["whatsapp"] })
      .eq("key", "urgent_comment"),
  );
  const student = await loginPage("e2e-msg-ana@lc.test", `/aula/${lesson.id}`);
  const box = student.getByRole("textbox", { name: "Escreva um comentário ou dúvida…" });
  await student.getByText(/Comentários da turma/).waitFor();
  if (!(await box.isVisible())) await student.getByText(/Comentários da turma/).click();
  await box.fill("Não gostei, quero meu reembolso");
  await student.getByRole("button", { name: "Comentar" }).click();
  const alert = await waitFor(
    () => inbox.find((m) => m.kind === "whatsapp" && m.to === "5511900000001" && /reembolso/.test(m.text)),
    "alerta no WhatsApp do admin",
  );
  assert(
    alert.text.includes("Ana Mensagem") && alert.text.includes("Aula das mensagens") && alert.text.includes("/admin/radar"),
    alert.text,
  );
});

await browser.close();
fake.close();
await must(sb.from("automations").update({ enabled: false }).neq("key", ""));
await sb.from("message_campaigns").delete().like("name", "E2E%");
await sb.from("courses").delete().eq("slug", "e2e-msg");
for (const id of [adminId, anaId, biaId, caioId]) await sb.auth.admin.deleteUser(id);
if (errors.length) {
  console.error("Erros no navegador:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Etapa 3A ok");
