"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { addMaterial, deleteMaterial } from "./actions";

type Material = { id: string; name: string; file_type: string | null; size_bytes: number | null };

const MAX_BYTES = 50 * 1024 * 1024;

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Materials({ lessonId, courseId, materials }: { lessonId: string; courseId: string; materials: Material[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload(files: FileList) {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setMessage(`“${file.name}” passa de 50 MB.`);
        continue;
      }
      const safeName = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
      const path = `${lessonId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("lesson-materials").upload(path, file, { contentType: file.type || undefined });
      if (error) {
        setMessage(`Falha ao enviar “${file.name}”.`);
        continue;
      }
      const result = await addMaterial(lessonId, courseId, {
        name: file.name,
        storage_path: path,
        file_type: file.type || null,
        size_bytes: file.size,
      });
      if (!result.ok) setMessage(result.message ?? "Falha ao registrar o arquivo.");
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader
        title="Materiais"
        description="PDFs, planilhas e arquivos de apoio. Só quem tem acesso à aula baixa."
        actions={
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Enviando…" : "+ Arquivo"}
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        className="sr-only"
        aria-label="Enviar materiais"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
          e.target.value = "";
        }}
      />
      {message ? <p className="text-accent-soft mb-3 text-sm">{message}</p> : null}
      {materials.length ? (
        <ul className="divide-border divide-y">
          {materials.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">{m.name}</span>
              <span className="text-fg-muted flex shrink-0 items-center gap-3 text-xs">
                {formatSize(m.size_bytes)}
                <button
                  type="button"
                  disabled={pending}
                  className="hover:text-accent-soft"
                  onClick={() => {
                    if (window.confirm(`Excluir “${m.name}”?`)) startTransition(() => deleteMaterial(m.id, lessonId, courseId));
                  }}
                >
                  Excluir
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted text-sm">Nenhum material.</p>
      )}
    </Card>
  );
}
