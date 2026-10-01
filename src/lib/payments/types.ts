export type Provider = "kiwify" | "hotmart" | "yampi" | "mercadopago" | "asaas";

/** Evento de venda já traduzido do formato de cada plataforma. */
export type PurchaseEvent = {
  provider: Provider;
  /** Único por evento (idempotência). */
  idempotencyKey: string;
  kind: "approved" | "refunded" | "ignored";
  /** Nome do evento como a plataforma mandou (para o log). */
  eventType: string;
  transactionId: string | null;
  /** IDs candidatos para achar a turma (o admin cadastra um deles em "Produtos do checkout"). */
  productIds: string[];
  buyer: { email: string | null; name: string | null; phone: string | null };
};

export type WebhookContext = {
  rawBody: string;
  json: Record<string, unknown>;
  headers: Headers;
  query: URLSearchParams;
};

export type Adapter = {
  /** Variáveis de ambiente obrigatórias para aceitar o webhook. */
  requiredEnv: string[];
  verify(ctx: WebhookContext): boolean;
  /** null = evento que não interessa (ex.: boleto gerado). */
  parse(ctx: WebhookContext): Promise<PurchaseEvent | null>;
};
