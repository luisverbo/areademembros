"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { updateMyData } from "./actions";

type Props = { fullName: string; whatsapp: string; consent: boolean; receive: boolean };

export function MyDataForm(initial: Props) {
  const [state, action, saving] = useActionState(updateMyData, undefined);
  const [, start] = useTransition();
  const [receive, setReceive] = useState(initial.receive);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(() => action(data));
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Nome completo" htmlFor="fullName" error={state?.errors?.fullName} hint="É o nome que sai no certificado.">
        <Input id="fullName" name="fullName" defaultValue={initial.fullName} autoComplete="name" required />
      </Field>
      <Field label="WhatsApp" htmlFor="whatsapp" error={state?.errors?.whatsapp}>
        <Input
          id="whatsapp"
          name="whatsapp"
          defaultValue={initial.whatsapp}
          placeholder="(11) 99999-0000"
          autoComplete="tel"
          inputMode="tel"
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-fg-soft mb-1.5 text-sm font-medium">Mensagens</legend>
        <Checkbox
          name="receive"
          label="Receber avisos dos meus cursos por e-mail e WhatsApp (aula nova, lembretes)"
          checked={receive}
          onChange={(e) => setReceive(e.target.checked)}
        />
        <Checkbox name="consent" label="Também quero receber novidades e ofertas" defaultChecked={initial.consent} disabled={!receive} />
      </fieldset>
      <FormMessage state={state} />
      <Button type="submit" disabled={saving} className="self-start">
        {saving ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
