"use client";

import type { ComponentProps } from "react";
import { Button } from "./button";

/** Botão de envio que pede confirmação antes (ex.: excluir). */
export function ConfirmSubmit({ message, ...props }: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
