import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";

/** Campos de formulário HTML -> tipos do banco. */
export const formFields = {
  text: (message = "Campo obrigatório.") => z.string({ error: message }).trim().min(1, message),
  optionalText: () =>
    z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  checkbox: () => z.union([z.literal("on"), z.literal("true"), z.null(), z.undefined()]).transform((v) => v === "on" || v === "true"),
  optionalInt: (min = 0) =>
    z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (v === undefined || v === null || v === "") return null;
        const n = Number(v);
        if (!Number.isInteger(n) || n < min) {
          ctx.addIssue({ code: "custom", message: `Informe um número inteiro a partir de ${min}.` });
          return z.NEVER;
        }
        return n;
      }),
  /** "15:30", "1:02:03" ou "930" -> segundos */
  optionalDuration: () =>
    z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (!v) return null;
        const seconds = parseDuration(v);
        if (seconds === null) {
          ctx.addIssue({ code: "custom", message: "Use minutos:segundos (ex.: 15:30)." });
          return z.NEVER;
        }
        return seconds;
      }),
  optionalUrl: () =>
    z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (!v) return null;
        try {
          const url = new URL(v);
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
          return url.toString();
        } catch {
          ctx.addIssue({ code: "custom", message: "Informe um link válido (https://…)." });
          return z.NEVER;
        }
      }),
  optionalUuid: () =>
    z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .pipe(z.uuid().nullable()),
};

/** Lê os campos do FormData pelo schema. Campos ausentes viram null. */
export function parseForm<S extends z.ZodObject>(
  schema: S,
  formData: FormData,
): { success: true; data: z.output<S> } | { success: false; state: FormState } {
  const raw: Record<string, FormDataEntryValue | null> = {};
  for (const key of Object.keys(schema.shape)) {
    raw[key] = formData.get(key);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      state: {
        ok: false,
        message: "Revise os campos destacados.",
        errors: z.flattenError(parsed.error).fieldErrors as FormState["errors"],
      },
    };
  }
  return { success: true, data: parsed.data };
}

/** Mensagem amigável para erros comuns do Postgres. */
export function dbErrorMessage(error: { code?: string; message: string }, fallback = "Não foi possível salvar."): string {
  if (error.code === "23505") return "Já existe um registro com esse valor (deve ser único).";
  if (error.code === "23503") return "Este item está ligado a outro registro e não pode ser alterado assim.";
  if (error.code === "23514") return "Algum valor está fora do permitido. Revise os campos.";
  if (error.code === "42501") return "Você não tem permissão para esta ação.";
  if (error.message?.includes("não pertence ao curso")) return "A aula escolhida não pertence ao curso desta turma.";
  if (error.message?.includes("outra turma deste curso")) {
    return "O aluno já tem matrícula ativa em outra turma deste curso. Use “mudar de turma” na ficha do aluno.";
  }
  return fallback;
}

export function parseDuration(value: string): number | null {
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const [, h, min, s] = m;
  if (Number(s) > 59 || (h !== undefined && Number(min) > 59)) return null;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s);
}

/** 930 -> "15:30"; 3723 -> "1:02:03" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
