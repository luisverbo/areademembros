// Classificação de comentários por palavras-chave (sem IA, sem custo).
// Não é perfeita: serve para ordenar a fila e dar números ao admin, que sempre lê o comentário.

export type CommentKind = "question" | "complaint" | "praise" | "request" | "technical";

export const kindLabels: Record<CommentKind, string> = {
  question: "Dúvida",
  complaint: "Reclamação",
  praise: "Elogio",
  request: "Pedido",
  technical: "Problema técnico",
};

export const kindPluralLabels: Record<CommentKind, string> = {
  question: "Dúvidas",
  complaint: "Reclamações",
  praise: "Elogios",
  request: "Pedidos",
  technical: "Problemas técnicos",
};

/** Remove acentos e deixa minúsculo, para comparar palavras. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const URGENT = [
  /reembols/,
  /estorn/,
  /devolu[cç]/,
  /devolve(r|m)? (o |meu )?dinheiro/,
  /procon/,
  /reclame ?aqui/,
  /cancel(ar|amento)/,
  /golpe/,
  /processar/,
  /advogad/,
];

const RULES: [CommentKind, RegExp[]][] = [
  [
    "technical",
    [
      /nao (carrega|abre|toca|funciona|aparece|consigo (assistir|acessar|abrir|baixar|entrar))/,
      /\b(erro|bug|travan?d?o?|trava|bugad[oa])\b/,
      /\bsem (som|audio|imagem)\b/,
      /video (parado|nao)/,
      /tela (preta|branca)/,
      /link (quebrado|nao)/,
    ],
  ],
  [
    "complaint",
    [
      /\b(pessim[oa]|horrivel|ruim|decepcion|insatisfeit|enganad|absurdo|desrespeito|vergonha|lixo)/,
      /perda de tempo/,
      /nao (gostei|vale)/,
      /esperava mais/,
      ...URGENT,
    ],
  ],
  [
    "request",
    [
      /\b(poderia|podia|podiam|poderiam) (fazer|gravar|trazer|ensinar|mostrar|explicar)/,
      /\b(aula|modulo|video|conteudo) (sobre|de|ensinando|mostrando)\b.*\b(seria|poderia|queria|gostaria)/,
      /\b(seria (legal|bom|otimo|incrivel)|sugest|sugiro|gostaria (de|que) (tivesse|fizesse|ter))/,
      /\b(queria|quero) (uma|um) (aula|modulo|video)/,
      /\bfaz (uma|um) (aula|video)/,
    ],
  ],
  [
    "question",
    [
      /\?/,
      /\b(duvida|nao entendi|nao ficou claro|como (eu )?(faco|faz|configur|conect|uso|usar)|qual (e|o|a)|onde (eu )?(encontro|fica|acho)|alguem sabe|tem como|e possivel|consigo)\b/,
    ],
  ],
  [
    "praise",
    [
      /\b(obrigad|parabens|excelente|maravilh|incrivel|sensacional|top|amei|adorei|perfeit|show|fantastic|muito bo[am]|nota (10|mil)|gratidao|valeu)/,
    ],
  ],
];

/** Tipo principal do comentário. A ordem das regras define a prioridade (problema técnico e reclamação primeiro). */
export function classifyComment(content: string): CommentKind | null {
  const text = normalize(content);
  for (const [kind, patterns] of RULES) if (patterns.some((p) => p.test(text))) return kind;
  return null;
}

/** Menção a reembolso, cancelamento, Procon etc.: vai para o topo do Radar. */
export function isUrgent(content: string): boolean {
  const text = normalize(content);
  return URGENT.some((p) => p.test(text));
}

const STOPWORDS = new Set(
  normalize(
    `a o e é de da do das dos em no na nos nas um uma uns umas para pra pro por com sem que se não nao mas mais muito muita
    muitos muitas como eu me meu minha meus minhas você voce vc vocês voces ele ela eles elas isso isto esse essa esses essas
    este esta aquele aquela aqui ali lá la já ja tem ter tenho tinha foi ser são sao era está esta estou estava ao aos às as os
    sobre também tambem só so até ate quando onde qual quais porque pq porquê então entao ainda bem tudo todo toda todos todas
    nem nos nós lhe seu sua seus suas dele dela fazer faz fiz pode posso consigo vai vou ou entre depois antes agora hoje
    aula aulas vídeo video professor prof oi olá ola boa bom dia tarde noite obrigado obrigada gente pessoal alguém alguem
    sei saber ver vi fica ficou coisa coisas assim tá ta né ne kk kkk kkkk rs`,
  ).split(/\s+/),
);

/** Palavras que mais aparecem (sem acento, sem palavras comuns, com 4+ letras). */
export function topWords(texts: string[], limit = 20): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const seen = new Set<string>();
    for (const word of normalize(text).match(/[a-z0-9]{4,}/g) ?? []) {
      if (STOPWORDS.has(word) || /^\d+$/.test(word) || seen.has(word)) continue;
      seen.add(word); // conta uma vez por comentário
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}
