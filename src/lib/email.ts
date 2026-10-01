import "server-only";
import { env } from "@/lib/env";

// E-mails transacionais enviados pelo próprio site via Resend (https://resend.com).
// Sem RESEND_API_KEY/EMAIL_FROM, nada é enviado e quem chama decide o plano B.

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

type Message = { to: string; subject: string; html: string; text: string };

export async function sendEmail(message: Message): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "email_not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("resend", res.status, body.slice(0, 300));
      return { ok: false, error: `resend_${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    console.error("resend", error);
    return { ok: false, error: "resend_unreachable" };
  }
}

// ---------------------------------------------------------------------------
// Modelos (identidade grafite, inline para funcionar em qualquer cliente de e-mail)
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function brandHtml() {
  const [first, ...rest] = env.appName.split(".");
  return rest.length ? `${escapeHtml(first)}<span style="color:#D63A42">.</span>${escapeHtml(rest.join("."))}` : escapeHtml(first);
}

function layout({ title, intro, button, link, footer }: { title: string; intro: string; button: string; link: string; footer: string }) {
  return `<div style="background:#141416;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#F5F5F5">
  <div style="max-width:440px;margin:0 auto;background:#1A1A1D;border:1px solid #2C2C30;border-radius:12px;padding:28px">
    <p style="font-size:20px;font-weight:bold;margin:0 0 20px">${brandHtml()}</p>
    <p style="font-size:16px;margin:0 0 8px">${escapeHtml(title)}</p>
    <p style="font-size:14px;color:#9C9CA3;margin:0 0 24px;line-height:1.5">${escapeHtml(intro)}</p>
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#D63A42;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">${escapeHtml(button)}</a>
    <p style="font-size:12px;color:#9C9CA3;margin:24px 0 0;line-height:1.5">${escapeHtml(footer)}</p>
  </div>
</div>`;
}

function textVersion(title: string, intro: string, link: string, footer: string) {
  return `${env.appName}\n\n${title}\n${intro}\n\n${link}\n\n${footer}`;
}

const LINK_NOTE = "O link vale por 1 hora e só pode ser usado uma vez.";

export function magicLinkEmail(to: string, link: string): Message {
  const title = "Seu link de acesso chegou.";
  const intro = `Clique no botão para entrar. ${LINK_NOTE}`;
  const footer = "Se você não pediu este acesso, pode ignorar este e-mail.";
  return {
    to,
    subject: "Seu link de acesso",
    html: layout({ title, intro, button: "Entrar na área de membros", link, footer }),
    text: textVersion(title, intro, link, footer),
  };
}

export function passwordEmail(to: string, link: string): Message {
  const title = "Crie sua senha de acesso.";
  const intro = `Clique no botão para criar (ou trocar) a sua senha. ${LINK_NOTE}`;
  const footer = "Se você não pediu isso, pode ignorar este e-mail. Sua senha atual continua valendo.";
  return {
    to,
    subject: "Crie sua senha de acesso",
    html: layout({ title, intro, button: "Criar minha senha", link, footer }),
    text: textVersion(title, intro, link, footer),
  };
}

export function accessEmail(to: string, link: string, opts: { name?: string | null; courseTitle: string }): Message {
  const first = opts.name?.trim().split(/\s+/)[0];
  const title = `${first ? `${first}, seu` : "Seu"} acesso a ${opts.courseTitle} está liberado!`;
  const intro = `Clique no botão para entrar e criar a sua senha. Depois, é só entrar com seu e-mail e senha. ${LINK_NOTE} Se ele expirar, use “Primeiro acesso ou esqueci a senha” na tela de entrar.`;
  const footer = "Você recebeu este e-mail porque comprou ou foi matriculado neste curso.";
  return {
    to,
    subject: `Seu acesso: ${opts.courseTitle}`,
    html: layout({ title, intro, button: "Acessar meu curso", link, footer }),
    text: textVersion(title, intro, link, footer),
  };
}
