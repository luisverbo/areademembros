// Rótulos dos públicos (usados também no navegador, por isso fora de audience.ts).
export const SEGMENT_LABELS = {
  active: "Alunos com matrícula ativa",
  free: "Leads de curso grátis que ainda não compraram",
  idle: "Alunos parados (sem entrar há X dias)",
  completed: "Alunos que concluíram o curso",
  everyone: "Todos os cadastrados",
} as const;
export type Segment = keyof typeof SEGMENT_LABELS;
