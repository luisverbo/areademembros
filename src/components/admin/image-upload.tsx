"use client";

import { useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/components/ui/cn";

type Props = {
  name: string;
  label: string;
  /** Pasta dentro do bucket course-assets, ex.: "courses/<id>" */
  folder: string;
  defaultUrl?: string | null;
  /** Proporção esperada, ex.: 9/16 */
  aspect: number;
  hint: string;
  className?: string;
};

const MAX_BYTES = 10 * 1024 * 1024;

/** Envia a imagem direto para o Storage (bucket público) e guarda a URL num campo oculto do formulário. */
export function ImageUpload({ name, label, folder, defaultUrl, aspect, hint, className }: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [status, setStatus] = useState<{ busy: boolean; message?: string; warn?: boolean }>({ busy: false });

  async function onFile(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus({ busy: false, message: "Use JPG, PNG ou WEBP.", warn: true });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({ busy: false, message: "Imagem acima de 10 MB.", warn: true });
      return;
    }

    setStatus({ busy: true, message: "Enviando…" });
    const ratio = await imageRatio(file).catch(() => null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${folder}/${name}-${Date.now()}.${ext}`;

    const supabase = createClient();
    const { error } = await supabase.storage.from("course-assets").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) {
      setStatus({ busy: false, message: "Falha no envio. Tente novamente.", warn: true });
      return;
    }
    const { data } = supabase.storage.from("course-assets").getPublicUrl(path);
    setUrl(data.publicUrl);

    const off = ratio !== null && Math.abs(ratio - aspect) / aspect > 0.03;
    setStatus({
      busy: false,
      message: off
        ? "Enviada, mas a proporção é diferente da recomendada. Salve o curso para aplicar."
        : "Enviada. Salve o curso para aplicar.",
      warn: off,
    });
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={inputId} className="text-fg-soft text-sm font-medium">
        {label}
      </label>
      <input type="hidden" name={name} value={url} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={status.busy}
        style={{ aspectRatio: aspect }}
        className="group border-border bg-surface-2 text-fg-muted hover:border-fg-muted relative w-full overflow-hidden rounded-[var(--radius-card)] border border-dashed text-sm transition-colors"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia no admin, sem otimização
          <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center">Clique para enviar</span>
        )}
        {url ? (
          <span className="text-fg absolute inset-0 flex items-center justify-center bg-black/60 font-medium opacity-0 transition-opacity group-hover:opacity-100">
            Trocar imagem
          </span>
        ) : null}
      </button>
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
          e.target.value = "";
        }}
      />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={status.warn ? "text-accent" : "text-fg-muted"}>{status.message ?? hint}</span>
        {url && !status.busy ? (
          <button type="button" className="text-fg-muted hover:text-fg" onClick={() => setUrl("")}>
            Remover
          </button>
        ) : null}
      </div>
    </div>
  );
}

function imageRatio(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      resolve(img.naturalWidth / img.naturalHeight);
      URL.revokeObjectURL(src);
    };
    img.onerror = reject;
    img.src = src;
  });
}
