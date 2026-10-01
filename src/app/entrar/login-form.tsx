"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { cn } from "@/components/ui/cn";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { sendMagicLink, signInWithPassword } from "./actions";

type Mode = "senha" | "link";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<Mode>("senha");

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Forma de entrar" className="bg-surface-2 grid grid-cols-2 rounded-lg p-1">
        {(
          [
            ["senha", "Com senha"],
            ["link", "Link por e-mail"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              "rounded-md py-2 text-sm font-semibold transition-colors",
              mode === id ? "bg-border text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "senha" ? <PasswordForm next={next} /> : <MagicLinkForm next={next} />}
    </div>
  );
}

function PasswordForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInWithPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="E-mail" htmlFor="email" error={state?.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@email.com" />
      </Field>
      <Field label="Senha" htmlFor="password" error={state?.errors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton size="lg" pendingText="Entrando…">
        Entrar
      </SubmitButton>
      <FormMessage state={state} />
      <Link href="/entrar/senha" className="text-fg-muted hover:text-fg text-center text-sm">
        Primeiro acesso ou esqueci a senha
      </Link>
    </form>
  );
}

function MagicLinkForm({ next }: { next?: string }) {
  const [state, action] = useActionState(sendMagicLink, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <p className="text-fg-muted text-sm">Sem senha: enviamos um link de acesso para o seu e-mail.</p>
      <Field label="E-mail" htmlFor="email-link" error={state?.errors?.email}>
        <Input id="email-link" name="email" type="email" autoComplete="email" required placeholder="voce@email.com" />
      </Field>
      <SubmitButton size="lg" pendingText="Enviando…">
        Receber link de acesso
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
