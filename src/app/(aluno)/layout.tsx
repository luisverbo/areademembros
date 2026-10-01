import { SiteHeader } from "@/components/student/site-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function StudentLayout({ children }: LayoutProps<"/">) {
  const profile = await requireUser();
  const supabase = await createClient();
  await supabase.rpc("touch_last_seen");

  return (
    <div className="min-h-dvh">
      <SiteHeader profile={profile} />
      {children}
    </div>
  );
}
