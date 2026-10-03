"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { kindLabels } from "@/lib/radar/classify";
import type { RadarComment } from "@/lib/radar/data";
import { replyToComment, setCommentHandled } from "./actions";

const ago = (iso: string) => {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "agora há pouco";
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
};

function QueueItem({ comment }: { comment: RadarComment }) {
  const [replying, setReplying] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, action] = useActionState(replyToComment, undefined);

  return (
    <li className={`rounded-lg border p-4 ${comment.urgent ? "border-accent/60 bg-accent/5" : "border-border bg-surface-2"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {comment.urgent ? <Badge tone="accent">Urgente</Badge> : null}
        {comment.kind ? (
          <Badge tone={comment.kind === "technical" || comment.kind === "complaint" ? "accent" : "neutral"}>
            {kindLabels[comment.kind]}
          </Badge>
        ) : null}
        <Link href={`/admin/alunos/${comment.authorId}`} className="text-fg hover:text-accent-soft font-semibold">
          {comment.authorName}
        </Link>
        <span className="text-fg-muted">·</span>
        <Link href={`/aula/${comment.lessonId}`} className="text-fg-soft hover:text-fg">
          {comment.courseTitle} › {comment.lessonTitle}
        </Link>
        {comment.cohortName ? <span className="text-fg-muted">({comment.cohortName})</span> : null}
        <span className="text-fg-muted ml-auto" title={new Date(comment.createdAt).toLocaleString("pt-BR")}>
          {ago(comment.createdAt)}
        </span>
      </div>
      <p className="text-fg mt-2 text-sm whitespace-pre-line">{comment.content}</p>

      {replying ? (
        <form action={action} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="commentId" value={comment.id} />
          <textarea
            name="content"
            rows={3}
            autoFocus
            aria-label={`Resposta para ${comment.authorName}`}
            placeholder="Sua resposta aparece embaixo do comentário, na aula."
            className="border-border bg-surface focus:border-fg-muted w-full rounded-lg border p-3 text-sm focus:outline-none"
          />
          {state?.errors?.content ? <p className="text-accent-soft text-sm">{state.errors.content[0]}</p> : null}
          <FormMessage state={state} />
          <div className="flex gap-2">
            <SubmitButton size="sm" pendingText="Enviando…">
              Publicar resposta
            </SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setReplying(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => setReplying(true)}>
            Responder
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => startTransition(() => setCommentHandled(comment.id, true))}
          >
            {pending ? "Salvando…" : "Marcar como resolvido"}
          </Button>
        </div>
      )}
    </li>
  );
}

export function RadarQueue({ comments }: { comments: RadarComment[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? comments : comments.slice(0, 15);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {visible.map((c) => (
          <QueueItem key={c.id} comment={c} />
        ))}
      </ul>
      {comments.length > visible.length ? (
        <Button variant="secondary" size="sm" className="self-center" onClick={() => setShowAll(true)}>
          Ver mais {comments.length - visible.length}
        </Button>
      ) : null}
    </div>
  );
}
