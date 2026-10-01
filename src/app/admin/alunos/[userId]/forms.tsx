"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { isoToZonedInput } from "@/lib/datetime";
import { enrollmentStatusLabels } from "@/lib/labels";
import { enrollStudent, unlockLesson, updateEnrollment, updateStudent } from "../actions";

type Option = { id: string; label: string };

export function ProfileForm({
  userId,
  fullName,
  whatsapp,
  role,
}: {
  userId: string;
  fullName: string | null;
  whatsapp: string | null;
  role: "student" | "admin";
}) {
  const [state, action] = useActionState(updateStudent.bind(null, userId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Nome" htmlFor="full_name">
          <Input id="full_name" name="full_name" defaultValue={fullName ?? ""} />
        </Field>
        <Field label="WhatsApp" htmlFor="whatsapp">
          <Input id="whatsapp" name="whatsapp" type="tel" defaultValue={whatsapp ?? ""} />
        </Field>
        <Field label="Papel" htmlFor="role" error={state?.errors?.role}>
          <Select id="role" name="role" defaultValue={role}>
            <option value="student">Aluno</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="secondary">Salvar dados</SubmitButton>
        <FormMessage state={state} className="py-1.5" />
      </div>
    </form>
  );
}

type Enrollment = { id: string; cohort_id: string; status: "active" | "refunded" | "expired"; expires_at: string | null };

export function EnrollmentForm({ userId, enrollment, cohorts }: { userId: string; enrollment: Enrollment; cohorts: Option[] }) {
  const [state, action] = useActionState(updateEnrollment.bind(null, enrollment.id, userId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Turma" htmlFor={`cohort-${enrollment.id}`} hint="Mudar de turma mantém o progresso.">
          <Select id={`cohort-${enrollment.id}`} name="cohort_id" defaultValue={enrollment.cohort_id}>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor={`status-${enrollment.id}`}>
          <Select id={`status-${enrollment.id}`} name="status" defaultValue={enrollment.status}>
            {Object.entries(enrollmentStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Expira em" htmlFor={`expires-${enrollment.id}`} hint="Vazio = vitalício">
          <Input
            id={`expires-${enrollment.id}`}
            name="expires_at"
            type="datetime-local"
            defaultValue={isoToZonedInput(enrollment.expires_at)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="secondary" size="sm">
          Salvar matrícula
        </SubmitButton>
        <FormMessage state={state} className="py-1" />
      </div>
    </form>
  );
}

export function EnrollStudentForm({ userId, cohorts }: { userId: string; cohorts: Option[] }) {
  const [state, action] = useActionState(enrollStudent.bind(null, userId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nova matrícula" htmlFor="enroll_cohort" error={state?.errors?.cohort_id} className="min-w-64 flex-1">
          <Select id="enroll_cohort" name="cohort_id" defaultValue="">
            <option value="" disabled>
              Escolha a turma…
            </option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton variant="secondary" pendingText="Matriculando…">
          Matricular
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function UnlockForm({ userId, lessons }: { userId: string; lessons: Option[] }) {
  const [state, action] = useActionState(unlockLesson.bind(null, userId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Liberar aula" htmlFor="unlock_lesson" error={state?.errors?.lesson_id} className="min-w-64 flex-1">
          <Select id="unlock_lesson" name="lesson_id" defaultValue="">
            <option value="" disabled>
              Escolha a aula…
            </option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton variant="secondary" pendingText="Liberando…">
          Liberar
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
