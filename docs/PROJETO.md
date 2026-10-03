# Área de Membros com IA — Documento do Projeto

> **Instruções para o Claude Code (leia antes de qualquer coisa)**
>
> 1. **NÃO execute nada ainda.** Este documento é para você ENTENDER o projeto, não para começar a codar.
> 2. **Salve este arquivo na raiz do projeto como `docs/PROJETO.md`.** Ele é a fonte da verdade. Sempre que tiver dúvida sobre uma funcionalidade, regra ou decisão, consulte este arquivo antes de perguntar ou assumir algo.
> 3. Depois de ler tudo, me responda com:
>    - Um resumo, nas suas palavras, do que vamos construir (para eu confirmar que você entendeu).
>    - As **etapas** em que você propõe dividir o desenvolvimento (use as etapas da seção 10 como base, mas pode sugerir ajustes se fizer sentido).
>    - Para cada etapa, o que entra e o que fica de fora.
>    - Suas dúvidas e os pontos que precisam de decisão minha antes de começar a Etapa 1.
> 4. Vamos construir **uma etapa de cada vez**, com muita qualidade. Só passamos para a próxima quando a anterior estiver pronta, testada e aprovada por mim.
> 5. Este projeto é **separado do FunilPro**. Não misture código, banco ou autenticação entre os dois.

---

## 1. Visão geral

Uma área de membros própria, estilo **Netflix**, com inteligência artificial embutida, para hospedar:

- A **mentoria "IA para Negócios Locais"** (turmas com aulas ao vivo às segundas + aulas gravadas).
- **Minicursos** (ex.: "Como criar um produto de postagem automática no Instagram").
- Todos os cursos futuros da LC Marketing Digital.

Além de entregar as aulas, a área **vende**: o aluno vê o portfólio inteiro, com os cursos que não comprou travados, e compra direto pelo checkout.

**Quem usa:**
- **Aluno**: assiste, anota, pergunta para a IA, comenta, vê o progresso e compra novos cursos.
- **Admin (eu, Luís)**: cadastra cursos/aulas/turmas, acompanha alunos, envia mensagens e recebe os relatórios da IA.
- **Visitante**: acessa um curso grátis por link público, se cadastra (vira lead) e vê a vitrine com os cursos travados.

### Decisões já tomadas (não reabrir)

| Decisão | Escolha |
| --- | --- |
| Separado do FunilPro | Sim, projeto e banco próprios. Integração apenas por webhook. |
| Hospedagem de vídeo | Fora do site. **Bunny Stream** (recomendado para aulas pagas) e **YouTube não listado**, liberado também para aulas pagas até a conta do Bunny (decisão de 01/10/2026; o admin mostra o aviso de menor proteção). Nunca hospedar vídeo no próprio servidor. |
| Download de vídeo | **Proibido.** Só as anotações do aluno podem ser exportadas. |
| Integração externa | Só com as plataformas de pagamento. Toda a inteligência fica dentro da área. |
| Turmas | Um curso pode ter várias turmas, cada uma com aulas e liberação próprias. |
| Cursos grátis | Existem, com link público, cadastro rápido e vitrine aberta. |
| Login | **E-mail e senha** (principal) + link mágico por e-mail como alternativa. Primeiro acesso e "esqueci a senha" por link no e-mail (decisão de 01/10/2026). |

---

## 2. Stack técnico

| Parte | Tecnologia |
| --- | --- |
| Front-end e back-end | **Next.js** (App Router), TypeScript, publicado na **Vercel** |
| Banco de dados, auth e storage | **Supabase** (Postgres + Auth com magic link + Storage para capas, banners e materiais) |
| Vídeos pagos | **Bunny Stream** (player embedado, token de acesso com validade, restrito ao domínio) |
| Vídeos grátis | YouTube embed |
| Pagamento | Checkout externo → webhook. **Multi-plataforma:** Kiwify, Hotmart, Yampi, Mercado Pago e Asaas (um adaptador por provedor, núcleo único de matrícula). |
| WhatsApp | **API oficial do WhatsApp** (principal). **Z-API** como opção alternativa configurável. Evolution não será usada. Só entra na Etapa 3. |
| E-mail | **Resend** com domínio autenticado (também usado como SMTP do Supabase Auth para o link mágico) |
| IA | Transcrição automática de cada aula (ex.: Whisper) + modelo de linguagem (API da Anthropic) para tutor, busca, resumos e análises |
| Estilo | Tailwind CSS |

**Padrões:** código em inglês, textos da interface em português do Brasil, componentes reutilizáveis, variáveis de ambiente para toda chave, nenhuma credencial no código.

---

## 3. Modelo de dados (base para o Supabase)

Use isto como ponto de partida e proponha ajustes na Etapa 1.

- **users** — id, nome, e-mail, whatsapp, avatar, role (`student` | `admin`), aceite de mensagens (LGPD), criado em.
- **courses** — id, slug, título, descrição, capa vertical (9:16), capa horizontal (16:9), banner (1920×800), `is_free`, trecho da prévia (`preview_lesson_id`, `preview_start_seconds`, `preview_end_seconds`), ordem na vitrine, publicado.
- **modules** — id, course_id, título, ordem.
- **lessons** — id, module_id, título, descrição, provedor do vídeo (`bunny` | `youtube`), id do vídeo, duração, imagem 16:9, ordem, transcrição (texto), resumo IA, checklist IA, publicado.
- **lesson_materials** — id, lesson_id, nome, arquivo (Storage), tipo.
- **cohorts** (turmas) — id, course_id, nome, descrição, `release_mode` (`all` | `weekly` | `fixed_date` | `days_after_join`), configuração da liberação (JSON: dia da semana e hora; ou dias após entrada), data de início, data de fim, prazo de acesso (vitalício ou meses), produto/ID do checkout, link do checkout, link da live, ativa.
- **cohort_lessons** — cohort_id, lesson_id, ordem, `release_at` (data fixa) ou `release_offset_days`. Define QUAIS aulas a turma tem e QUANDO liberam.
- **enrollments** (matrículas) — id, user_id, cohort_id, origem (`purchase` | `free` | `manual`), status (`active` | `refunded` | `expired`), ID da transação, expira em, criado em.
- **lesson_progress** — user_id, lesson_id, segundos assistidos, percentual, concluída em, último acesso.
- **notes** (caderno) — id, user_id, lesson_id, conteúdo (rich text), `timestamp_seconds`, criado/atualizado em.
- **comments** — id, lesson_id, cohort_id, user_id, conteúdo, parent_id (resposta), criado em; campos da IA: categoria (`question` | `complaint` | `praise` | `request` | `technical`), sentimento, urgente, resposta sugerida.
- **ai_conversations** / **ai_messages** — conversas do aluno com o Professor IA por aula (também alimentam o Radar).
- **messages_campaigns** — id, nome, canal (`email` | `whatsapp`), filtro de público (JSON), conteúdo, agendado para, enviado em, métricas.
- **automations** — gatilho (`inactive_3_days`, `lesson_released`, `course_completed`, `free_watched_not_bought`), canal, template, ativo.
- **webhook_events** — payload bruto, provedor, status, processado em (idempotência).
- **certificates** — user_id, course_id, código, emitido em.

### 3.1 Ajustes aprovados (01/10/2026)

- `users` vira **`profiles`**, ligada a `auth.users` do Supabase.
- **Liberação calculada na leitura**, por função no banco usada pela RLS (sem depender de cron). O cron só dispara avisos.
- `cohorts.access_starts_from`: prazo de acesso conta da compra ou do início da turma.
- Uma matrícula ativa por aluno por curso (trigger no banco).
- `lessons.is_free` (aula grátis avulsa) e campos do **botão de oferta** na aula (minuto, texto, link).
- **`lesson_unlocks`**: liberar uma aula para um aluno específico.
- **`cohort_products`**: liga turma ↔ produto de cada provedor (uma turma pode ser vendida em mais de uma plataforma).
- Progresso é **por aula**, não por turma (mudar de turma não perde progresso).
- Fuso `America/Sao_Paulo` em todas as regras de liberação.

**Regras de acesso (RLS):** aluno só lê as aulas das turmas em que está matriculado **e** que já foram liberadas; admin lê e escreve tudo; visitante só vê cursos `is_free` e a vitrine pública.

---

## 4. Fluxo de pagamento (webhook)

1. Aluno clica num curso travado (ou num botão de oferta) → vai para o checkout com nome e e-mail preenchidos (query string).
2. Paga → a plataforma envia **webhook** para `/api/webhooks/{provedor}`.
3. A API valida a assinatura, grava em `webhook_events` (idempotente), cria o usuário se não existir, cria a `enrollment` na **turma ligada àquele produto** e libera o acesso.
4. Envia e-mail e WhatsApp com o link de acesso (magic link).
5. Em **reembolso ou chargeback**, outro webhook marca a matrícula como `refunded` e o acesso some na hora.

---

## 5. Cursos e turmas (liberação programada)

O **curso** é a biblioteca com todas as aulas. A **turma** é a porta de entrada, com regras próprias. Um curso pode ter quantas turmas eu quiser (ex.: turma perpétua para anúncios + turma de mentoria).

Cada turma configura:
- **Quais aulas entram** (todas ou só algumas, ex.: 10 de 30).
- **Modo de liberação:** tudo liberado · recorrente (ex.: toda terça às 9h) · data fixa por aula · X dias após a entrada do aluno.
- **Produto e link de checkout próprios.**
- **Prazo de acesso** (vitalício ou expira em X meses).
- **Datas de início e fim**, **link da live**, comentários separados por turma.

O aluno vê a aula futura com cadeado e o aviso "Libera seg, 05/10 · 19h", com contagem regressiva, e recebe aviso quando libera.

Admin: duplicar turma com um clique, liberar uma aula para um aluno específico, mudar aluno de turma.

---

## 6. Experiência do aluno

### Vitrine (home) — estilo Netflix
- Banner grande no topo com o curso em andamento (imagem 1920×800), título, "Aula 3 de 5 · próxima live…", botões **Continuar** e **Ver turma**.
- Fileiras horizontais com rolagem lateral: **Continuar assistindo**, **Sua turma**, **Grátis**, **Recomendado para você**.
- **Cards de curso na vertical (9:16)**, grandes, com imagem. **Cards de aula na horizontal (16:9)**.
- Curso não comprado: cadeado discreto no canto. Ao clicar → checkout.
- **Prévia estilo trailer:** ao passar o mouse num curso bloqueado, o card se expande e toca uma prévia sem som do trecho definido no admin (aula + minuto inicial e final), com os botões **Desbloquear** e **Ver detalhes**.
- Botão **"Pergunte à IA"** no topo (busca inteligente).

### Página da aula
- Player grande (Bunny/YouTube), barra de progresso, marcadores de capítulo.
- Título, botão "marcar como concluída", **Próxima aula**.
- **Resumo da aula** (IA) com 3 a 5 pontos e minutos clicáveis que levam o vídeo ao ponto.
- Botões discretos: **Comentários da turma** e **Materiais**.
- **Painel lateral com 3 abas:** **Aulas** (lista da turma com miniaturas, concluídas, atual, futuras com cadeado) · **Caderno** · **Professor IA**.
- **Botão de oferta dentro do vídeo:** aparece num minuto definido pelo admin (ex.: aos 15 min, "Conheça o curso X").

### Caderno de anotações
- Abre ao lado do vídeo (desktop) ou embaixo (celular); o aluno escolhe.
- Cada nota guarda o **minuto da aula**; clicar nela volta o vídeo ao ponto.
- **Salvamento automático** enquanto digita.
- Página **"Meu Caderno"** com todas as anotações de todos os cursos, organizadas e com busca.
- Botões **"Organizar com IA"** e **"O que eu perdi?"** (compara a nota com a transcrição e completa).
- **Exportar** as anotações de uma aula ou do curso em **PDF ou Word**. (Nunca o vídeo.)

### Cursos e aulas grátis
- Admin marca curso/aula como grátis e gera **link público**.
- Visitante faz **cadastro rápido** → vira lead. O admin escolhe, **por curso grátis**, a estratégia de entrada:
  - **Quais dados pedir:** só e-mail · só WhatsApp · nome + e-mail · nome + e-mail + WhatsApp (sempre com aceite de mensagens).
  - **Como entra:** **direto** (digitou, já assiste) ou **confirmando pelo link mágico** no e-mail.
  - Segurança do modo direto: se o e-mail/WhatsApp digitado já pertence a um aluno pagante ou admin, exige o link mágico (ninguém entra na conta de outro só digitando o e-mail dele).
- **Webhook de saída de lead:** a cada lead captado, a área envia um POST (assinado) para uma URL configurável no admin — ex.: o funil do FunilPro — com nome, e-mail, WhatsApp, curso e origem, para disparar automações.
- Dentro, assiste o grátis e vê **todo o portfólio travado**; pode comprar ali mesmo.

### Outros
- **Certificado** ao concluir o curso.
- Comentários por aula, separados por turma, com respostas.
- Responsivo: funciona bem no celular.

---

## 7. Inteligência artificial

Tudo usa a **transcrição** de cada aula, gerada automaticamente ao cadastrar o vídeo.

| Função | O que faz |
| --- | --- |
| **Professor IA** | Chat por aula; responde com base na transcrição daquela aula e cita o minuto. |
| **Busca inteligente** | "Como conecto o WhatsApp?" → leva à aula e ao minuto exato. |
| **Resumo e checklist** | Gerados automaticamente para cada aula. |
| **IA no caderno** | "Organizar minhas anotações" e "O que eu perdi?". |
| **Radar de Comentários** | Lê todos os comentários e as perguntas feitas ao Professor IA; classifica (dúvida, reclamação, elogio, pedido, problema técnico); detecta aulas confusas (muitas dúvidas no mesmo ponto); agrupa pedidos de conteúdo ("12 alunos pediram aula sobre X"); **alerta urgente no WhatsApp do admin** para reclamação forte ou menção a reembolso; separa elogios para virar depoimento (com autorização do aluno); sugere respostas; **relatório semanal** filtrável por curso e turma. |
| **Recomendação** | Sugere o próximo curso com base no que o aluno assistiu. |
| **IA nas mensagens** | Escreve a mensagem a partir de um pedido ("anuncie a mentoria para quem concluiu o minicurso"). |
| **Gerar capa com IA** | Opcional no admin: gera a capa do curso no tamanho certo e no padrão visual. (Também posso subir a capa manualmente.) |

---

## 8. Gestão e vendas (admin)

### Painel admin
- CRUD de cursos, módulos, aulas (colando o ID do vídeo), materiais, capas e banners.
- Criar e configurar turmas; ligar cada turma ao seu produto/checkout.
- Marcar cursos/aulas como grátis e gerar link público.
- Configurar trecho da prévia e botões de oferta por aula.

### Acompanhamento dos alunos
- Ficha: cursos, turma, progresso (%), última aula, onde parou, último acesso.
- Status: ativo · parado · concluiu.
- Filtros combinados: "comprou X e não comprou Y", "assistiu a aula 5", "só fez o grátis", "parado há N dias".

### Central de Mensagens (e-mail e WhatsApp)
- **Manuais:** escolher público pelos filtros, escrever (ou pedir à IA), agendar, ver aberturas, cliques e vendas.
- **Automáticas:** aluno 3 dias sem assistir → incentivo · aula nova liberada → aviso · concluiu o curso → parabéns + certificado + oferta do próximo · assistiu a aula grátis inteira e não comprou → oferta no dia seguinte.
- Uso principal: lançar novos cursos e a mentoria primeiro para quem já é aluno.

### Painel de desempenho
- Em qual aula os alunos desistem.
- Quais cursos e ofertas mais vendem dentro da área.
- Comparação entre turmas (mentoria × perpétua).

---

## 9. Identidade visual (aprovada)

Referência: os mockups que criei na ferramenta de design (versão **"grafite"**). Reproduza esse padrão.

- **Fundo:** grafite quase preto `#141416`. Cards e painéis em `#1A1A1D` / `#1E1E21`, bordas `#2C2C30`.
- **Texto:** branco `#F5F5F5`; secundário `#9C9CA3`; terciário `#C9C9CF`.
- **Cor de destaque única: vermelho `#D63A42`.** Usar em: botão principal, etiqueta da turma, item ativo do menu, barra de progresso, minutos clicáveis, ícone da IA, avatar. **Não espalhar.** Sem degradês, sem outras cores.
- **Fontes:** Space Grotesk (títulos) + Manrope (texto). Google Fonts.
- **Layout limpo:** pouco texto, cada card mostra só imagem + título (+ progresso ou cadeado). Sem descrições embaixo dos cards.
- **Cards:** curso na vertical 9:16 (≈250×444px no desktop); aula na horizontal 16:9 (≈400×225px). Cantos arredondados 12px.
- **Hover em curso bloqueado:** card expande, mostra prévia + "Desbloquear" + "Ver detalhes".
- Botão principal vermelho; secundário cinza `#2C2C30`; o botão "Próxima aula" na página da aula é branco.
- Tudo responsivo; no celular as fileiras rolam na horizontal com o dedo.

---

## 10. Etapas de desenvolvimento (proposta)

Construir **uma etapa por vez**. Cada etapa termina com: tudo funcionando, testado, revisado, sem erros no console, e um resumo do que foi feito para eu aprovar.

### Etapa 1 — Fundação e MVP da mentoria
Objetivo: a primeira turma da mentoria consegue rodar aqui. Entregue em três partes, cada uma aprovada antes da próxima:
- **1A — Fundação e admin de conteúdo:** setup, banco + RLS, login, admin de cursos/módulos/aulas/materiais/capas, admin de turmas (liberação, aulas da turma, produtos), duplicar turma, matrícula manual, mudar aluno de turma.
- **1B — Experiência do aluno:** vitrine, página da aula, progresso, cadeado com data, comentários por turma, materiais, liberar aula para um aluno.
- **1C — Vendas, grátis e acompanhamento** (entregue em 02/10/2026; webhooks validados com avisos simulados, aguardando a primeira venda real de cada plataforma): webhooks dos 5 provedores, e-mail de acesso, expiração, curso grátis + lead (estratégia de entrada configurável), webhook de saída de leads (FunilPro), ficha do aluno.

Lista completa:
- Setup do projeto (Next.js + Supabase + Tailwind), estrutura de pastas, variáveis de ambiente, `docs/PROJETO.md` salvo.
- Modelo de dados completo + migrações + RLS.
- Login por magic link; papéis aluno/admin.
- **Painel admin:** cursos, módulos, aulas, materiais, capas; **turmas** com todos os modos de liberação; ligação turma ↔ produto do checkout.
- Lógica de liberação programada (cron/edge function) e cadeado com data de liberação.
- **Vitrine** estilo Netflix (banner, fileiras, cards verticais e horizontais, cadeado, identidade visual da seção 9).
- **Página da aula** com player Bunny/YouTube, progresso salvo, lista de aulas, "concluir", "próxima aula", comentários por turma, materiais.
- **Webhook de pagamento** (liberar e remover acesso) + e-mail de acesso.
- **Cursos grátis** com link público e cadastro rápido (lead).
- Acompanhamento básico de alunos (ficha e progresso).

### Etapa 2 — Inteligência artificial e caderno
- Pipeline de transcrição automática ao cadastrar aula.
- Resumo e checklist automáticos.
- **Professor IA** por aula (com citação de minuto).
- **Busca inteligente** (aula + minuto).
- **Caderno** completo: notas com minuto, autosave, "Meu Caderno", IA ("Organizar", "O que eu perdi?"), exportação PDF/Word.
- **Prévia estilo trailer** no hover e **botão de oferta** dentro do vídeo.
- **Radar de Comentários** (classificação, alertas, relatório semanal).

### Etapa 3 — Relacionamento, vendas e retenção
- **Central de Mensagens:** envios manuais com filtros + IA para escrever; automações (inativo 3 dias, aula liberada, concluiu, grátis sem compra); WhatsApp pela API oficial (Z-API como alternativa); e-mail transacional; LGPD (aceite e descadastro).
- **Recomendação** de próximo curso.
- **Certificados.**
- **Painel de desempenho** (abandono por aula, vendas internas, comparação entre turmas).
- "Gerar capa com IA" no admin.
- Polimento geral, performance, acessibilidade, revisão de segurança.

---

## 11. Regras e cuidados (obrigatórios)

- **Vídeo nunca pode ser baixado.** Bunny com token + domínio restrito. YouTube (não listado) é provisório nas aulas pagas: quem tiver o link assiste fora da área.
- **Nunca hospedar vídeo no servidor.**
- **Reembolso/chargeback remove o acesso automaticamente.**
- **WhatsApp pela API oficial** (individual e em massa); Z-API só como alternativa opcional.
- **LGPD:** aceite de mensagens no cadastro; link de descadastro em todo e-mail.
- **Depoimentos** extraídos de comentários só com autorização do aluno.
- **Webhooks idempotentes** e com validação de assinatura.
- **Nenhuma chave no código.** Tudo em variáveis de ambiente.
- Print do player não é possível no caderno (limitação do navegador). Texto e minuto funcionam.
- Mobile-first em tudo que o aluno usa.

---

## 12. Pendências e decisões

Decididas em 01/10/2026:

- [x] Pagamento: **Kiwify, Hotmart, Yampi, Mercado Pago e Asaas**, todas via webhook. Cada turma pode ter um ou mais produtos ligados (de qualquer provedor).
- [x] E-mail transacional: **Resend**.
- [x] WhatsApp: **API oficial**, com **Z-API** como opção alternativa (Evolution descartada). Só na Etapa 3; nas Etapas 1 e 2, avisos saem por e-mail.
- [x] Lead do curso grátis: estratégia **configurável por curso** (dados pedidos + entrada direta ou por link mágico) e **webhook de saída** para o funil (Etapa 1C).
- [x] Prazo de acesso: **configurável por turma** — da compra de cada aluno (padrão) ou do início da turma.
- [x] Um aluno só pode ter **uma matrícula ativa por curso** (garantido no banco). Em cursos diferentes, quantas quiser.
- [x] Supabase de produção criado pelo Luís em conta própria; configuração por SQL Editor (`supabase/setup/`).
- [x] Nome provisório: **LC.Academy** (trocável por variável de ambiente).
- [x] Supabase: projeto próprio, região São Paulo (`sa-east-1`). Fuso fixo `America/Sao_Paulo`.
- [x] Ajustes no modelo de dados (seção 3.1) aprovados.
- [x] Etapa 1 dividida em 1A, 1B e 1C (seção 10).

Ainda abertas:

- [ ] Domínio definitivo.
- [ ] Conta no Bunny Stream (chave de Token Authentication). Até lá, testes com YouTube.
- [ ] Mockups "grafite" (imagens) para reproduzir fielmente.

---

**Agora, sem executar nada:** salve este arquivo em `docs/PROJETO.md`, leia tudo, e me responda com o resumo do seu entendimento, as etapas propostas (o que entra e o que fica de fora em cada uma) e suas dúvidas. Vamos começar pela Etapa 1 só depois que eu aprovar.

---

## 13. Notas de implementação (Etapa 1C)

- **Webhooks de entrada:** `/api/webhooks/{kiwify|hotmart|yampi|mercadopago|asaas}`. Chaves nas variáveis de ambiente (ver `/admin/integracoes`).
  - Kiwify: `?signature=` HMAC-SHA1 · Hotmart: `X-HOTMART-HOTTOK` · Yampi: `X-Yampi-Hmac-SHA256` (base64) · Mercado Pago: `x-signature` + busca do pagamento na API · Asaas: `asaas-access-token` + busca do cliente na API.
  - Mercado Pago e Asaas não têm "produto": o ID cadastrado na turma é a referência externa / ID do link de pagamento.
  - Pontos a confirmar na primeira venda real (registrados em `webhook_events`): fórmula exata da assinatura da Kiwify, status de reembolso da Yampi, ID de produto em links manuais do Mercado Pago.
- **E-mails:** enviados pelo próprio site via Resend (o plano grátis do Supabase não permite editar os modelos). Sem Resend, login e troca de senha usam o e-mail padrão do Supabase e o e-mail de boas-vindas da compra não sai.
- **Webhooks de saída** (FunilPro etc.): `lead.created`, `purchase.approved`, `purchase.refunded`, assinados com `X-LC-Signature: sha256=<HMAC do corpo>`.
- **Lead do curso grátis:** contas de aluno pagante ou admin nunca abrem só digitando o e-mail; pedem a senha.

## 14. Notas de implementação (Etapa 2A)

- **Etapa 2 dividida:** 2A (transcrição, resumo/checklist, Professor IA, busca), 2B (caderno, trailer, botão de oferta), 2C (Radar).
- **Transcrição:** o admin envia a legenda da aula (.vtt/.srt, baixada do YouTube Studio ou do Bunny) ou cola o texto (com minutos `[12:30]` ou corrido). Fica em trechos de ~30 s com busca em português. A transcrição automática a partir do áudio (Whisper) não foi feita: legendas já existem no YouTube/Bunny e evitam baixar o vídeo.
- **Modelo:** Claude Opus 5.5 (`claude-opus-5-5`) com `fallbacks: "default"` (se recusar por política, a API refaz no modelo indicado pela Anthropic). Resumo com esforço `medium`; Professor IA e busca com `low` (respostas rápidas).
- **Professor IA:** uma conversa por aluno por aula, com a transcrição em cache (perguntas seguintes ficam mais baratas). Cita minutos `[mm:ss]` clicáveis.
- **Limite:** 40 perguntas por aluno por dia (chat + busca), para controlar custo. Admin sem limite.
- **Chave:** `ANTHROPIC_API_KEY` na Vercel. Sem ela, as telas mostram "em breve" e a busca mostra só os trechos encontrados.

### Decisão de 03/10/2026: sem gasto com IA por padrão

- **Professor IA removido** (aba, chat e rota). Motivo: custo.
- **Resumo e checklist** passam a ser escritos pelo admin na tela da aula (sem custo). O botão "Gerar com IA" só aparece se um dia houver `ANTHROPIC_API_KEY`.
- **Busca** ("Buscar nas aulas") funciona de graça, direto nas legendas (busca do Postgres). A resposta escrita por IA só aparece se houver chave.
- Por consequência, ficam fora do escopo até nova decisão: "Organizar com IA" e "O que eu perdi?" no caderno, o Radar de Comentários com IA, a recomendação por IA, a IA nas mensagens e a capa gerada por IA. Versões sem IA serão propostas em cada etapa.

## 15. Notas de implementação (Etapa 2B)

- **Caderno:** aba "Caderno" ao lado da lista de aulas. "+ Nova nota em mm:ss" grava o minuto em que o vídeo está; o texto salva sozinho enquanto o aluno digita. Clicar no minuto leva o vídeo até ele. As notas são só do aluno (nem o admin lê).
- **Meu Caderno** (`/caderno`): todas as notas por curso e aula, com busca e exportação em PDF ou Word (tudo, por curso ou por aula). Clicar no minuto abre a aula naquele ponto.
- **Botão de oferta:** configurado por aula no admin (minuto, texto e link). Aparece sobre o vídeo a partir do minuto definido e pode ser fechado.
- **Prévia estilo trailer:** no admin do curso, escolha a aula de prévia e o trecho (início e fim). Na vitrine, ao parar o mouse sobre um curso bloqueado, o card abre e toca o trecho sem som, com "Desbloquear" (checkout da turma de venda) e "Ver detalhes". No celular, o toque leva direto ao checkout.
- **Sem IA:** "Organizar com IA" e "O que eu perdi?" ficaram fora (decisão de 03/10/2026).
- **Banco:** `supabase/setup/06-atualizacao-etapa-2b.sql` (tabela `notes`).

## 16. Notas de implementação (Etapa 2C — Radar sem IA)

- **Onde:** Admin → Radar. Filtros por período (7, 30 ou 90 dias) e por curso.
- **Classificação por palavras-chave** (sem custo): dúvida, reclamação, elogio, pedido e problema técnico. **Urgente** quando cita reembolso, estorno, cancelamento, Procon, Reclame Aqui etc. Não é perfeita; o admin sempre lê o comentário.
- **Fila de atendimento:** comentários de alunos ainda sem resposta do professor (urgentes e problemas técnicos primeiro). Dá para responder ali mesmo (a resposta aparece na aula, na mesma turma) ou marcar como resolvido.
- **Aulas com mais dúvidas**, **o que os alunos procuram** (buscas mais feitas e quais não encontram aula = conteúdo que falta), **palavras mais citadas**, **pedidos de conteúdo** e **elogios** (para depoimento, com autorização).
- **Alunos parados:** matrícula ativa sem entrar há 7, 15 ou 30+ dias, com botão "Chamar no WhatsApp" (abre o WhatsApp do admin com mensagem pronta; sem API, sem custo).
- **Fica para a Etapa 3:** alerta automático no WhatsApp do admin para urgentes e relatório semanal por e-mail (dependem do WhatsApp oficial e do Resend). Entregue na 3A.
- **Banco:** `supabase/setup/07-atualizacao-etapa-2c.sql` (coluna `comments.handled_at` e função `set_comment_handled`, só admin).

## 17. Notas de implementação (Etapa 3A — Central de Mensagens)

- **Etapa 3 dividida:** 3A (mensagens), 3B (certificados, recomendação, painel de desempenho), 3C (polimento e revisão de segurança).
- **Canais:** e-mail pelo Resend; WhatsApp pela **API oficial (Meta)** por padrão ou pela **Z-API** (`WHATSAPP_PROVIDER=zapi`). Sem as chaves, o canal aparece como "não configurado" e nada é enviado.
- **API oficial:** fora da janela de 24 h a Meta só entrega modelo aprovado. Usamos um modelo de Utilidade com corpo "Olá, {{1}}! {{2}}" (`WHATSAPP_TEMPLATE`), onde {{1}} é o primeiro nome e {{2}} o texto (quebras de linha viram " · "). A Meta cobra por conversa iniciada.
- **Z-API:** uma mensagem a cada 1,5 s para reduzir o risco de bloqueio do número.
- **Envio manual** (Admin → Mensagens → Nova): canal, tipo (aviso aos alunos ou promoção), público (matrícula ativa, leads grátis sem compra, parados há X dias, concluíram, todos) por curso e turma, contagem antes de enviar, teste para o próprio admin, variáveis {{nome}}, {{curso}}, {{link}}. A fila envia em segundo plano; se sobrar, "Continuar envio" ou o cron diário terminam.
- **Automações** (Admin → Mensagens → Automações, todas começam desligadas): aluno parado (X dias, uma vez por sumiço), aula liberada (aulas programadas), concluiu o curso (até 3 dias depois), grátis sem compra (X dias, só com aceite), alerta de comentário urgente (na hora, para o admin) e resumo semanal (segunda, para o admin). Rodam todo dia às 9h (Vercel Cron, `CRON_SECRET`); nenhuma mensagem automática repete (chave de deduplicação).
- **LGPD:** todo e-mail da Central tem link de descadastro (página `/descadastro/...` sem login e cabeçalho de um clique). Quem se descadastra não recebe mais nada da Central; e-mails de acesso e senha continuam. Promoções só para quem aceitou receber mensagens.
- **Sem IA:** "IA para escrever a mensagem" ficou fora (decisão de 03/10/2026).
- **Banco:** `supabase/setup/08-atualizacao-etapa-3a.sql`.

## 18. Notas de implementação (Etapa 3B)

- **Certificados:** ligados por curso no admin (seção "Conclusão"), com carga horária opcional (vazio = soma da duração das aulas, arredondada para cima). Ao concluir todas as aulas publicadas da turma, o aluno vê "Você concluiu este curso!" e baixa o PDF (A4 paisagem, fundo claro para imprimir). O certificado guarda o nome e o curso do dia da emissão e tem um código de 12 caracteres; qualquer pessoa confere em `/certificado/CÓDIGO`. Sem nome completo no perfil, o aluno é levado a "Minha conta" para preencher antes de emitir.
- **Minha conta** (`/conta`): nome, WhatsApp, preferências de mensagens (avisos e ofertas) e lista de certificados. Substitui o atalho direto para "senha" no menu.
- **Recomendação (sem IA):** o admin escolhe o "próximo curso recomendado" de cada curso. A fileira "Mais cursos para você" é ordenada por: próximo curso dos cursos do aluno (concluído pesa mais), depois os mais comprados por quem estuda os mesmos cursos ("quem fez X também fez Y"), depois a ordem da vitrine. A mensagem automática "Concluiu o curso" agora leva para a página do curso (certificado e próximo passo).
- **Desempenho** (Admin → Desempenho): vendas e leads grátis em 30 dias, conversão grátis → compra, reembolsos, vendas e leads por semana (8 semanas), abandono por aula por turma (com a maior queda destacada) e comparação entre turmas (alunos ativos, progresso médio, concluíram, parados 7+ dias).
- **Sem IA:** "Gerar capa com IA" segue fora (decisão de 03/10/2026).
- **Banco:** `supabase/setup/09-atualizacao-etapa-3b.sql`.
