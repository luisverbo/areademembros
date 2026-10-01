import { after, NextResponse, type NextRequest } from "next/server";
import { isProvider } from "@/lib/payments";
import { handleWebhook } from "@/lib/payments/process";

export const maxDuration = 30;

/** Webhooks das plataformas de pagamento: /api/webhooks/kiwify, /hotmart, /yampi, /mercadopago, /asaas */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/webhooks/[provider]">) {
  const { provider } = await params;
  if (!isProvider(provider)) return NextResponse.json({ error: "unknown_provider" }, { status: 404 });

  const rawBody = await request.text();
  let json: Record<string, unknown>;
  try {
    const parsed: unknown = rawBody ? JSON.parse(rawBody) : {};
    json = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const { outcome, after: afterWork } = await handleWebhook(provider, {
      rawBody,
      json,
      headers: request.headers,
      query: request.nextUrl.searchParams,
    });
    if (afterWork) after(afterWork);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error(`webhook ${provider}`, error);
    return NextResponse.json({ error: "temporary_failure" }, { status: 500 });
  }
}

/** Algumas plataformas testam a URL com GET antes de salvar. */
export function GET() {
  return NextResponse.json({ ok: true });
}
