"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, type FormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { createOutgoingWebhook, testOutgoingWebhook } from "./actions";

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="border-border bg-surface-2 text-fg-soft min-w-0 flex-1 truncate rounded-lg border px-3 py-1.5 text-xs" title={value}>
        {value}
      </code>
      <button
        type="button"
        aria-label={label ?? "Copiar"}
        className="bg-border shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-[#36363b]"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

export function SecretField({ secret }: { secret: string }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <CopyField value={secret} label="Copiar segredo" />
  ) : (
    <button type="button" className="text-fg-muted hover:text-fg self-start text-xs font-semibold" onClick={() => setShown(true)}>
      Mostrar segredo
    </button>
  );
}

export function TestButton({ id }: { id: string }) {
  const [state, setState] = useState<FormState>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setState(await testOutgoingWebhook(id)))}>
        {pending ? "Enviando…" : "Enviar teste"}
      </Button>
      <FormMessage state={state} className="py-1 text-xs" />
    </div>
  );
}

export function NewWebhookForm({ events }: { events: { id: string; label: string }[] }) {
  const [state, action] = useActionState(createOutgoingWebhook, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome" htmlFor="wh_name" error={state?.errors?.name}>
          <Input id="wh_name" name="name" placeholder="FunilPro" required />
        </Field>
        <Field label="URL que recebe os avisos" htmlFor="wh_url" error={state?.errors?.url}>
          <Input id="wh_url" name="url" type="url" placeholder="https://…" required />
        </Field>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="text-fg-soft mb-1.5 text-sm font-medium">Avisar quando</legend>
        {events.map((e) => (
          <label key={e.id} className="text-fg-soft flex items-center gap-2 text-sm">
            <input type="checkbox" name="events" value={e.id} defaultChecked={e.id === "lead.created"} className="accent-accent size-4" />
            {e.label}
          </label>
        ))}
      </fieldset>
      {state?.errors?.events ? <p className="text-accent text-xs">{state.errors.events[0]}</p> : null}
      <FormMessage state={state} />
      <div>
        <SubmitButton variant="secondary" pendingText="Criando…">
          Adicionar webhook
        </SubmitButton>
      </div>
    </form>
  );
}
