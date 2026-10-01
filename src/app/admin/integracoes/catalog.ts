import type { Provider } from "@/lib/payments/types";

/** Ficha de cada integração: o que aparece no card e o passo a passo da página de configuração. */
export type IntegrationInfo = {
  slug: string;
  name: string;
  monogram: string;
  summary: string;
  steps: string[];
  /** Onde a plataforma pede o "produto": o que o admin cadastra em Produtos do checkout. */
  productHint?: string;
};

export const PAYMENT_INTEGRATIONS: Record<Provider, IntegrationInfo> = {
  kiwify: {
    slug: "kiwify",
    name: "Kiwify",
    monogram: "K",
    summary: "Compra aprovada, reembolso e chargeback.",
    steps: [
      "Na Kiwify, abra Apps → Webhooks → Criar webhook.",
      "Cole a URL acima e marque: Compra aprovada, Reembolso e Chargeback.",
      "Copie o Token que a Kiwify mostra.",
      "Na Vercel (Settings → Environment Variables), crie KIWIFY_WEBHOOK_TOKEN com esse token e faça Redeploy.",
    ],
    productHint: "ID do produto na Kiwify (aparece no link do produto).",
  },
  hotmart: {
    slug: "hotmart",
    name: "Hotmart",
    monogram: "H",
    summary: "Compra aprovada, reembolso, chargeback e cancelamento.",
    steps: [
      "Na Hotmart, abra Ferramentas → Webhook (API e notificações).",
      "Cadastre a URL acima na versão 2.0.0, com os eventos de compra.",
      "Copie o Hottok da sua conta.",
      "Na Vercel, crie HOTMART_HOTTOK com esse valor e faça Redeploy.",
    ],
    productHint: "ID do produto na Hotmart (número).",
  },
  yampi: {
    slug: "yampi",
    name: "Yampi",
    monogram: "Y",
    summary: "Pedido pago e mudança de status.",
    steps: [
      "Na Yampi, abra Configurações → Webhooks.",
      "Cole a URL acima e marque Pedido pago e Status do pedido atualizado.",
      "Copie a chave secreta do webhook.",
      "Na Vercel, crie YAMPI_WEBHOOK_SECRET com essa chave e faça Redeploy.",
    ],
    productHint: "ID do SKU ou ID do produto na Yampi.",
  },
  mercadopago: {
    slug: "mercadopago",
    name: "Mercado Pago",
    monogram: "MP",
    summary: "Pagamentos aprovados, estornos e chargebacks.",
    steps: [
      "No Mercado Pago, abra Suas integrações → sua aplicação → Webhooks.",
      "Cole a URL acima e marque Pagamentos.",
      "Copie a Assinatura secreta e, em Credenciais de produção, o Access Token.",
      "Na Vercel, crie MERCADOPAGO_WEBHOOK_SECRET e MERCADOPAGO_ACCESS_TOKEN e faça Redeploy.",
    ],
    productHint: "Referência externa (external_reference) do link de pagamento.",
  },
  asaas: {
    slug: "asaas",
    name: "Asaas",
    monogram: "A",
    summary: "Cobranças confirmadas, estornos e chargebacks.",
    steps: [
      "No Asaas, abra Integrações → Webhooks → Cobranças.",
      "Cole a URL acima e crie um token de autenticação (32 caracteres ou mais).",
      "Copie o token e, em Integrações → Chave de API, a sua chave.",
      "Na Vercel, crie ASAAS_WEBHOOK_TOKEN e ASAAS_API_KEY e faça Redeploy.",
    ],
    productHint: "ID do link de pagamento no Asaas.",
  },
};

export const OTHER_INTEGRATIONS = {
  email: { slug: "email", name: "E-mail (Resend)", monogram: "@", summary: "E-mails de acesso, senha e boas-vindas com o visual da área." },
  funil: { slug: "funil", name: "FunilPro e outros", monogram: "↗", summary: "Avisa seu funil a cada lead, venda ou reembolso." },
  whatsapp: { slug: "whatsapp", name: "WhatsApp", monogram: "W", summary: "Mensagens e automações pela API oficial (Meta) ou pela Z-API." },
  cron: {
    slug: "cron",
    name: "Envios automáticos",
    monogram: "⏱",
    summary: "Roda as automações uma vez por dia (aluno parado, aula liberada…).",
  },
} as const;
