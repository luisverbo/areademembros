"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";

type Props = ComponentProps<typeof Button> & { pendingText?: string };

/** Botão de envio que se desativa enquanto a Server Action roda. */
export function SubmitButton({ children, pendingText = "Salvando…", ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
