"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { unsubscribe } from "./actions";

export function UnsubscribeForm({ token, initiallyOut }: { token: string; initiallyOut: boolean }) {
  const [out, setOut] = useState(initiallyOut);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const run = (resubscribe: boolean) =>
    start(async () => {
      const ok = await unsubscribe(token, resubscribe);
      setError(!ok);
      if (ok) setOut(!resubscribe);
    });

  if (out) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-fg-soft">
          Pronto. Você não vai mais receber nossas mensagens por e-mail e WhatsApp. E-mails de acesso e de senha continuam chegando quando
          você pedir.
        </p>
        <Button variant="secondary" disabled={pending} onClick={() => run(true)}>
          Mudei de ideia, quero continuar recebendo
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-fg-soft">Ao confirmar, você deixa de receber avisos e novidades por e-mail e WhatsApp.</p>
      {error ? <p className="text-accent text-sm">Link inválido. Peça um novo no último e-mail que recebeu.</p> : null}
      <Button disabled={pending} onClick={() => run(false)}>
        {pending ? "Salvando…" : "Não quero mais receber"}
      </Button>
    </div>
  );
}
