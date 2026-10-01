import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

const PUBLIC_PATHS = ["/entrar", "/auth", "/gratis", "/api/webhooks"];

/** Renova a sessão a cada navegação e manda para /entrar quem não está logado. */
export async function updateSession(request: NextRequest) {
  // Link do e-mail padrão do Supabase que caiu fora de /auth/confirm (ex.: endereço não
  // cadastrado em Redirect URLs volta para a raiz com ?code=...): encaminha para concluir o login.
  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname !== "/auth/confirm" && !request.nextUrl.pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    url.search = new URLSearchParams({ code, next: request.nextUrl.pathname }).toString();
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Não colocar código entre createServerClient e getClaims (recomendação do Supabase).
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isLoggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}
