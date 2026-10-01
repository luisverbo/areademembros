import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-display text-5xl font-bold">404</p>
      <p className="text-fg-muted">Não encontramos esta página.</p>
      <LinkButton href="/" variant="secondary" className="mt-2">
        Voltar ao início
      </LinkButton>
    </main>
  );
}
