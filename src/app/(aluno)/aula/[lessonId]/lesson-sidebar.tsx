"use client";

import { useState, type ReactNode } from "react";
import { SparkIcon } from "@/components/icons";
import { cn } from "@/components/ui/cn";

type Tab = "aulas" | "caderno" | "ia";

/** Painel lateral com 3 abas: Aulas · Caderno · Professor IA. */
export function LessonSidebar({ lessons }: { lessons: ReactNode }) {
  const [tab, setTab] = useState<Tab>("aulas");
  const tabs: { id: Tab; label: ReactNode }[] = [
    { id: "aulas", label: "Aulas" },
    { id: "caderno", label: "Caderno" },
    {
      id: "ia",
      label: (
        <span className="inline-flex items-center gap-1.5">
          <SparkIcon width={14} height={14} className="text-accent" /> Professor IA
        </span>
      ),
    },
  ];

  return (
    <aside className="border-border bg-surface flex max-h-[420px] min-h-0 flex-col rounded-[var(--radius-card)] border lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
      <div role="tablist" aria-label="Painel da aula" className="border-border flex border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative flex-1 px-2 py-3 text-sm font-semibold whitespace-nowrap transition-colors",
              tab === t.id ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
            {tab === t.id ? <span className="bg-accent absolute inset-x-3 -bottom-px h-0.5 rounded-full" /> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "aulas" ? (
          lessons
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="font-display font-semibold">{tab === "caderno" ? "Caderno de anotações" : "Professor IA"}</p>
            <p className="text-fg-muted text-sm">
              {tab === "caderno"
                ? "Em breve: anote com o minuto da aula e volte ao ponto com um clique."
                : "Em breve: tire dúvidas sobre esta aula e receba a resposta com o minuto exato."}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
