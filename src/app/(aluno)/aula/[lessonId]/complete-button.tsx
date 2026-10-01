"use client";

import { useOptimistic, useTransition } from "react";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { setLessonCompleted } from "./actions";

export function CompleteButton({ lessonId, completed }: { lessonId: string; completed: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(completed);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      disabled={pending}
      aria-pressed={optimistic}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await setLessonCompleted(lessonId, !optimistic);
        })
      }
    >
      <CheckIcon className={optimistic ? "text-accent" : "text-fg-muted"} />
      {optimistic ? "Concluída" : "Marcar como concluída"}
    </Button>
  );
}
