"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatTimestamp } from "@/lib/transcript";
import { regenerateSummary, saveTranscript } from "./actions";

type Summary = { points: { title: string; detail: string; start_seconds: number | null }[] } | null;

type Props = {
  lessonId: string;
  courseId: string;
  transcript: string | null;
  segmentCount: number;
  aiConfigured: boolean;
  status: "idle" | "processing" | "ready" | "error";
  error: string | null;
  summary: Summary;
  checklist: string[] | null;
};

const statusText = {
  idle: "Sem resumo ainda.",
  processing: "A IA está gerando o resumo e o checklist…",
  ready: "Resumo e checklist prontos.",
  error: "Não foi possível gerar.",
};

export function TranscriptEditor(props: Props) {
  const [state, action] = useActionState(saveTranscript.bind(null, props.lessonId, props.courseId), undefined);
  const [text, setText] = useState(props.transcript ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Enquanto processa, atualiza a página a cada 4 s para mostrar o resultado.
  useEffect(() => {
    if (props.status !== "processing") return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [props.status, router]);

  return (
    <Card>
      <CardHeader
        title="Transcrição e IA"
        description="A transcrição alimenta o resumo, o checklist, o Professor IA e a busca. Use a legenda da aula (.vtt ou .srt, do YouTube Studio ou do Bunny) para a IA citar os minutos."
        actions={
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            Enviar arquivo
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".vtt,.srt,.txt,text/vtt,text/plain"
        className="sr-only"
        aria-label="Enviar arquivo de legenda"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) setText(await file.text());
          e.target.value = "";
        }}
      />
      <form action={action} className="flex flex-col gap-3">
        <Textarea
          name="transcript"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={
            "Cole aqui a legenda (.vtt/.srt) ou o texto. Com minutos fica melhor:\n[0:05] Boas-vindas\n[2:30] Conectando o WhatsApp…"
          }
          className="font-mono text-xs"
          aria-label="Transcrição"
        />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton variant="secondary" pendingText="Salvando…">
            Salvar transcrição
          </SubmitButton>
          <span className="text-fg-muted text-xs">
            {props.segmentCount ? `${props.segmentCount} trechos salvos` : "Nenhuma transcrição salva"}
          </span>
        </div>
        <FormMessage state={state} />
      </form>

      <div className="border-border mt-6 border-t pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {props.aiConfigured ? statusText[props.status] : "IA não configurada: falta a variável ANTHROPIC_API_KEY na Vercel."}
          </p>
          {props.aiConfigured && props.segmentCount && props.status !== "processing" ? (
            <form action={regenerateSummary.bind(null, props.lessonId, props.courseId)}>
              <SubmitButton size="sm" variant="ghost" pendingText="Pedindo…">
                Gerar de novo
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {props.status === "error" && props.error ? <p className="text-accent mb-3 text-sm">{props.error}</p> : null}
        {props.summary?.points?.length ? (
          <div className="grid gap-5 md:grid-cols-2">
            <ol className="flex flex-col gap-2 text-sm">
              {props.summary.points.map((p, i) => (
                <li key={i}>
                  <span className="font-semibold">
                    {p.start_seconds !== null ? (
                      <span className="text-accent mr-1.5 tabular-nums">{formatTimestamp(p.start_seconds)}</span>
                    ) : null}
                    {p.title}
                  </span>
                  <span className="text-fg-muted block">{p.detail}</span>
                </li>
              ))}
            </ol>
            {props.checklist?.length ? (
              <ul className="text-fg-soft flex flex-col gap-1.5 text-sm">
                {props.checklist.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="border-fg-muted mt-1 size-3 shrink-0 rounded border" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
