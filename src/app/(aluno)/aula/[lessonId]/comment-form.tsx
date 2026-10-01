"use client";

import { useActionState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { addComment } from "./actions";

type Props = {
  lessonId: string;
  cohortId: string | null;
  parentId?: string;
  placeholder?: string;
  onDone?: () => void;
  autoFocus?: boolean;
};

export function CommentForm({ lessonId, cohortId, parentId, placeholder = "Escreva um comentário ou dúvida…", onDone, autoFocus }: Props) {
  const [state, action] = useActionState(addComment.bind(null, lessonId, cohortId), undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      onDone?.();
    }
  }, [state, onDone]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <Textarea
        name="content"
        placeholder={placeholder}
        rows={parentId ? 2 : 3}
        required
        maxLength={5000}
        aria-label={placeholder}
        autoFocus={autoFocus}
      />
      {state?.errors?.content ? <p className="text-accent text-xs">{state.errors.content[0]}</p> : null}
      <FormMessage state={state?.ok ? undefined : state} />
      <div>
        <SubmitButton size="sm" pendingText="Publicando…">
          {parentId ? "Responder" : "Comentar"}
        </SubmitButton>
      </div>
    </form>
  );
}
