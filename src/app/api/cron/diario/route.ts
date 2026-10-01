import { timingSafeEqual } from "node:crypto";
import { runDailyAutomations } from "@/lib/messaging/automations";

// Chamado pela Vercel uma vez por dia (vercel.json). A Vercel manda "Authorization: Bearer CRON_SECRET".
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Não autorizado", { status: 401 });
  const result = await runDailyAutomations();
  return Response.json(result);
}
