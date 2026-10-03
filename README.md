# LC.Academy — Área de Membros

Área de membros estilo Netflix com IA, da LC Marketing Digital.
**A fonte da verdade do projeto é [`docs/PROJETO.md`](docs/PROJETO.md).**

Stack: Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth com link mágico, Storage).

## Status

| Etapa | Situação |
| --- | --- |
| 1A — Fundação e admin de conteúdo | ✅ entregue |
| 1B — Experiência do aluno (vitrine, curso, aula, progresso, comentários) | ✅ entregue |
| 1C — Webhooks (Kiwify, Hotmart, Yampi, Mercado Pago, Asaas), e-mail (Resend), curso grátis + lead, webhooks de saída, ficha do aluno | ✅ entregue |
| 2A — Transcrição (legenda), resumo e checklist, busca nas aulas (Professor IA removido; IA só com chave) | ✅ entregue |
| 2B — Caderno com minuto (exporta PDF/Word), prévia estilo trailer, botão de oferta no vídeo | ✅ entregue |
| 2C — Radar de Comentários (sem IA): fila de atendimento, aulas com mais dúvidas, buscas, alunos parados | ✅ entregue |
| 3A — Central de Mensagens (e-mail e WhatsApp oficial/Z-API), automações, alerta urgente, resumo semanal, descadastro | ✅ entregue |
| 3B — Certificados com verificação, recomendação de próximo curso (sem IA), painel de desempenho, Minha conta | ✅ entregue |
| 3C — Revisão de segurança (com correções), acessibilidade (varredura axe), desempenho e polimento | ✅ entregue |

## Rodando localmente

Requisitos: Node 20.9+, Docker.

```bash
npm install
npx supabase start            # sobe Postgres/Auth/Storage locais e aplica as migrações
cp .env.example .env.local    # preencha com as chaves que o comando acima imprime
npm run dev                   # http://localhost:3000
```

Primeiro admin: depois de criar o usuário (pelo admin de outro admin, ou no painel do Supabase), rode no SQL:

```sql
update public.profiles set role = 'admin' where email = 'seu@email.com';
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run lint` / `npm run typecheck` | ESLint e TypeScript |
| `npm run test:unit` | testes de funções (datas, formulários, vídeo) |
| `npm run test:db` | testes das migrações, RLS e regras de liberação (precisa de um Postgres em `TEST_DATABASE_URL`) |
| `node tests/e2e/admin-smoke.mjs` | teste ponta a ponta do admin no navegador (com `npm run dev` rodando) |
| `node tests/e2e/student-smoke.mjs` | teste ponta a ponta da área do aluno (cria e apaga os próprios dados) |
| `node tests/e2e/password-smoke.mjs` | login com senha e primeiro acesso |
| `node tests/e2e/webhooks-smoke.mjs` | webhooks de pagamento, curso grátis, webhooks de saída e Integrações |
| `node tests/e2e/ai-smoke.mjs` | transcrição, resumo na aula e busca (sem chave da IA) |
| `node tests/e2e/a11y-scan.mjs` | varredura de acessibilidade (axe) nas telas principais |
| `node tests/e2e/certificates-smoke.mjs` | certificado, verificação pública, recomendação e painel de desempenho |
| `node tests/e2e/messages-smoke.mjs` | Central de Mensagens com servidor falso de e-mail/WhatsApp (veja o topo do arquivo) |
| `node tests/e2e/radar-smoke.mjs` | Radar de Comentários: fila, responder, resolver, buscas e alunos parados |
| `node tests/e2e/notebook-smoke.mjs` | caderno, Meu Caderno, exportação, oferta no vídeo e prévia de curso bloqueado |
| `npm run db:types` | regenera `src/lib/database.types.ts` a partir do banco local |

## Estrutura

```
docs/PROJETO.md                 documento do projeto (decisões, etapas)
supabase/migrations/            schema, RLS, storage e funções (fonte da verdade do banco)
supabase/templates/             e-mail do link mágico (pt-BR)
src/app/entrar, src/app/auth    login com senha ou link mágico, primeiro acesso / esqueci a senha
src/app/admin/                  painel admin: cursos, aulas, turmas, alunos
src/app/(aluno)/                vitrine, página do curso e página da aula
src/app/gratis/                 página pública do curso grátis (captação de lead)
src/app/api/webhooks/           webhooks das plataformas de pagamento
src/lib/payments/               tradução de cada plataforma + processamento das vendas
src/lib/                        Supabase, auth, datas (fuso São Paulo), formulários
tests/db, tests/e2e             testes de banco e de navegador
```

## Regras importantes (resumo)

- **Liberação de aulas é calculada no banco** (`lesson_release_at`), no fuso `America/Sao_Paulo`, e aplicada pelo RLS.
  O aluno só lê o conteúdo (`lesson_contents`, materiais) das aulas liberadas; reembolso ou expiração cortam o acesso na hora.
- **Vídeo nunca fica no servidor**: Bunny Stream ou YouTube não listado (provisório nas aulas pagas, com aviso no admin).
- **Nenhuma chave no código**: tudo em variáveis de ambiente (`.env.example`). `SUPABASE_SERVICE_ROLE_KEY` só no servidor.

## Configuração do Supabase em produção

Passo a passo em [`docs/SUPABASE-SETUP.md`](docs/SUPABASE-SETUP.md). O banco é instalado colando
`supabase/setup/01-instalar-banco.sql` no SQL Editor. Esse arquivo é gerado a partir das migrações com
`node scripts/build-setup-sql.mjs`; gere de novo sempre que uma migração mudar.
