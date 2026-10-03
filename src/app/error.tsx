"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/button";

/** Tela de erro inesperado (o detalhe fica no log do servidor, nunca na tela). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-display text-3xl font-bold">Algo deu errado</p>
      <p className="text-fg-muted max-w-md">
        Tente de novo. Se continuar, saia e entre outra vez{error.digest ? ` (código ${error.digest})` : ""}.
      </p>
      <div className="mt-2 flex gap-3">
        <Button onClick={reset}>Tentar de novo</Button>
        <LinkButton href="/" variant="secondary">
          Início
        </LinkButton>
      </div>
    </main>
  );
}
