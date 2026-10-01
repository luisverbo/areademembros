"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { leadFieldsFor, type LeadFields } from "@/lib/lead-fields";
import { submitLead } from "./actions";

type Props = { slug: string; mode: LeadFields; direct: boolean; utm: Record<string, string> };

export function LeadForm({ slug, mode, direct, utm }: Props) {
  const [state, action] = useActionState(submitLead.bind(null, slug), undefined);
  const fields = leadFieldsFor(mode);
  const e = state?.errors ?? {};

  if (state?.ok) {
    return <FormMessage state={state} />;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {Object.entries(utm).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.name ? (
        <Field label="Nome" htmlFor="name" error={e.name}>
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
      ) : null}
      {fields.email ? (
        <Field label="E-mail" htmlFor="email" error={e.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@email.com" />
        </Field>
      ) : null}
      {fields.whatsapp ? (
        <Field label="WhatsApp" htmlFor="whatsapp" error={e.whatsapp}>
          <Input id="whatsapp" name="whatsapp" type="tel" autoComplete="tel" inputMode="tel" required placeholder="(11) 99999-0000" />
        </Field>
      ) : null}
      <div className="flex flex-col gap-1">
        <Checkbox
          name="consent"
          required
          label="Aceito receber mensagens por e-mail e WhatsApp sobre este e outros conteúdos. Posso cancelar quando quiser."
        />
        {e.consent ? <p className="text-accent text-xs">{e.consent[0]}</p> : null}
      </div>
      <SubmitButton size="lg" pendingText="Liberando…">
        {direct ? "Assistir agora" : "Receber acesso no e-mail"}
      </SubmitButton>
      <FormMessage state={state} />
      {state?.loginHref ? (
        <Link href={state.loginHref} className={buttonClasses("secondary", "md")}>
          Entrar com minha senha
        </Link>
      ) : null}
    </form>
  );
}
