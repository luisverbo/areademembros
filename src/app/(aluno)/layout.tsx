import { after } from "next/server";
import { SiteHeader } from "@/components/student/site-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function StudentLayout({ children }: LayoutProps<"/">) {
  const profile = await requireUser();
  const supabase = await createClient();
  // Marca o último acesso depois de responder (não atrasa a página).
  after(() => supabase.rpc("touch_last_seen"));

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <SiteHeader profile={profile} />
      <div id="conteudo" tabIndex={-1} className="outline-none">
        {children}
      </div>
    </div>
  );
}
