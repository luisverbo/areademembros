"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { summaryToLines } from "@/lib/summary-text";
import { regenerateSummary, saveManualSummary, saveTranscript } from "./actions";

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

export function TranscriptEditor(props: Props) {
  const [state, action] = useActionState(saveTranscript.bind(null, props.lessonId, props.courseId), undefined);
  const [summaryState, summaryAction] = useActionState(saveManualSummary.bind(null, props.lessonId, props.courseId), undefined);
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
        title="Transcrição e resumo"
        description="A legenda da aula (.vtt ou .srt, do YouTube Studio ou do Bunny) alimenta a busca: o aluno acha a aula e o minuto exato."
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

      <form action={summaryAction} className="border-border mt-6 flex flex-col gap-3 border-t pt-5">
        <div>
          <p className="text-sm font-semibold">Resumo da aula</p>
          <p className="text-fg-muted text-xs">Aparece para o aluno embaixo do vídeo. O minuto vira um botão que leva o vídeo ao ponto.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
          <label className="text-fg-soft flex flex-col gap-1.5 text-sm">
            Pontos principais (um por linha)
            <Textarea
              name="summary"
              key={`s-${summaryToLines(props.summary?.points)}`}
              defaultValue={summaryToLines(props.summary?.points)}
              rows={6}
              placeholder={"0:05 Boas-vindas — o que você vai aprender\n2:30 Conectar o WhatsApp — ligando o número na ferramenta"}
              className="text-sm"
            />
          </label>
          <label className="text-fg-soft flex flex-col gap-1.5 text-sm">
            Checklist (um item por linha)
            <Textarea
              name="checklist"
              key={`c-${(props.checklist ?? []).join("|")}`}
              defaultValue={(props.checklist ?? []).join("\n")}
              rows={6}
              placeholder={"Conectar o número\nEnviar uma mensagem de teste"}
              className="text-sm"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton variant="secondary" pendingText="Salvando…">
            Salvar resumo
          </SubmitButton>
          {props.aiConfigured && props.segmentCount && props.status !== "processing" ? (
            <Button type="submit" formAction={regenerateSummary.bind(null, props.lessonId, props.courseId)} variant="ghost" size="sm">
              Gerar com IA
            </Button>
          ) : null}
          {props.aiConfigured && props.status === "processing" ? (
            <span className="text-fg-muted text-xs">A IA está gerando o resumo…</span>
          ) : null}
        </div>
        {props.status === "error" && props.error ? <p className="text-accent text-sm">{props.error}</p> : null}
        <FormMessage state={summaryState} />
      </form>
    </Card>
  );
}
