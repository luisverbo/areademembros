"use client";

import { useActionState } from "react";
import { LinkButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePassword } from "./actions";

export function PasswordForm() {
  const [state, action] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Nova senha" htmlFor="password" error={state?.errors?.password} hint="Pelo menos 8 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Repita a senha" htmlFor="confirm" error={state?.errors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton size="lg">Salvar senha</SubmitButton>
      <FormMessage state={state} />
      {state?.ok ? (
        <LinkButton href="/" variant="secondary">
          Ir para os cursos
        </LinkButton>
      ) : null}
    </form>
  );
}
