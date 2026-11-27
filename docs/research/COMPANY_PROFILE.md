# Perfil da empresa — CS Lawyers | Advocacia

> Etapa 01 da pesquisa (27/11/2026). Escopo definido pela Dra.: **não** é um site institucional novo; é a melhoria visual,
> de intuitividade e de animação do sistema interno **Manager ADV**, publicado em
> <https://atendimento-legal-desk.lovable.app>. Este perfil reúne o que o sistema e o código revelam sobre o escritório,
> para que o redesenho represente a marca sem inventar nada.
>
> Legenda: **[C]** fato confirmado (com fonte) · **[I]** inferência · **[?]** não verificado / pendente.

## 1. Identificação

| Item | Valor | Fonte |
|---|---|---|
| Nome de marca | **CS Lawyers \| Advocacia** (assinaturas também usam "Equipe CS Advocacia" e "Equipe CS Lawyers ⚖️") **[C]** | tela de login publicada; `src/routes/auth.tsx:88`; `src/lib/atendimento/ana-prompt.txt:18,172` |
| Titular / advogada responsável | **Dra. Carolina Santos — OAB/SP 251.781** **[C]** | `src/lib/legal/prompts/civil.txt:625,632` |
| Presença declarada | **Brasil • Dubai • Portugal** **[C]** | login publicado; cabeçalho do sistema; papel timbrado (`src/lib/legal/petition-docx.ts:17`) |
| Site institucional | `www.carolinasantos.com.br` **[C]** (citado nos textos; **não visitado** nesta etapa) | `ana-prompt.txt:52,72`; rodapé do DOCX `petition-docx.ts:18` |
| E-mail de contato publicado nas peças | contato@carolinasantos.com.br **[C]** | `civil.txt:633`; `petition-docx.ts:18` |
| Telefone publicado nas peças | (11) 91858-2706 **[C]** | `civil.txt:634`; `petition-docx.ts:18` |
| Instagram | <https://www.instagram.com/carolinasantoslawyer> **[C]** (modelo oficial T10.1; não visitado) | `src/lib/atendimento/biblioteca/mensagens-oficiais.ts:153` |
| LinkedIn (da Dra.) | <https://www.linkedin.com/in/carolina-santos-654918254/> **[C]** (modelo T10.2; não visitado) | `mensagens-oficiais.ts:160` |
| Endereço físico | **[?]** Não aparece no sistema nem no papel timbrado. O atendimento inicial é online. | — |
| CNPJ / razão social | **[?]** Não encontrados. | — |

## 2. O produto analisado: Manager ADV

- **O que é [C]:** "Sistema interno de operação jurídica do escritório CS Lawyers | Advocacia" (meta description publicada).
  Slogan do login: "Do primeiro contato do cliente ao andamento do processo, com revisão da advogada em cada etapa."
  Rodapé do login: "Uso interno da equipe do escritório."
- **Quem usa [C]:** somente a equipe. Perfis de acesso (`src/routes/_authenticated/route.tsx:31-33`): Advogada Sênior,
  Advogado Júnior, Atendente/Assessora, Operações, Administrador. Contas novas entram como atendente.
- **Hospedagem [C]:** Lovable Cloud (Cloudflare Workers); código em GitHub sincronizado com a Lovable (`README.md`).
- **Assistente virtual [C]:** **Anne** (nos documentos antigos, "Ana"), assistente de atendimento pelo WhatsApp, que
  acolhe, agenda, remarca e cancela a consulta inicial e acompanha a coleta de documentos. Não é advogada e diz a
  verdade se perguntarem se é robô (`ana-prompt.txt:16-20`).

## 3. Serviços e áreas de atuação

| Item | Detalhe | Fonte |
|---|---|---|
| Áreas | **Direito Trabalhista** e **Direito Cível/Família** **[C]** (etiquetas internas: RT = Trabalhista, AC = Cível/Família) | `ana-prompt.txt:39,72,77` |
| Previdenciário | Há minuta-exemplo de ação contra o INSS na demonstração e um módulo de alimentos no prompt cível. **[I]** O escritório também peticiona em matérias conexas, mas a Anne é proibida de anunciar áreas além de Trabalhista e Cível/Família. | `tools/demo-navegador/seed.json`; `ana-prompt.txt:39` |
| Consulta inicial | **Online, gratuita, 30 minutos, com Google Meet**, com a Dra. Carolina **[C]** | `ana-prompt.txt:74`; `README.md:45` |
| Agenda da consulta | Novos clientes: seg–qui, 9h–17h30. Clientes da casa: sexta, 13h30–17h30. Último início 17h. Nunca fim de semana/feriado nacional **[C]** | `ana-prompt.txt:75`; `README.md:56-58` |
| Expediente da equipe | Segunda a sexta, 8h–18h (Brasília); a Anne atende 24h **[C]** | `ana-prompt.txt:73` |
| Honorários | Explicados só pela Dra. na consulta; modelo de orçamento usa o mínimo da Tabela OAB/SP, 10% à vista no PIX, até 10x no cartão, validade 5 dias **[C]** | `ana-prompt.txt:76,173` |
| Contrato | Assinatura pelo GOV Assinaturas ou de próprio punho **[C]** | `ana-prompt.txt:178` |
| Funil internacional pago | Existe um funil de consulta paga para atendimento internacional (detalhe de regras em código) **[C]** | `src/lib/atendimento/funil-internacional.ts` |

## 4. Público-alvo e perfil dos clientes

- **[C]** Pessoas físicas com demandas trabalhistas (demissão sem rescisão, CTPS, FGTS, TRCT) e cíveis/família
  (alimentos, violência doméstica com protocolo de acolhimento), atendidas pelo WhatsApp.
- **[C]** Linguagem exigida: "sem juridiquês e sem gírias", calorosa, objetiva (`ana-prompt.txt:61-68`).
- **[I]** Público majoritariamente leigo, mobile-first do lado do cliente (WhatsApp), mas **o sistema é usado pela equipe
  em computador** — a Dra. confirmou que **não há necessidade de versão mobile** do sistema.
- **[I]** Brasileiros no exterior (Dubai, Portugal) — presença internacional declarada e funil internacional pago.

## 5. Posicionamento e diferenciais (como o próprio sistema expressa)

- **[C]** Revisão humana obrigatória em cada etapa jurídica ("com revisão da advogada em cada etapa"); aprovação
  validada no servidor; originais nunca alterados (`README.md`, regras "que não podem ser quebradas").
- **[C]** Ética OAB explícita: sem promessa de resultado, sem captação insistente, sem comparação com outros
  escritórios, sem desconto anunciado (`ana-prompt.txt:134`).
- **[C]** Atendimento 24h pela Anne com consulta online gratuita e agendamento real (nunca inventa horário).
- **[C]** Padrão visual próprio nas peças ("Visual Law · CS Lawyers"): papel timbrado com aqua da marca, Garamond.
- **[I]** Posicionamento: escritório boutique, liderado pela titular, com operação digital e alcance internacional;
  tom acolhedor e sério.

## 6. Equipe e lideranças

- **[C]** Dra. Carolina Santos — advogada titular, perfil "Advogada Sênior".
- **[?]** Demais integrantes reais não foram verificados (a área autenticada real não foi acessada). O nome
  "Dr. Rafael Costa" que aparece nas capturas é **fictício**, da demonstração (`tools/demo-navegador/supabase-fake.ts:23`).

## 7. Parceiros, integrações e ferramentas do escritório

**[C]** (`README.md`, tela Integrações): ProJuris (agenda oficial e base de clientes/processos), Google Agenda + Meet,
Google Drive (pastas "1- Start", "2- Revisão", "3- Upload", "4- Andamento processual"), UltraMsg (WhatsApp),
Anthropic Claude (Anne), Lovable AI Gateway (análise jurídica), ZapSign e Mercado Pago (preparados, sem credencial),
JusBrasil, Plaud e tribunais (não implementados).

## 8. Certificações, prêmios, depoimentos, cases

**[?]** Nenhum encontrado no sistema. Por ser ferramenta interna, não há depoimentos nem cases publicados; não devem
ser criados no redesenho.

## 9. Informações pendentes

1. Endereço físico, CNPJ e razão social (se tiverem de aparecer em algum lugar do sistema).
2. Logotipo oficial em arquivo vetorial (o sistema usa só tipografia; o favicon publicado é o padrão da Lovable).
3. Nomes e cargos reais da equipe (para avatares/perfis).
4. Confirmação de que `carolinasantos.com.br`, Instagram e LinkedIn continuam ativos e podem ser referenciados.
