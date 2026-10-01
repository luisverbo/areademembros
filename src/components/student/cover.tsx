import { cn } from "@/components/ui/cn";

/** Imagem de capa/miniatura com fundo neutro quando não houver imagem. */
export function Cover({ src, alt = "", fallback, className }: { src: string | null; alt?: string; fallback?: string; className?: string }) {
  return (
    <div className={cn("bg-surface-2 relative overflow-hidden", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagens do Storage; tamanhos já definidos no upload
        <img src={src} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : fallback ? (
        <span className="font-display text-fg-muted absolute inset-0 flex items-center justify-center p-4 text-center text-sm font-semibold">
          {fallback}
        </span>
      ) : null}
    </div>
  );
}
