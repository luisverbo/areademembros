"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { enrollByEmail } from "../actions";

export function EnrollForm({ cohortId }: { cohortId: string }) {
  const [state, action] = useActionState(enrollByEmail.bind(null, cohortId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[1.5fr_1.5fr_auto] md:items-end">
        <Field label="E-mail" htmlFor="enroll_email" error={state?.errors?.email}>
          <Input id="enroll_email" name="email" type="email" required />
        </Field>
        <Field label="Nome (se for novo)" htmlFor="enroll_name">
          <Input id="enroll_name" name="full_name" />
        </Field>
        <SubmitButton variant="secondary" pendingText="Matriculando…">
          Matricular
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
