# LC.Academy — Área de Membros

Área de membros estilo Netflix com IA, da LC Marketing Digital.
**A fonte da verdade do projeto é [`docs/PROJETO.md`](docs/PROJETO.md).**

Stack: Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres, Auth com link mágico, Storage).

## Status

| Etapa | Situação |
| --- | --- |
| 1A — Fundação e admin de conteúdo | ✅ entregue para revisão |
| 1B — Experiência do aluno (vitrine, aula) | próxima |
| 1C — Webhooks (Kiwify, Hotmart, Yampi, Mercado Pago, Asaas), grátis, ficha do aluno | depois |

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
| `npm run db:types` | regenera `src/lib/database.types.ts` a partir do banco local |

## Estrutura

```
docs/PROJETO.md                 documento do projeto (decisões, etapas)
supabase/migrations/            schema, RLS, storage e funções (fonte da verdade do banco)
supabase/templates/             e-mail do link mágico (pt-BR)
src/app/entrar, src/app/auth    login por link mágico
src/app/admin/                  painel admin: cursos, aulas, turmas, alunos
src/lib/                        Supabase, auth, datas (fuso São Paulo), formulários
tests/db, tests/e2e             testes de banco e de navegador
```

## Regras importantes (resumo)

- **Liberação de aulas é calculada no banco** (`lesson_release_at`), no fuso `America/Sao_Paulo`, e aplicada pelo RLS.
  O aluno só lê o conteúdo (`lesson_contents`, materiais) das aulas liberadas; reembolso ou expiração cortam o acesso na hora.
- **Vídeo nunca fica no servidor**: Bunny Stream para aulas pagas; YouTube só para conteúdo grátis (validado no admin).
- **Nenhuma chave no código**: tudo em variáveis de ambiente (`.env.example`). `SUPABASE_SERVICE_ROLE_KEY` só no servidor.

## Configuração do Supabase em produção (quando o projeto for criado)

1. Aplicar as migrações (`npx supabase link` + `npx supabase db push`).
2. Authentication → URL Configuration: Site URL = domínio; Redirect URLs = `https://<domínio>/**`.
3. Authentication → Emails → Magic Link: colar `supabase/templates/magic_link.html`.
4. Authentication → SMTP: configurar o Resend (domínio autenticado).
5. Authentication → Sign In: desativar cadastro público por e-mail (contas nascem na compra, no cadastro grátis ou pelo admin).
