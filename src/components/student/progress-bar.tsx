import { cn } from "@/components/ui/cn";

export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${value}% assistido`}
      className={cn("bg-border h-1 w-full overflow-hidden rounded-full", className)}
    >
      <div className="bg-accent h-full rounded-full" style={{ width: `${value}%` }} />
    </div>
  );
}
