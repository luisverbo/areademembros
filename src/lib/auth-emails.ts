import "server-only";
import { createAuthLink, userExists } from "@/lib/auth-links";
import { isEmailConfigured, magicLinkEmail, passwordEmail, sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuthEmailResult = "sent" | "skipped" | "not_configured" | "failed";

/**
 * Envia link de entrada ou de criar senha pelo Resend, para quem já tem conta.
 * Respeita o limite por e-mail. "not_configured" = sem Resend; quem chama usa o Supabase.
 */
export async function sendAuthEmail(email: string, kind: "login" | "password", next = "/"): Promise<AuthEmailResult> {
  if (!isEmailConfigured()) return "not_configured";
  const normalized = email.trim().toLowerCase();
  if (!(await userExists(normalized))) return "skipped";

  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("claim_auth_email", { p_email: normalized, p_kind: kind });
  if (!allowed) return "skipped";

  const link = await createAuthLink(normalized, kind, next);
  if (!link) return "failed";
  const result = await sendEmail(kind === "password" ? passwordEmail(normalized, link) : magicLinkEmail(normalized, link));
  return result.ok ? "sent" : "failed";
}
