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
| Hospedagem de vídeo | Fora do site. **Bunny Stream** para aulas pagas; **YouTube (não listado)** só para conteúdo grátis. Nunca hospedar vídeo no próprio servidor. |
| Download de vídeo | **Proibido.** Só as anotações do aluno podem ser exportadas. |
| Integração externa | Só com a plataforma de pagamento. Toda a inteligência fica dentro da área. |
| Turmas | Um curso pode ter várias turmas, cada uma com aulas e liberação próprias. |
| Cursos grátis | Existem, com link público, cadastro rápido e vitrine aberta. |
| Login | Link mágico por e-mail (sem senha). |

---

## 2. Stack técnico

| Parte | Tecnologia |
| --- | --- |
| Front-end e back-end | **Next.js** (App Router), TypeScript, publicado na **Vercel** |
| Banco de dados, auth e storage | **Supabase** (Postgres + Auth com magic link + Storage para capas, banners e materiais) |
| Vídeos pagos | **Bunny Stream** (player embedado, token de acesso com validade, restrito ao domínio) |
| Vídeos grátis | YouTube embed |
| Pagamento | Checkout externo (**plataforma a definir**: Kiwify, Hotmart ou Asaas) → webhook |
| WhatsApp automático individual | **Evolution API** |
| WhatsApp em massa | **API oficial do WhatsApp** (nunca disparar em massa pela Evolution) |
| E-mail | Serviço transacional a definir (ex.: Resend) com domínio autenticado |
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
- Visitante faz **cadastro rápido** (nome, e-mail, WhatsApp, aceite de mensagens) → vira lead.
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
Objetivo: a primeira turma da mentoria consegue rodar aqui.
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
- **Central de Mensagens:** envios manuais com filtros + IA para escrever; automações (inativo 3 dias, aula liberada, concluiu, grátis sem compra); integração Evolution (individual) e API oficial (massa); e-mail transacional; LGPD (aceite e descadastro).
- **Recomendação** de próximo curso.
- **Certificados.**
- **Painel de desempenho** (abandono por aula, vendas internas, comparação entre turmas).
- "Gerar capa com IA" no admin.
- Polimento geral, performance, acessibilidade, revisão de segurança.

---

## 11. Regras e cuidados (obrigatórios)

- **Vídeo nunca pode ser baixado.** Bunny com token + domínio restrito. YouTube só para grátis.
- **Nunca hospedar vídeo no servidor.**
- **Reembolso/chargeback remove o acesso automaticamente.**
- **WhatsApp em massa só pela API oficial.** Evolution apenas para mensagens individuais automáticas (risco de banimento).
- **LGPD:** aceite de mensagens no cadastro; link de descadastro em todo e-mail.
- **Depoimentos** extraídos de comentários só com autorização do aluno.
- **Webhooks idempotentes** e com validação de assinatura.
- **Nenhuma chave no código.** Tudo em variáveis de ambiente.
- Print do player não é possível no caderno (limitação do navegador). Texto e minuto funcionam.
- Mobile-first em tudo que o aluno usa.

---

## 12. Pendências (decisões minhas)

- [ ] Plataforma de pagamento (Kiwify, Hotmart ou Asaas) — define o formato do webhook.
- [ ] Nome da área de membros e domínio (nos mockups usei "LC.Academy" como exemplo).
- [ ] Serviço de e-mail transacional.
- [ ] Conta no Bunny Stream.
- [ ] Usar a API oficial do WhatsApp desde o início ou só na Etapa 3.

---

**Agora, sem executar nada:** salve este arquivo em `docs/PROJETO.md`, leia tudo, e me responda com o resumo do seu entendimento, as etapas propostas (o que entra e o que fica de fora em cada uma) e suas dúvidas. Vamos começar pela Etapa 1 só depois que eu aprovar.
