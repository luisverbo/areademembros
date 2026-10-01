import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "accent" | "muted";

const tones: Record<Tone, string> = {
  neutral: "bg-border text-fg-soft",
  accent: "bg-accent/15 text-accent",
  muted: "border border-border text-fg-muted",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>
  );
}
