"use client";

import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { CommentForm } from "./comment-form";
import { deleteComment } from "./actions";

export type CommentItem = {
  id: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  author: { id: string; name: string; isAdmin: boolean };
};

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function timeAgo(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) if (Math.abs(diff) >= secs) return relative.format(Math.round(diff / secs), unit);
  return "agora";
}

function Avatar({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        isAdmin ? "bg-accent text-white" : "bg-border text-fg-soft",
      )}
    >
      {initials}
    </span>
  );
}

function Comment({
  c,
  lessonId,
  cohortId,
  myId,
  replies,
}: {
  c: CommentItem;
  lessonId: string;
  cohortId: string | null;
  myId: string;
  replies?: CommentItem[];
}) {
  const [replying, setReplying] = useState(false);
  return (
    <li className="flex gap-3">
      <Avatar name={c.author.name} isAdmin={c.author.isAdmin} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{c.author.name}</span>
          {c.author.isAdmin ? (
            <span className="bg-accent/15 text-accent ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase">Professor</span>
          ) : null}
          <span className="text-fg-muted ml-2 text-xs">
            <time dateTime={c.createdAt}>{timeAgo(c.createdAt)}</time>
          </span>
        </p>
        <p className="text-fg-soft mt-1 text-sm [overflow-wrap:anywhere] whitespace-pre-line">{c.content}</p>
        <div className="text-fg-muted mt-1.5 flex gap-4 text-xs">
          {replies ? (
            <button type="button" className="hover:text-fg font-semibold" onClick={() => setReplying((v) => !v)}>
              Responder
            </button>
          ) : null}
          {c.author.id === myId ? (
            <button
              type="button"
              className="hover:text-accent"
              onClick={() => {
                if (window.confirm("Excluir este comentário?")) void deleteComment(c.id, lessonId);
              }}
            >
              Excluir
            </button>
          ) : null}
        </div>
        {replies?.length ? (
          <ul className="mt-4 flex flex-col gap-4">
            {replies.map((r) => (
              <Comment key={r.id} c={r} lessonId={lessonId} cohortId={cohortId} myId={myId} />
            ))}
          </ul>
        ) : null}
        {replying ? (
          <div className="mt-3">
            <CommentForm
              lessonId={lessonId}
              cohortId={cohortId}
              parentId={c.id}
              placeholder={`Responder a ${c.author.name}…`}
              onDone={() => setReplying(false)}
              autoFocus
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Comentários da turma: um nível de resposta, mais recentes primeiro. */
export function Comments({
  comments,
  lessonId,
  cohortId,
  myId,
}: {
  comments: CommentItem[];
  lessonId: string;
  cohortId: string | null;
  myId: string;
}) {
  const roots = comments.filter((c) => !c.parentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <CommentForm lessonId={lessonId} cohortId={cohortId} />
      {roots.length ? (
        <ul className="flex flex-col gap-6">
          {roots.map((c) => (
            <Comment key={c.id} c={c} lessonId={lessonId} cohortId={cohortId} myId={myId} replies={repliesOf(c.id)} />
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted text-sm">Nenhum comentário ainda. Seja o primeiro a comentar.</p>
      )}
    </div>
  );
}
