"use client";

import { Fragment, type ReactNode } from "react";
import { formatTimestamp, TIMESTAMP_PATTERN, timestampToSeconds } from "@/lib/transcript";
import { seekVideo } from "./video-player";

/** Negrito com **texto** e minutos [mm:ss] clicáveis. */
function inline(text: string, onSeek?: (seconds: number) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = new RegExp(`${TIMESTAMP_PATTERN.source}|\\*\\*([^*]+)\\*\\*`, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const seconds = timestampToSeconds(m[1]);
      out.push(
        <button
          key={m.index}
          type="button"
          onClick={() => (onSeek ?? seekVideo)(seconds)}
          className="bg-accent/15 text-accent hover:bg-accent/25 mx-0.5 rounded px-1 font-semibold tabular-nums"
          aria-label={`Ir para ${formatTimestamp(seconds)}`}
        >
          {m[1]}
        </button>,
      );
    } else if (m[2]) {
      out.push(<strong key={m.index}>{m[2]}</strong>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Resposta da IA: parágrafos, listas com "-" ou "1." e minutos clicáveis. */
export function RichAnswer({ text, onSeek }: { text: string; onSeek?: (seconds: number) => void }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l))) {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-•*]|\d+[.)])\s+/, ""), onSeek)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(l, onSeek)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
