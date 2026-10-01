// Variáveis públicas (vão para o navegador). As secretas ficam em lib/supabase/admin.ts.
export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  // Sem barra no fim: evita links como "https://site.com//api/...".
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, ""),
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "LC.Academy",
};

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}
