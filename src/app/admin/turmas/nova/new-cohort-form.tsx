"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCohort } from "../actions";

export function NewCohortForm({ courses, defaultCourseId }: { courses: { id: string; title: string }[]; defaultCourseId?: string }) {
  const [state, action] = useActionState(createCohort, undefined);
  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <Field label="Curso" htmlFor="course_id" error={state?.errors?.course_id}>
        <Select id="course_id" name="course_id" defaultValue={defaultCourseId ?? ""} required>
          <option value="" disabled>
            Escolha…
          </option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Nome da turma" htmlFor="name" error={state?.errors?.name} hint="Ex.: Mentoria T1, Perpétua (anúncios)">
        <Input id="name" name="name" required />
      </Field>
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingText="Criando…">Criar e configurar</SubmitButton>
      </div>
    </form>
  );
}
