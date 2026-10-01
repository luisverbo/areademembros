// Textos da interface para os enums do banco.
export const releaseModeLabels = {
  all: "Tudo liberado",
  weekly: "Recorrente (semanal)",
  fixed_date: "Data fixa por aula",
  days_after_join: "Dias após a entrada",
} as const;

export const providerLabels = {
  kiwify: "Kiwify",
  hotmart: "Hotmart",
  yampi: "Yampi",
  mercadopago: "Mercado Pago",
  asaas: "Asaas",
} as const;

export const enrollmentStatusLabels = { active: "Ativa", refunded: "Reembolsada", expired: "Expirada" } as const;
export const enrollmentOriginLabels = { purchase: "Compra", free: "Grátis", manual: "Manual" } as const;
