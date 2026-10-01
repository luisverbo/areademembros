"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { continueCampaign } from "../actions";

export function ContinueButton({ campaignId, pending }: { campaignId: string; pending: number }) {
  const [running, start] = useTransition();
  return (
    <Button disabled={running} onClick={() => start(() => continueCampaign(campaignId))}>
      {running ? "Enviando…" : `Continuar envio (${pending} na fila)`}
    </Button>
  );
}
