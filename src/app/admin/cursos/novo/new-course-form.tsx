"use client";

import { useActionState, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { slugify } from "@/lib/slug";
import { createCourse } from "../actions";

export function NewCourseForm() {
  const [state, action] = useActionState(createCourse, undefined);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <Field label="Título" htmlFor="title" error={state?.errors?.title}>
        <Input
          id="title"
          name="title"
          required
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="IA para Negócios Locais"
        />
      </Field>
      <Field label="Endereço (slug)" htmlFor="slug" error={state?.errors?.slug} hint="Usado no link do curso.">
        <Input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          placeholder="ia-para-negocios-locais"
        />
      </Field>
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingText="Criando…">Criar e continuar</SubmitButton>
      </div>
    </form>
  );
}
