# Plano do redesenho completo do front-end — MANAGER ADV

Pedido da Dra. em 27/11/2026: transformar o front-end inteiro (proporções, hierarquia, densidade, Atendimento,
todas as páginas) **sem perder nenhuma página, funcionalidade, informação ou ação**, sem mexer em regras de negócio,
integrações, permissões, banco ou agentes de IA, e sem publicar em produção.

Documentos desta rodada: `FRONTEND_AUDIT.md` (problemas e medidas), `FUNCTIONAL_INVENTORY.md` (matriz de
preservação), `DESIGN_SYSTEM.md` (o que foi implementado), `REDESIGN_QA.md` (testes e comparação), `SKILLS_SETUP.md`,
`AI_HANDOFF.md`. Regras de marca em `IDENTIDADE_VISUAL.md`. Pesquisa anterior em `research/`.

## Metas medidas (1366 × 768, 100% de zoom)

| Item | Antes | Meta |
|---|---|---|
| Cabeçalho global | 64px | 56px |
| Menu lateral aberto / recolhido | 255px / 48px | 232px / 56px |
| Título de página | 38px | 22–24px |
| Números de destaque | 30px | 22–24px |
| Área das mensagens no Atendimento | **189px de altura**, 482px de largura | ≥ 60% da altura útil; conversa como maior área |
| Cabeçalho da conversa | 93px (quebra em 2 linhas) | uma linha, ≤ 56px |
| Bloco de avisos aberto | 263px | resumo de uma linha; lista sob demanda; crítico nunca escondido |
| Item da lista de conversas | 88px | ~64px |
| Amarelo de alerta | `#FFE600` em blocos | âmbar suave com indicador e texto escuro |

## Decisões

- Alerta deixa de ser amarelo saturado (pedido explícito desta rodada): família âmbar com fundo suave, borda discreta
  e texto escuro; badges pequenos. Sucesso, erro e informação ganham as mesmas variações suaves.
- Sem dependências novas: CSS, Tailwind, Radix e o que já existe. Painéis redimensionáveis com alça própria.
- No Atendimento, abaixo de 1536px de largura o menu global abre recolhido (só ícones, com tooltip); a pessoa pode
  abrir quando quiser. Isso devolve ~176px para a conversa sem esconder nenhuma página.
- Títulos de página continuam em EB Garamond (identidade), em 24px; o resto em Inter.
- Mobile: não é o foco, mas nada pode quebrar; a lista e a conversa continuam navegáveis.

## Ordem de execução

1. Auditoria e inventário (`FRONTEND_AUDIT.md`, `FUNCTIONAL_INVENTORY.md`).
2. Design system: tokens de tamanho, tipografia, superfícies, semânticas suaves, raios, sombras, z-index; componentes
   base (botão, campo, select, tabela, badge, card, diálogo, tooltip, alerta).
3. Estrutura global: cabeçalho, menu lateral, contêineres de página, cabeçalho de página.
4. Atendimento (subagente dedicado): lista, cabeçalho da conversa, avisos, mensagens, compositor, painel do cliente,
   painéis redimensionáveis.
5. Demais páginas (subagentes por grupo de arquivos): Painel, Aprovações, Clientes, Contencioso / Produção,
   Auditoria, Protocolo, Andamentos, Treinamento, Configurações, Integrações, login.
6. Revisão visual em 1280×720, 1366×768, 1440×900, 1920×1080 e uma largura de tablet e de celular.
7. Regressão: inventário item por item, testes, tipos, lint, build; registro em `REDESIGN_QA.md`.
8. Documentação e relatório. Commit só com autorização.

## Divisão de arquivos entre subagentes (para não haver conflito)

| Frente | Arquivos |
|---|---|
| Líder (global) | `src/styles.css`, `src/components/ui/*`, `src/routes/_authenticated/route.tsx`, `src/components/app-sidebar.tsx`, `src/components/quick-search.tsx`, `src/routes/__root.tsx`, `src/routes/auth.tsx`, `src/components/office/shared.tsx` (PageHeader/OfficePage) |
| Atendimento | `src/routes/_authenticated/atendimento.tsx`, `chat-messages.tsx`, `attendance-*.tsx`, `centro-avisos.tsx`, `anne-secretaria*.tsx`, `encaminhamento-advogado.tsx`, `process-reviews.tsx`, `monitor-automacoes.tsx`, `quick-replies.tsx`, `agenda-rapida.tsx`, `canal-agente.tsx`, `automations.tsx`, `return-tasks.tsx`, `checklist-correction.tsx`, `analise-documento.tsx`, `appointment-controls.tsx`, `biblioteca-mensagens.tsx`, `instrucoes-operacionais.tsx` (só visual) |
| Páginas de gestão | `dashboard.tsx`, `assessor.tsx`, `approvals.tsx`, `clients.tsx`, `projuris-*.tsx`, `contencioso.tsx`, `connection-status.tsx`, `integracoes.tsx`, `ana-saude.tsx`, `migracao-agenda.tsx`, `settings.tsx`, `n8n-settings.tsx`, `integrations.tsx`, `audit.tsx`, `production.tsx`, `protocol.tsx`, `movements.tsx`, `movement-notice.tsx`, `training.tsx`, `fio-etapas.tsx`, `pipeline-sync.tsx`, `petition-preview.tsx` |

## Estado

Atualizar esta seção a cada etapa concluída.

- [x] 1 Auditoria e inventário
- [x] 2 Design system (`DESIGN_SYSTEM.md`)
- [x] 3 Estrutura global (cabeçalho 56px, menu 232/56px, `PageHeader`, contêiner, busca rápida, login)
- [x] 4 Atendimento
- [x] 5 Demais páginas
- [x] 6 Revisão visual (`REDESIGN_QA.md`, capturas em `research/capturas/depois-redesign-1366/`)
- [x] 7 Regressão (matriz fechada sem ❌; tsc, 1403 testes, lint sem apontamento novo; build bloqueado pelo ambiente)
- [x] 8 Documentação (`DESIGN_SYSTEM.md`, `REDESIGN_QA.md`, `AI_HANDOFF.md`, `SKILLS_SETUP.md`, `CLAUDE.md`)

Commit e publicação aguardam a autorização da Dra.
