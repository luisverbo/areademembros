"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { createStudent } from "./actions";

export function NewStudentForm({ cohorts }: { cohorts: { id: string; label: string }[] }) {
  const [state, action] = useActionState(createStudent, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="E-mail" htmlFor="new_email" error={state?.errors?.email}>
          <Input id="new_email" name="email" type="email" required />
        </Field>
        <Field label="Nome" htmlFor="new_name">
          <Input id="new_name" name="full_name" />
        </Field>
        <Field label="WhatsApp" htmlFor="new_whatsapp">
          <Input id="new_whatsapp" name="whatsapp" type="tel" placeholder="+55 11 99999-0000" />
        </Field>
        <Field label="Matricular na turma (opcional)" htmlFor="new_cohort">
          <Select id="new_cohort" name="cohort_id" defaultValue="">
            <option value="">— Nenhuma —</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingText="Criando…">Adicionar aluno</SubmitButton>
      </div>
    </form>
  );
}
