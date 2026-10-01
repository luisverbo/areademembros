# Configurar o Supabase de produção (passo a passo)

O projeto do Supabase está numa conta própria, então a instalação é feita por você, colando os arquivos no painel.
São uns 10 minutos. Faça na ordem.

> Se algum passo der erro, copie a mensagem e me mande. Nada aqui apaga dados.

---

## 1. Instalar o banco (tabelas, regras de acesso, storage)

1. Abra o projeto no Supabase → menu **SQL Editor** → **New query**.
2. Abra o arquivo [`supabase/setup/01-instalar-banco.sql`](../supabase/setup/01-instalar-banco.sql), copie **tudo** e cole.
3. Clique **Run**. Deve terminar com "Success. No rows returned".
   - Rode **uma vez só**, num projeto novo. Tudo roda numa transação: se der erro, nada fica pela metade.
4. Confira em **Table Editor**: devem aparecer 14 tabelas (courses, cohorts, enrollments…). Em **Storage**: os buckets `course-assets` e `lesson-materials`.

## 2. Criar o seu usuário admin

1. **Authentication → Users → Add user → Create new user**.
2. E-mail: `luisverbo@gmail.com` (ou o que você vai usar). Senha: a que você vai usar para entrar no site. Marque **Auto Confirm User**.
3. Volte ao **SQL Editor**, cole o conteúdo de [`supabase/setup/02-tornar-admin.sql`](../supabase/setup/02-tornar-admin.sql) e rode.
   O resultado deve mostrar o seu e-mail com `role = admin`.

## 3. Login por link mágico

**Authentication → URL Configuration**
- **Site URL:** o endereço do site (ex.: `https://lc.academy`). Enquanto não houver domínio, use o da Vercel (ex.: `https://lc-academy.vercel.app`).
- **Redirect URLs:** adicione `https://SEU-DOMINIO/**` (e `http://localhost:3000/**` se for testar localmente).

**Authentication → Emails → Templates → Magic Link**
- **Subject:** `Seu link de acesso`
- **Body:** cole o conteúdo de [`supabase/templates/magic_link.html`](../supabase/templates/magic_link.html).
  (Esse modelo funciona mesmo quando o aluno abre o e-mail em outro aparelho.)

**Authentication → Emails → Templates → Reset Password** (criar/trocar senha)
- **Subject:** `Crie sua senha de acesso`
- **Body:** cole o conteúdo de [`supabase/templates/recovery.html`](../supabase/templates/recovery.html).

**Authentication → Sign In / Providers**
- Em **Email**, mantenha ativo.
- Desligue **Allow new users to sign up**. As contas nascem na compra, no cadastro do curso grátis ou pelo admin; ninguém cria conta sozinho pela tela de login.

## 4. E-mail (Resend) — necessário antes de liberar para alunos

O e-mail padrão do Supabase só envia poucas mensagens por hora e só para membros do projeto. Serve para você testar, não para alunos.

1. Crie a conta no [Resend](https://resend.com), adicione e verifique o seu domínio (registros DNS que eles mostram).
2. No Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**
   - Host `smtp.resend.com` · Port `465` · User `resend` · Password: a API key do Resend
   - Sender email: ex. `acesso@seudominio.com.br` · Sender name: `LC.Academy`

## 5. Chaves para o site (Vercel)

Em **Project Settings → API Keys** (ou **API**), pegue:

| Variável na Vercel | Onde está no Supabase | Pode me mandar? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon` / publishable | Sim (é pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` / secret | **Não.** Cole direto na Vercel. Ela dá acesso total ao banco. |

Mais estas, também na Vercel:

- `NEXT_PUBLIC_SITE_URL` = o endereço do site
- `NEXT_PUBLIC_APP_NAME` = `LC.Academy`

---

## Atualizações do banco

Cada etapa que muda o banco traz um arquivo de atualização em `supabase/setup/` (`03-atualizacao-etapa-1b.sql`, `04-atualizacao-etapa-1c.sql`…).
Rode no SQL Editor, uma vez, na ordem dos números. O `01` sempre tem o banco completo, para instalar do zero.

## Vídeos (Bunny Stream)

Variáveis na Vercel:
- `BUNNY_LIBRARY_ID`: Stream → sua biblioteca → API → Library ID
- `BUNNY_TOKEN_KEY`: Stream → sua biblioteca → Security → **Token Authentication** (ative e copie a chave). Secreta.

Na mesma tela de Security, ative **Allowed Domains** só com o domínio do site: assim o vídeo não toca fora da área de membros.

## E-mail pelo Resend (variáveis na Vercel)

- `RESEND_API_KEY`: Resend → API Keys → Create API Key (permissão Sending). Secreta.
- `EMAIL_FROM`: remetente com o domínio verificado no Resend, ex.: `LC.Academy <acesso@seudominio.com.br>`.

Com isso, o site envia os e-mails de acesso com o visual da área. Não é preciso editar modelos no Supabase.

## Plataformas de pagamento

Tudo em **Admin → Integrações**: a URL de cada plataforma, onde colar e quais variáveis faltam.
