"use client";

import { useEffect, useRef, useState } from "react";
import { SparkIcon } from "@/components/icons";
import { RichAnswer } from "@/components/student/rich-answer";
import { cn } from "@/components/ui/cn";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Resuma esta aula em 3 pontos",
  "Qual o primeiro passo para aplicar isso?",
  "Não entendi uma parte, pode explicar de outro jeito?",
];

export function ProfessorChat({ lessonId, initial, enabled }: { lessonId: string; initial: Message[]; enabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/professor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, message: text }),
      });
      if (!res.body) throw new Error("sem resposta");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + chunk };
          return copy;
        });
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "Não consegui responder agora. Tente de novo em instantes." };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="font-display font-semibold">Professor IA</p>
        <p className="text-fg-muted text-sm">Em breve: tire dúvidas sobre esta aula e receba a resposta com o minuto exato.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-2" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3 px-2 py-4">
            <p className="text-fg-soft flex items-center gap-2 text-sm">
              <SparkIcon className="text-accent" /> Pergunte qualquer coisa sobre esta aula. Eu respondo com o minuto do vídeo.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="border-border text-fg-soft hover:border-fg-muted hover:text-fg rounded-lg border px-3 py-2 text-left text-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl px-3 py-2 text-sm",
                m.role === "user" ? "bg-border text-fg ml-8" : "bg-surface-2 text-fg-soft mr-2",
              )}
            >
              {m.role === "assistant" ? (
                m.content ? (
                  <RichAnswer text={m.content} />
                ) : (
                  <span className="text-fg-muted animate-pulse">Pensando…</span>
                )
              ) : (
                m.content
              )}
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>
      <form
        className="border-border flex gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder="Sua dúvida sobre a aula…"
          aria-label="Sua dúvida sobre a aula"
          className="border-border bg-surface-2 placeholder:text-fg-muted focus:border-fg-muted h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-accent h-10 shrink-0 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
