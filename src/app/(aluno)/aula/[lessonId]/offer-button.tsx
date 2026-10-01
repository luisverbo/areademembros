"use client";

import { useState } from "react";
import { useVideoTime } from "@/components/student/video-clock";

/** Botão de oferta que aparece por cima do vídeo no minuto definido no admin. */
export function OfferButton({ at, label, url }: { at: number; label: string; url: string }) {
  const now = useVideoTime();
  const [closed, setClosed] = useState(false);
  const [reached, setReached] = useState(false);
  if (!reached && now >= at) setReached(true); // depois que aparece, fica até o aluno fechar
  if (!reached || closed) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-end px-3 sm:bottom-16 sm:px-4">
      <div className="pointer-events-auto flex max-w-[90%] items-center gap-1 rounded-xl border border-accent/60 bg-bg/90 p-1.5 pl-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] backdrop-blur motion-safe:animate-[fadeIn_.3s_ease-out]">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          {label}
        </a>
        <button type="button" onClick={() => setClosed(true)} aria-label="Fechar oferta" className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:text-fg">
          ✕
        </button>
      </div>
    </div>
  );
}
