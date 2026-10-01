"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage, type FormState } from "@/components/ui/form-message";
import { runAutomationsNow, saveAutomation } from "../actions";

type Props = {
  automation: {
    key: string;
    enabled: boolean;
    channels: ("email" | "whatsapp")[];
    subject: string | null;
    body: string;
    settings: { days?: number; link?: string; email?: string; whatsapp?: string };
  };
  info: { title: string; description: string; audience: "students" | "admin"; promo?: boolean; variables: string[] };
  sentLast30: number;
};

export function AutomationForm({ automation, info, sentLast30 }: Props) {
  const [state, action, saving] = useActionState(saveAutomation, undefined);
  const [, startSave] = useTransition();
  const [enabled, setEnabled] = useState(automation.enabled);
  const id = (field: string) => `${automation.key}-${field}`;
  const usesDays = automation.key === "idle" || automation.key === "free_no_purchase";

  return (
    <form
      // Envio manual: o React 19 limpa o formulário depois de uma "action" e desmarcaria a chave.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startSave(() => action(data));
      }}
      aria-label={info.title}
      className={`bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] ${enabled ? "border-accent/60" : "border-border"}`}
    >
      <input type="hidden" name="key" value={automation.key} />
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {info.title} {info.promo ? <Badge tone="muted">só quem aceitou</Badge> : null}
          </h2>
          <p className="text-fg-muted mt-0.5 text-sm">{info.description}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 self-start text-sm font-semibold">
          <input
            type="checkbox"
            name="enabled"
            role="switch"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-accent size-4"
            aria-label={`Ligar ${info.title}`}
          />
          {enabled ? "Ligada" : "Desligada"}
        </label>
      </div>

      <div className="flex flex-wrap gap-5">
        <Checkbox name="channels" value="email" label="E-mail" defaultChecked={automation.channels.includes("email")} />
        <Checkbox name="channels" value="whatsapp" label="WhatsApp" defaultChecked={automation.channels.includes("whatsapp")} />
      </div>
      {state?.errors?.channels ? <p className="text-accent text-xs">{state.errors.channels[0]}</p> : null}

      <div className="grid gap-3 md:grid-cols-3">
        {usesDays ? (
          <Field
            label={automation.key === "idle" ? "Dias sem entrar" : "Dias depois de entrar"}
            htmlFor={id("days")}
            error={state?.errors?.days}
          >
            <Input id={id("days")} name="days" type="number" min={1} max={365} defaultValue={automation.settings.days ?? 3} />
          </Field>
        ) : null}
        {automation.key === "free_no_purchase" ? (
          <Field label="Link da oferta ({{link}})" htmlFor={id("link")} error={state?.errors?.link} className="md:col-span-2">
            <Input
              id={id("link")}
              name="link"
              type="url"
              placeholder="https://… (página de vendas ou checkout)"
              defaultValue={automation.settings.link ?? ""}
            />
          </Field>
        ) : null}
        {info.audience === "admin" ? (
          <>
            <Field label="Seu e-mail" htmlFor={id("email")} error={state?.errors?.email} hint="Vazio = e-mail do admin.">
              <Input id={id("email")} name="email" type="email" defaultValue={automation.settings.email ?? ""} />
            </Field>
            <Field label="Seu WhatsApp" htmlFor={id("whatsapp")} hint="Com DDD. Vazio = WhatsApp do admin.">
              <Input
                id={id("whatsapp")}
                name="whatsapp"
                defaultValue={automation.settings.whatsapp ?? ""}
                placeholder="+55 11 99999-0000"
              />
            </Field>
          </>
        ) : null}
      </div>

      {automation.key !== "weekly_report" ? (
        <>
          <Field label="Assunto do e-mail" htmlFor={id("subject")}>
            <Input id={id("subject")} name="subject" defaultValue={automation.subject ?? ""} />
          </Field>
          <Field
            label="Mensagem"
            htmlFor={id("body")}
            error={state?.errors?.body}
            hint={<>Variáveis: {info.variables.map((v) => `{{${v}}}`).join(", ")}</>}
          >
            <Textarea id={id("body")} name="body" rows={3} defaultValue={automation.body} />
          </Field>
        </>
      ) : (
        <>
          <input type="hidden" name="body" value="" />
          <input type="hidden" name="subject" value="" />
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <span className="text-fg-muted text-xs">
          {sentLast30} enviada{sentLast30 === 1 ? "" : "s"} nos últimos 30 dias
        </span>
        <FormMessage state={state} className="py-1 text-xs" />
      </div>
    </form>
  );
}

export function RunNowButton() {
  const [state, setState] = useState<FormState>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => setState(await runAutomationsNow()))}>
        {pending ? "Rodando…" : "Rodar agora"}
      </Button>
      <FormMessage state={state} className="py-1 text-xs" />
    </div>
  );
}
