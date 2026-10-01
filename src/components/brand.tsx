import Link from "next/link";
import { env } from "@/lib/env";

/** "LC.Academy" com o ponto em vermelho. */
export function Brand({ href = "/" }: { href?: string }) {
  const [first, ...rest] = env.appName.split(".");
  return (
    <Link href={href} className="font-display text-lg font-bold tracking-tight">
      {first}
      {rest.length ? (
        <>
          <span className="text-accent">.</span>
          {rest.join(".")}
        </>
      ) : null}
    </Link>
  );
}
