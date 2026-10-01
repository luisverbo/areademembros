"use client";

import { useRef, type ReactNode } from "react";
import { ChevronIcon } from "@/components/icons";

/** Fileira com rolagem lateral (dedo no celular, setas no desktop). */
export function Row({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section className="group/row flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 px-4 md:px-10">
        <h2 className="text-lg font-bold md:text-xl">{title}</h2>
        <div className="flex items-center gap-3">
          {action}
          <div className="hidden gap-1 md:flex">
            <button
              type="button"
              onClick={() => scroll(-1)}
              className="border-border text-fg-muted hover:text-fg flex size-8 items-center justify-center rounded-full border"
              aria-label="Voltar"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              className="border-border text-fg-muted hover:text-fg flex size-8 items-center justify-center rounded-full border"
              aria-label="Avançar"
            >
              <ChevronIcon />
            </button>
          </div>
        </div>
      </div>
      <div
        ref={scroller}
        className="flex snap-x snap-mandatory scroll-px-4 scrollbar-none gap-3 overflow-x-auto px-4 pb-1 md:scroll-px-10 md:gap-4 md:px-10"
      >
        {children}
      </div>
    </section>
  );
}
