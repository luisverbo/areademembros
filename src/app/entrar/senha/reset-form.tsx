"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestPasswordReset } from "../actions";

export function ResetForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="E-mail" htmlFor="email" error={state?.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@email.com" />
      </Field>
      <SubmitButton size="lg" pendingText="Enviando…">
        Enviar link para criar a senha
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
