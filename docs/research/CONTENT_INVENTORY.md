# Inventário de conteúdo e funcionalidades — Manager ADV

> Levantado em 27/11/2026 navegando (1) o site publicado <https://atendimento-legal-desk.lovable.app> (só a parte pública,
> sem login) e (2) a **demonstração local** do mesmo código (`tools/demo-navegador`, dados fictícios, nada sai do
> computador), em desktop 1440×900. Cruzado com leitura do código (`src/routes`, `src/components/office`).
> Capturas em [`capturas/`](capturas/). **Escopo: só desktop** (decisão da Dra.: não há versão mobile).
>
> Classificação de cada item para o redesenho: **Preservar** · **Reorganizar** · **Aprimorar** · **Substituir**.

## 0. Limites desta coleta

- A área autenticada **real** não foi acessada (sem login; regra: não entrar com senha nem criar conta). As telas
  internas foram vistas na demonstração, que roda o **mesmo código de `src/`** com banco e IA simulados.
- A demonstração estava desatualizada em relação ao código atual; para abrir, usei adaptadores temporários fora do
  versionamento (`node_modules/.demo-vite.config.ts`, `node_modules/.demo-stubs/`). Nada em `src/` ou `tools/` mudou.
- Por isso, telas que dependem de dados reais aparecem vazias (Clientes/ProJuris, Contencioso, Monitoramento) e o
  conteúdo de algumas foi completado pelo código. O que veio só do código está marcado **(código)**.
- A ficha de processo `/contencioso/processos/$codigo` não foi aberta (sem dados na demo); descrita pelo código.

## 1. Mapa de rotas

| URL | Acesso | Título (H1) | Aba do navegador | Capturas |
|---|---|---|---|---|
| `/auth` | público | Entrar no Manager ADV / Criar conta da equipe | Entrar — Manager ADV | 01 |
| `/` | logado | Painel de casos (menu: "Assessor") | Painel de casos — Manager ADV | 02–04 |
| `/atendimento` (`?conversa=`) | logado | Atendimento | Atendimento — Manager ADV | 05–19 |
| `/producao` (`?caseId=`) | logado | Produção | — | 20–23 |
| `/aprovacoes` | logado | Aprovações | Aprovações de minutas e notícias processuais | 24–25 |
| `/auditoria` | logado | Auditoria | — | 26 |
| `/protocolo` | logado | Protocolo | — | 27 |
| `/andamentos` | logado | Andamentos | — | 28 |
| `/clientes` (`?clientId=`) | logado (carteira só sênior/admin) | Clientes | — | 29–30 |
| `/contencioso/processos` | sênior/admin (menu aparece para todos) | Processos | — | 31 |
| `/contencioso/processos/$codigo` | sênior/admin | nº do processo | — | (código) |
| `/contencioso/andamentos` | sênior/admin | Andamentos processuais | — | 32 |
| `/treinamento` | logado (instruções: sênior/admin) | Treinamento de IA | — | 33 |
| `/configuracoes` | logado | Configurações | — | 34 |
| `/integracoes` | logado (partes sênior/admin) | Integrações (3º bloco da página) | Integrações — Manager ADV | 35 |
| qualquer outra | público | 404 "Page not found" (inglês) | Manager ADV — CS Lawyers | 38 |
| `/.lovable/oauth/consent`, `/mcp`, `/.well-known/oauth-protected-resource`, `/api/public/*` | técnico | — (OAuth/MCP e webhooks Telegram/WhatsApp) | — | — |

Arquivos públicos: `/favicon.ico` (coração Lovable 256×256), `/robots.txt` (libera todos os robôs).

## 2. Estrutura global (todas as telas logadas)

**Cabeçalho fixo** (`src/routes/_authenticated/route.tsx:73-83`) — Preservar/Aprimorar
- Botão de recolher menu · lockup "CS LAWYERS | ADVOCACIA" + "BRASIL • DUBAI • PORTUGAL" · busca rápida "Buscar cliente,
  CPF, processo…" · nome e perfil (menu só lista perfis, sem ações) · "Sair". Borda inferior aqua de 2px.

**Menu lateral** (`src/components/app-sidebar.tsx`) — Reorganizar
| Grupo | Itens | Badge |
|---|---|---|
| — | Assessor | vermelho: prazos fatais ≤7 dias |
| Fluxo do caso (linha conectando as etapas) | Atendimento · Produção · Aprovações · Auditoria · Protocolo · Andamentos | amarelo: conversas aguardando; casos etapa 2–3; 4–5; 6–7; movimentações novas. Aprovações sem badge |
| Cadastros | Clientes | — |
| Contencioso | Processos · Andamentos processuais | — |
| Escritório | Treinamento de IA · Configurações · Integrações | — |
- Recolhível para ícones (Ctrl/Cmd+B); recolhido, perde rótulos e badges (captura 37); Protocolo/Processos e
  Andamentos/Andamentos processuais **repetem o mesmo ícone**.

**Busca rápida** (`src/components/quick-search.tsx`) — Aprimorar
- Diálogo "Busca rápida": nome, CPF, RG, celular, petição, protocolo, CNJ; até 30 resultados → `/clientes?clientId=`.
  Sem atalho de teclado próprio; não busca o diretório ProJuris (código).

**Seletor de caso comum** (`OfficePage`, `src/components/office/shared.tsx`) — Reorganizar
- "Buscar cliente" + select do caso + código AT-… no topo de Produção, Auditoria, Protocolo, Andamentos,
  **Treinamento e Configurações** (nestas duas não faz sentido e bloqueia a tela se não houver caso).

**Feedback** — Aprimorar
- Toasts no canto superior direito (`executar()`: "…", "…: concluído", "…: falhou" + "Tentar novamente").
- Notificações: "Nova mensagem de {nome}", "Retorno pendente", "Nova movimentação".

## 3. Telas

### 3.1 `/auth` — Login (público) · captura 01 — Aprimorar
- Painel petróleo à esquerda: lockup, cidades, régua aqua, "Manager ADV" (Garamond 44px), slogan, "Uso interno da equipe".
- Formulário: E-mail, Senha (mín. 6), "Entrar", "ou", "Continuar com Google", **"Continue with Lovable"** (inglês),
  "Não tem conta? Cadastre-se" → modo "Criar conta da equipe" (Nome, E-mail, Senha; entra como atendente).
- Selo flutuante "Edit with Lovable" no canto (site publicado).

### 3.2 `/` — Painel de casos ("Assessor") · capturas 02–04 — Reorganizar
1. Cabeçalho "Escritório inteiro · hh:mm:ss" + atualizar.
2. "Olá, {nome}." + data por extenso.
3. 6 indicadores: Prazos fatais (vermelho), Audiências e perícias, Protocolos pendentes, Auditorias pendentes,
   Atendimentos de hoje, Retornos de sexta.
4. "O que fazer hoje" (lista de tarefas com link).
5. Três colunas: Prazos fatais · Audiências e perícias · Retornos de sexta.
6. 3 indicadores: Casos acompanhados, Prazos vencidos / hoje, Checklists aprovadas.
7. Filtros: busca, status (10 etapas), responsáveis, prioridades.
8. 4 gráficos: barras por etapa, rosca "Checklist concluída", rosca "Prazos vencidos", barras "Pendências por categoria".
9. Tabela: Cliente/responsável · Status · Próximo prazo · Pendências (pílula amarela "▸ N pendência(s)") · ↗.
10. "Agenda de prazos" (12 primeiros).
- Prazos aparecem em 4 lugares (indicador, coluna, rosca, agenda).

### 3.3 `/atendimento` — Caixa de entrada estilo WhatsApp Web · capturas 05–19 — Preservar estrutura / Aprimorar muito
**Três colunas:** lista (288px) · conversa · painel de detalhes (340–360px).

*Lista:* faixa de alerta vermelha (automações paradas) · H1 + "Canal e Agente" (sênior/admin) · busca "Nome, telefone,
CPF ou mensagem (Ctrl+K)" · Filtros (Etapa, Etiqueta AC/RT, Responsável) · itens com avatar de iniciais coloridas,
nome, hora, prévia, ponto + etapa, etiqueta, não lidas. Rolagem infinita de 50.

*Cabeçalho da conversa:* avatar · nome · "Etapa X de 10 · {etapa}" (abre "Etapas do atendimento", 10 etapas:
Atendimento inicial, Contrato assinado, Coleta de documentos, Produção, Auditoria IA, Auditoria humana, Autuação,
Protocolo, Cadastro ProJuris, Andamentos) · modo da Anne (Automático/Híbrido/Humano/Bloqueado) · videochamada ·
"⋯" (Automações do Atendimento, Ver dados no ProJuris) · **TRATO FEITO** · "Próxima →".

*Faixas acima das mensagens (até ~9, código):* Próximo passo + botão · Status da Ana · Encaminhamento ao advogado ·
Avisos da equipe · Painel da secretaria digital (`<details>`) · Funil internacional (PIX Confirmado) · Aviso de
Produção · Vínculo pendente · Notícias processuais pendentes.

*Mensagens:* bolhas estilo WhatsApp (verde/branco, rabinho, tiques), papel de parede com ícones, separadores de dia,
áudio, imagem/documento com visualizador, estados de envio, arrastar-e-soltar arquivo.

*Compositor:* chips de mensagens prontas + "Todas as mensagens" · ícones: anexar, agenda rápida ("Escolher horários",
blocos de 30 min 08–18h), ações da etapa (paleta "Buscar ação…" com 11 ações), mensagens prontas (busca + categorias
Boas-vindas/Documentos/Agendamento/Processo/Geral + "Nova mensagem"), sugerir com IA · campo "Mensagem ou / para
atalhos" · enviar (verde #00A884).

*Painel de detalhes — abas:* **Cliente** (Resumo da IA, Etiqueta da ação, Carteira de agendamento, dados, contrato,
pasta do Drive, processos, automações programadas) · **Documentos** (X de Y recebidos, checklist, Análise de documentos
com IA) · **Consulta e histórico** (consulta, Meet, transcrição/sumarização desabilitadas, histórico) · **ProJuris**
(KPIs, processos, informações do caso, arquivos locais).

*Diálogos:* Automações do atendimento (8 interruptores + Secretaria digital com dezenas de campos + Biblioteca de 19
mensagens oficiais) · Canal e Agente (canal, WhatsApp, contatos, agente, ações real/simulado) · Ações da etapa ·
Editor de mensagem pronta · Enviar anexo · Apagar mensagem · Status do contrato.

### 3.4 `/producao` — Produção · capturas 20–23 — Reorganizar
- Abas **Caso** | **Quadro** (kanban: Coleta de documentos, Produção, Auditoria IA, Auditoria humana; cartões com
  barra amarela "Provas x/y").
- Caso: faixa das 10 etapas em texto miúdo (sincronizado / erro / lançar no ProJuris) · área (Previdenciário,
  Trabalhista, Civil/alimentos) · fase (A preparar, Em redação…) · "Salvar" · "Gerar minuta com IA".
- Sub-abas: **Provas e documentos** (Checklist de provas + "Aprovar checklist"; "1 Start — originais", "Adicionar
  documentos", "Pacote 3 Upload", classificação A–F por arquivo, "Copiar para 3 Upload") · **Fatos e fontes**
  (Descrição do caso; Fontes verificadas) · **Petição inicial** ("Minuta — revisão da patrona", DOCX, Aprovar minuta,
  Enviar à auditoria; Editar texto | Visual Law · CS Lawyers) · **Memorial de cálculos** (texto + PDF).

### 3.5 `/aprovacoes` — Aprovações · capturas 24–25 — Reorganizar (nome)
- Notícias processuais pendentes (sênior/admin; Revisar → Recusar / Corrigir / Aprovar e enviar).
- 3 indicadores: Minutas pendentes, Vencidas/hoje, Sem advogado definido · Pendências por advogado · filtros ·
  tabela (Cliente/origem, Advogado revisor, Status da minuta, Prazo) · 👁 abre diálogo com a minuta, advogado revisor,
  prazo, "Revisão jurídica", "Salvar responsável e prazo".
- **A minuta não é aprovada aqui** (é em Produção): a tela distribui revisão e prazo.

### 3.6 `/auditoria` — Auditoria · captura 26 — Aprimorar
- Selo "NÃO APTO / APTO / APTO COM RESSALVAS" · Salvar revisão · Auditoria IA · Validação humana.
- Abas: **Checklist individual** (16 itens × SIM/NÃO/N/A/PENDENTE × Constatação/Providência/Localização) ·
  **Relatório e fatos novos** · **Pendências (N)**.

### 3.7 `/protocolo` — Protocolo · captura 27 — Aprimorar
- Faixa "Avanço bloqueado — checklist e minuta aguardando aprovação jurídica".
- **Autuação preliminar** (Tribunal, Vara/comarca, Classe; Salvar dados; *Simular autuação*) ·
  **Registro do protocolo externo** (Número CNJ, Recibo, Data; *Confirmação da sênior*; *Simular vínculo*) ·
  Documentos do pacote final · Registro de operações.

### 3.8 `/andamentos` — Andamentos (registro manual) · captura 28 — Aprimorar
- 3 indicadores (Processos vinculados, Movimentações, Prazos em aberto — número vermelho mesmo quando 0).
- Movimentações e prazos (Todos / Com prazo / Concluídos; "Avisar o cliente" → diálogo com linguagem simples e IA).
- Registrar andamento (CNJ, data, movimentação, prazo, prazo fatal, tipo de evento nativo, data/hora do evento).

### 3.9 `/clientes` — Clientes · capturas 29–30 — Reorganizar
- "Atualizar" · "Cadastrar cliente" (diálogo: Nome*, CPF, RG, Celular*, E-mail, Endereço, Título do caso*, Nº da
  petição, Status nativo) · "Carteira ProJuris" + "Integração ProJuris".
- "Base própria CS.IA" (sincronização ProJuris, "pendente de Inngest") · busca "Nome, CPF/CNPJ, telefone, e-mail ou
  cidade…" · tabela ProJuris (50/página) com "Ver dados" (Cadastro, Telefones e endereços, Processos, Demais dados).
- Ficha de cliente local (código): dados, caso, abas Casos e processos / Documentos / Histórico.
- Para quem não é sênior/admin não há lista própria de clientes (código).

### 3.10 `/contencioso/*` — Processos e Andamentos processuais · capturas 31–32 — Aprimorar
- Botões "Importar / atualizar processos", "Sincronizar históricos" · pílulas Processos | Andamentos processuais
  (repetem o menu) · 4 indicadores · filtros (busca, cliente, tribunal, situação/processo, período, ordenação) ·
  tabela paginada (25) ou linha do tempo · rodapé técnico ("…erro 500…").
- Ficha do processo (código): dados, Linha do tempo, "Sincronizar processo".

### 3.11 `/treinamento` — Treinamento de IA · captura 33 — Reorganizar
- "Orientações pessoais · Modelo Lovable AI · N versões" · "Salvar versão".
- Abas **Orientações** (Instruções de atendimento; Não pode dizer; Avisos e instruções operacionais com prévia
  "Como a Anne entendeu", validade e ativação sênior/admin) · **Teste de respostas** · **Versões**.

### 3.12 `/configuracoes` — Configurações · captura 34 — Reorganizar
- Meu perfil (Nome, Cargo informativo, E-mail; "Permissões: advogada_senior, admin") · Modo das integrações ·
  Conexão n8n (tabela de 20 endpoints técnicos) · Log de auditoria · Integrações preparadas (Claude, ZapSign,
  Mercado Pago, UltraMsg) · Outros serviços (6 cartões "Não conectado · Demonstração") · Segurança documental.

### 3.13 `/integracoes` — Integrações · captura 35 — Reorganizar
- Monitoramento 24h da Anne (sênior/admin; 6 indicadores; "Verificar agora") · Migração da agenda ("Conferir
  Google e ProJuris", "Migrar consulta →") · **só então** H1 "Integrações" · cartões ProJuris, ZapSign, Mercado Pago,
  UltraMsg ("Conectar" = verificar; "Testar leitura"; "Importar conversas do WhatsApp"; "Documentação").

### 3.14 Erro e 404 (`src/routes/__root.tsx:18-76`) — Substituir
- Inglês: "Page not found / Go home", "This page didn't load / Try again".

## 4. Formulários e canais

| Formulário | Onde | Observação |
|---|---|---|
| Login / cadastro da equipe | `/auth` | Cadastro aberto ao público; nova conta = atendente |
| Cadastrar cliente e caso | `/clientes` | Select nativo de status |
| Registrar andamento | `/andamentos` | Select nativo de tipo |
| Autuação / protocolo externo | `/protocolo` | Botões "Simular…" |
| Meu perfil | `/configuracoes` | — |
| Instruções operacionais da Anne | `/treinamento` | Interpretação + confirmação |
| Editor de mensagem pronta | Atendimento | Campos, prévia |
| Canal e contatos liberados | Atendimento › Canal e Agente | Sênior/admin |
| Compositor de mensagens | Atendimento | Canal real é o WhatsApp (UltraMsg) |

Canal com o cliente: **WhatsApp** (UltraMsg). Telegram aparece em textos antigos como canal de teste (aposentado,
segundo `src/lib/atendimento/AGENTS.md`).

## 5. Integrações e funcionalidades

Reais: Supabase/Lovable Cloud (login, banco, arquivos) · Anthropic Claude (Anne) · Lovable AI Gateway (análise
jurídica, minutas, auditoria) · Google Agenda + Meet · Google Drive · ProJuris (agenda oficial, clientes, processos —
leitura) · UltraMsg/WhatsApp · rotina `monitorar-ana` a cada 5 min.
Preparadas/simuladas: ZapSign, Mercado Pago, n8n, JusBrasil, tribunais (autuação/protocolo), Plaud.

## 6. Links externos relevantes

| Link | Onde aparece |
|---|---|
| `www.carolinasantos.com.br` | saudação da Anne, assinaturas das mensagens oficiais, rodapé do DOCX |
| <https://www.instagram.com/carolinasantoslawyer> | mensagem oficial T10.1 |
| <https://www.linkedin.com/in/carolina-santos-654918254/> | mensagem oficial T10.2 |
| `https://lovable.dev/projects/…` | selo "Edit with Lovable" no site publicado |
| Google Meet / Calendar / Drive | links gerados por caso |
| Documentação de ZapSign, Mercado Pago, UltraMsg, ProJuris | botões "Documentação" em Integrações |

## 7. Jornadas principais da equipe

1. **Novo contato → consulta:** Atendimento › conversa (Anne acolhe e oferece 2 horários) › reserva com recibo ›
   lembrete 08h e confirmação › consulta no Meet.
2. **Trato feito → coleta:** TRATO FEITO › contrato (link ProJuris) › documentos base › checklist (aba Documentos) ›
   lembretes de faltantes.
3. **Produção → protocolo:** Produção (checklist aprovado › minuta com IA › aprovar minuta) › Aprovações (responsável
   e prazo) › Auditoria (16 itens + validação humana) › Protocolo (registro externo + confirmação da sênior).
4. **Acompanhamento:** Andamentos/Contencioso › aviso ao cliente (revisão humana) › notícias processuais (Aprovações).
5. **Gestão do dia:** Painel ("O que fazer hoje", prazos, retornos) e badges do menu.
6. **Administração:** Treinamento de IA, Canal e Agente, Automações, Integrações, Configurações.

**Observação de navegação:** a jornada 3 salta entre 4 telas com o mesmo seletor de caso no topo; o usuário precisa
lembrar em que tela cada ação vive (aprovar minuta = Produção, não Aprovações).

## 8. Conteúdo a preservar sem alteração de sentido

- Textos de segurança jurídica ("Nada é reservado por aqui", "não enviado ao cliente", "Confirmação não realiza
  protocolo no tribunal") — podem ser reescritos de forma mais curta, **nunca removidos**.
- Biblioteca de 19 mensagens oficiais (texto exato aprovado pela Dra.; snapshots em `src/test/__snapshots__/`).
- Regras de papel (quem aprova, quem confirma protocolo, quem configura).
- Fluxo de 10 etapas e a ordem do menu "Fluxo do caso".
