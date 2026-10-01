"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage, type FormState } from "@/components/ui/form-message";
import { SEGMENT_LABELS } from "@/lib/messaging/segments";
import { createCampaign, previewAudience, sendTest, type AudiencePreview } from "../actions";

type Props = {
  courses: { id: string; title: string }[];
  cohorts: { id: string; name: string; course_id: string }[];
  ready: { email: boolean; whatsapp: boolean };
};

export function Composer({ courses, cohorts, ready }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, sending] = useActionState(createCampaign, undefined);
  const [, startSend] = useTransition();
  const [channel, setChannel] = useState<"email" | "whatsapp">(ready.email || !ready.whatsapp ? "email" : "whatsapp");
  const [segment, setSegment] = useState("active");
  const [courseId, setCourseId] = useState("");
  const [preview, setPreview] = useState<AudiencePreview | { error: string } | null>(null);
  const [test, setTest] = useState<FormState>();
  const [checking, startCheck] = useTransition();
  const [testing, startTest] = useTransition();

  const data = () => new FormData(formRef.current!);
  const refresh = () => startCheck(async () => setPreview(await previewAudience(data())));
  const total = preview && "total" in preview ? preview.total : null;

  return (
    <form
      ref={formRef}
      // Envio manual: com "action" o React 19 limparia o texto se o envio desse erro.
      onSubmit={(e) => {
        e.preventDefault();
        if (!confirm(`Enviar para ${total} pessoa${total === 1 ? "" : "s"}? Não dá para desfazer.`)) return;
        const form = new FormData(e.currentTarget);
        startSend(() => action(form));
      }}
      className="flex flex-col gap-6"
    >
      <section
        onChange={() => setPreview(null)}
        className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5"
      >
        <h2 className="text-lg font-semibold">1. Canal e tipo</h2>
        <div className="flex flex-wrap gap-3">
          {(["email", "whatsapp"] as const).map((c) => (
            <label
              key={c}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold ${channel === c ? "border-accent bg-accent/10" : "border-border"}`}
            >
              <input
                type="radio"
                name="channel"
                value={c}
                checked={channel === c}
                onChange={() => setChannel(c)}
                className="accent-accent"
              />
              {c === "email" ? "E-mail" : "WhatsApp"}
              {!ready[c] ? <Badge tone="muted">não configurado</Badge> : null}
            </label>
          ))}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-fg-soft mb-1.5 text-sm font-medium">Tipo de mensagem</legend>
          <label className="text-fg-soft flex items-start gap-2 text-sm">
            <input type="radio" name="purpose" value="notice" defaultChecked className="accent-accent mt-0.5" />
            <span>
              <b className="text-fg">Aviso aos alunos</b> (aula ao vivo, novidade do curso). Vai para todos do público, menos quem se
              descadastrou.
            </span>
          </label>
          <label className="text-fg-soft flex items-start gap-2 text-sm">
            <input type="radio" name="purpose" value="promo" className="accent-accent mt-0.5" />
            <span>
              <b className="text-fg">Promoção / oferta</b>. Só para quem aceitou receber mensagens (LGPD).
            </span>
          </label>
        </fieldset>
      </section>

      <section
        onChange={() => setPreview(null)}
        className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5"
      >
        <h2 className="text-lg font-semibold">2. Para quem</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Público" htmlFor="segment">
            <Select id="segment" name="segment" value={segment} onChange={(e) => setSegment(e.target.value)}>
              {Object.entries(SEGMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {segment !== "everyone" ? (
            <Field label="Curso" htmlFor="courseId">
              <Select id="courseId" name="courseId" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Todos os cursos</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {segment !== "everyone" && courseId ? (
            <Field label="Turma" htmlFor="cohortId">
              <Select id="cohortId" name="cohortId" defaultValue="">
                <option value="">Todas as turmas</option>
                {cohorts
                  .filter((c) => c.course_id === courseId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}
          {segment === "idle" ? (
            <Field label="Sem entrar há (dias)" htmlFor="idleDays">
              <Input id="idleDays" name="idleDays" type="number" min={1} max={365} defaultValue={7} />
            </Field>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" disabled={checking} onClick={refresh}>
            {checking ? "Contando…" : "Ver quantos vão receber"}
          </Button>
          {preview && "error" in preview ? <p className="text-accent text-sm">{preview.error}</p> : null}
          {preview && "total" in preview ? (
            <p className="text-fg-soft text-sm" role="status">
              <b className="text-fg">{preview.total}</b> pessoa{preview.total === 1 ? "" : "s"}
              {preview.sample.length ? ` (${preview.sample.join(", ")}${preview.total > preview.sample.length ? "…" : ""})` : ""}.{" "}
              <span className="text-fg-muted">
                Fora: {preview.excluded.optOut} descadastrado{preview.excluded.optOut === 1 ? "" : "s"}
                {preview.excluded.noConsent ? `, ${preview.excluded.noConsent} sem aceite` : ""}
                {preview.excluded.noAddress ? `, ${preview.excluded.noAddress} sem ${channel === "email" ? "e-mail" : "WhatsApp"}` : ""}.
              </span>
            </p>
          ) : null}
        </div>
      </section>

      <section className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5">
        <h2 className="text-lg font-semibold">3. Mensagem</h2>
        <Field label="Nome do envio (só você vê)" htmlFor="name" error={state?.errors?.name}>
          <Input id="name" name="name" placeholder="Aviso da live de quinta" required />
        </Field>
        {channel === "email" ? (
          <Field label="Assunto" htmlFor="subject" error={state?.errors?.subject}>
            <Input id="subject" name="subject" placeholder="{{nome}}, a live começa às 20h" />
          </Field>
        ) : null}
        <Field
          label="Texto"
          htmlFor="body"
          error={state?.errors?.body}
          hint={
            <>
              Use <code>{"{{nome}}"}</code> (primeiro nome), <code>{"{{curso}}"}</code> e <code>{"{{link}}"}</code>. Links viram clicáveis.
              {channel === "whatsapp"
                ? " No WhatsApp, mensagens curtas funcionam melhor."
                : " Todo e-mail sai com o link de descadastro no rodapé."}
            </>
          }
        >
          <Textarea
            id="body"
            name="body"
            rows={7}
            placeholder={"Oi, {{nome}}!\n\nHoje às 20h tem aula ao vivo de {{curso}}. Entre por aqui: {{link}}"}
          />
        </Field>
        <Field
          label="Link (opcional)"
          htmlFor="link"
          error={state?.errors?.link}
          hint="Vai no lugar de {{link}}. Sem link, usa o endereço da área de membros."
        >
          <Input id="link" name="link" type="url" placeholder="https://…" />
        </Field>
      </section>

      <FormMessage state={state} />
      <FormMessage state={test} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={testing || !ready[channel]}
          onClick={() => startTest(async () => setTest(await sendTest(data())))}
        >
          {testing ? "Enviando teste…" : "Enviar teste para mim"}
        </Button>
        <Button type="submit" disabled={sending || !ready[channel] || total === null || total === 0}>
          {sending
            ? "Preparando envio…"
            : total === null
              ? "Confira o público antes de enviar"
              : `Enviar para ${total} pessoa${total === 1 ? "" : "s"}`}
        </Button>
        {!ready[channel] ? <p className="text-fg-muted text-sm">Configure este canal em Integrações para enviar.</p> : null}
      </div>
    </form>
  );
}
