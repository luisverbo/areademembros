"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { sendMagicLink } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(sendMagicLink, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="E-mail" htmlFor="email" error={state?.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@email.com" />
      </Field>
      <SubmitButton size="lg" pendingText="Enviando…">
        Receber link de acesso
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
