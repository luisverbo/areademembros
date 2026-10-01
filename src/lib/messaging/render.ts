// Variáveis das mensagens: {{nome}}, {{curso}}, {{aula}}, {{link}}...

export const MESSAGE_VARIABLES = [
  { key: "nome", label: "primeiro nome do aluno" },
  { key: "curso", label: "nome do curso" },
  { key: "link", label: "link da área de membros (ou o da mensagem)" },
] as const;

export type MessageVars = Record<string, string | null | undefined>;

export function firstName(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] || "";
}

/** Troca {{chave}} pelo valor. Variável sem valor some (e o espaço duplo que sobra também). */
export function renderTemplate(template: string, vars: MessageVars): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => vars[key.toLowerCase()]?.trim() ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .replace(/,([!?.])/g, "$1")
    .trim();
}
