# Plano de implementação do redesenho: Manager ADV

27/11/2026. Ordem de trabalho para quando a Dra. autorizar o desenvolvimento. Nada deste plano foi executado.
Antes de cada fase, ler: `AGENTS.md`, `README.md` ("Regras que não podem ser quebradas"), `../DESIGN_PRINCIPLES.md`,
`CREATIVE_DIRECTION.md`, `DESIGN_SYSTEM.md`, `MOTION_GUIDELINES.md`, `FRONTEND_COMPONENTS.md` e
`FUNCTIONAL_REQUIREMENTS.md`.

## Regras de trabalho

- O repositório está ligado à Lovable: commits enviados aparecem no editor; nunca reescrever histórico (force push,
  rebase, amend de commit enviado). A publicação é feita pela Dra., no botão "Publicar" da Lovable.
- Outras sessões trabalham no mesmo checkout: cada commit leva só os arquivos da própria tarefa.
- Redesenho muda apresentação. Não muda regra de negócio, permissão, gate jurídico, contrato JSON, rotina de servidor,
  texto oficial da biblioteca de mensagens nem migração de banco. Se uma melhoria exigir isso, ela vai para
  "Reavaliar" e espera a Dra.
- Nenhuma funcionalidade é removida sem autorização (ver `FUNCTIONAL_REQUIREMENTS.md`).
- Uma fase por vez, cada uma publicável sozinha e testada antes da próxima.

## Ferramentas de verificação

| Verificação | Como |
|---|---|
| Testes | `bun x vitest run` (com o config temporário que faz inline do zod, ver memória do projeto) ou, com o Node que foi instalado, `npx vitest run` (não testado nesta etapa); conferir os snapshots das mensagens oficiais em `src/test/__snapshots__/` |
| Tipos | `bun x tsc --noEmit -p .` |
| Visual | Demonstração local (`tools/demo-navegador`, dados fictícios) em 1366×768 e 1440×900, comparando com `capturas/` da Etapa 01 |
| Movimento | Gravação normal e com movimento reduzido (`MOTION_GUIDELINES.md`) |
| Interface | `/web-design-guidelines` nos arquivos alterados; `/impeccable critique` e `/impeccable polish` por tela; `/humanizer` nos textos novos |
| Regressão funcional | Matriz da seção "Comparação funcional" de `FUNCTIONAL_REQUIREMENTS.md`, item por item |

## Andamento

| Data | O que foi feito |
|---|---|
| 27/11/2026 | Identidade visual do MANAGER ADV (logo, turquesa, tokens centralizados): ver `../IDENTIDADE_VISUAL.md` |
| 27/11/2026 | Fase 0, item 1 (demo com adaptadores em `tools/`). Fase 1, itens 3 a 8: confirmações próprias (`src/components/confirmar.tsx`) no lugar dos 9 `window.confirm`; 404, tela de erro e rótulos de acessibilidade em português; "Anne" e "Painel" na interface; datas de evento sem deslocamento de fuso e só eventos futuros no Painel (`diaEvento`/`rotuloEvento` em `src/lib/assessor.ts`, com testes); diálogo de automações sem rolagem horizontal; filtros do Atendimento sem cobrir o menu; `noindex` e `robots.txt`; ícones próprios e Contencioso só para sênior/admin no menu |
| 27/11/2026 | Fase 2 (base): transição entre telas só quando o caminho muda (View Transitions do TanStack Router, sem dependência nova), barra fina de carregamento, tooltips em grupo (300/400 ms), botões com resposta ao clique, check animado, skeletons (`src/components/skeletons.tsx`), tokens de movimento e caminho de movimento reduzido em `src/styles.css`. Decisão: **sem a biblioteca `motion`**, só CSS + Radix |
| 27/11/2026 | Fase 3 (Atendimento): centro de avisos "Precisa de atenção · N" (`centro-avisos.tsx`), botão "Trato feito", Esc que não fecha a conversa com menu/janela aberta ou campo preenchido, painel do cliente recolhível (≥1024px) e Sheet que respeita a escolha (<1024px), skeleton da lista, entrada suave só para mensagens novas |
| 27/11/2026 | Fase 4 (fluxo jurídico): fio das 10 etapas (`fio-etapas.tsx`) na barra fixa do caso em Produção, Auditoria, Protocolo e Andamentos; Configurações sem seletor de caso; Auditoria com "x de 16 itens conferidos" e "Só pendentes"; aviso de saída sem salvar em Produção; avisos de quando a simulação roda no Protocolo; vazio do pacote final; "Prazos em aberto" neutro quando zero; seletor de caso volta a obedecer quando a URL traz `?caseId` |
| 27/11/2026 | Fase 5: Painel com "O que fazer hoje" em primeiro, zeros neutros e barras horizontais legíveis; Contencioso com busca com atraso, indicador de atualização e correção das aspas em buscas só com números; Integrações com título no topo e "Verificar acesso"; Clientes com lista própria para perfis não sênior; skeletons em Painel e Aprovações |
| Não feito (motivo) | Treinamento mantém o seletor de caso ("Testar resposta" usa o caso no servidor). Badge de Aprovações: o painel não traz a situação da minuta (exigiria mudar função de servidor). Protocolo: botões "Simular" continuam habilitados (a tela não sabe o canal sem nova consulta) — ganharam o aviso de quando funcionam. Aviso de "não salvo" não cobre troca de caso no seletor nem Caso→Quadro. Configurações com navegação lateral absorvendo os modais (Fase 5.4) e "Revisões" (decisão da Dra.) ficam para uma próxima rodada |
| Adiado | Fase 1, item 1 (quebrar o JSX de linha única): reformatar `atendimento.tsx` e outras telas inteiras conflita com o trabalho das outras sessões que editam esses arquivos. Fazer tela por tela, junto da fase que redesenhar cada uma, avisando antes |
| Mantido | Fase 1, item 2: o amarelo `#FFE600` de alerta foi preservado por decisão da Dra. na identidade visual |

## Fase 0 · Preparação (sem mudança visível)

1. Incorporar à `tools/demo-navegador` os adaptadores que hoje vivem fora do versionamento
   (`node_modules/.demo-vite.config.ts` e `node_modules/.demo-stubs/`): aliases de `@lovable.dev/mcp-js` e `node:crypto`
   e os métodos `not/lt/gt/or` no Supabase falso. Assim qualquer sessão pré-visualiza o redesenho.
2. Atualizar as capturas "antes" das telas que mudaram desde a Etapa 01.
3. Levar à Dra. as decisões pendentes (seção final) e registrar as respostas aqui.

Pronto quando: a demo abre em todas as telas com o código atual, sem erros no console.

## Fase 1 · Fundação

1. Quebrar em componentes legíveis as telas escritas em uma linha (`production.tsx:35`, `atendimento.tsx:111,171`,
   `audit.tsx:14`, `movements.tsx:14`, `protocol.tsx`, `settings.tsx`, `training.tsx`, `clients.tsx`,
   `connection-status.tsx`). Refatoração mecânica: mesmo comportamento, mesmos testes passando.
2. Tokens novos em `src/styles.css` (`DESIGN_SYSTEM.md` §1–5): semânticas no lugar de `--pending #FFE600`, `--brand-strong`,
   `--surface-2`, `--input` com 3:1, raios, sombras, tokens de movimento. Mover as cores fixas espalhadas para tokens.
3. Trocar os ~10 `window.confirm` por AlertDialog com o texto da consequência.
4. Traduzir 404, tela de erro e rótulos de acessibilidade em inglês ("Close", "Sidebar", "Toggle Sidebar").
5. Nomes: "Anne" em toda a interface; "Painel" no menu e no título.
6. Corrigir: data de evento deslocada e eventos passados no Painel (`src/lib/assessor.ts:8`,
   `src/components/office/assessor.tsx`); rolagem horizontal do diálogo de automações; popover de filtros invadindo o
   menu.
7. `noindex` no `__root.tsx` e `Disallow: /` no `public/robots.txt`.
8. Ícones distintos no menu; itens do Contencioso só para sênior/admin (o servidor continua barrando).

Pronto quando: nenhuma tela mudou de comportamento; testes e tipos passam; contraste das semânticas confere.

## Fase 2 · Sistema visual e movimento base

1. Componentes-base de `DESIGN_SYSTEM.md` §8: botão, pílula de status, segmentado (Radix ToggleGroup), campo com
   rótulo/ajuda/erro, tabela, estado vazio, skeleton.
2. View Transitions do TanStack Router (`defaultViewTransition`) e barra de progresso nas rotas com loader.
3. `TooltipProvider` com `delayDuration`/`skipDelayDuration`.
4. Indicador do menu e sublinhado de aba deslizando; check desenhado no checklist.
5. Caminho de `prefers-reduced-motion` para tudo acima.
6. Decidir (com a Dra.) se `motion` entra como dependência; medir o tamanho no build antes.

Pronto quando: todas as telas usam os mesmos componentes-base; movimento reduzido verificado.

## Fase 3 · Atendimento

1. Centro de avisos recolhível no lugar das faixas empilhadas; "Próximo passo" como ação principal.
2. Cabeçalho da conversa: modo da Anne em segmentado (mantendo a confirmação ao voltar para Automático),
   "Registrar trato feito" como botão primário normal, contagem de documentos.
3. Compositor: rótulos no hover/foco, tooltips em grupo, organização das ações rápidas (referência Prompt Bar).
4. Marca de status de envio (enviando → enviado com recibo / simulado / falhou).
5. Painel do cliente recolhível; Esc limpa busca e fecha popover antes de fechar a conversa.
6. Bolhas e fundo conforme a decisão da Dra. (marca ou WhatsApp); substituir o papel de parede atual.
7. Animações: conversa que sobe (FLIP só da linha), bolha enviada, contador da fila.

Pronto quando: todas as ações do Atendimento listadas em `FUNCTIONAL_REQUIREMENTS.md` continuam acessíveis; nenhum
envio, reserva ou cancelamento mudou de regra; testes do Atendimento passam.

## Fase 4 · Fluxo jurídico

1. Cabeçalho do caso compartilhado (Produção, Auditoria, Protocolo, Andamentos) com busca de caso e o fio das 10
   etapas; fixo ao rolar.
2. Produção: barra de ações única, legenda da classificação A–F, aviso de alterações não salvas.
3. Auditoria: checklist com progresso "x de 16", itens recolhíveis, filtro "só pendentes".
4. Protocolo: etapas verticais; bloqueio explicado; botões "Simular…" desabilitados com motivo quando o canal real
   está ativo.
5. Aprovações → "Revisões" (ou aprovação da minuta ali, conforme decisão da Dra.), com badge no menu.
6. O momento autoral: o fio avança após confirmação do servidor.

## Fase 5 · Painel, Clientes, Contencioso, Configurações

1. Painel em três faixas (Hoje → Prazos e eventos → Carteira); gráficos com cores da marca e rótulos legíveis;
   funil clicável.
2. Clientes: lista própria para perfis não sênior; ficha com cabeçalho do cliente.
3. Contencioso: busca com atraso (debounce) em vez de navegar a cada tecla; diferenciar registro manual × ProJuris.
4. Configurações com navegação lateral, absorvendo os modais "Automações do atendimento" e "Canal e Agente" e a tela
   Integrações (status coerente por serviço); endpoints n8n em "Avançado".
5. Treinamento da Anne sem seletor de caso.
6. Login com o monograma e a entrada única do painel petróleo; 404 com a identidade.

## Fase 6 · Revisão e entrega

1. Comparação funcional completa (matriz de `FUNCTIONAL_REQUIREMENTS.md`) entre o sistema publicado antes e o novo:
   cada item marcado "igual", "melhorado" ou "regressão". Nenhuma regressão é aceita.
2. Acessibilidade: teclado em todas as telas, contraste, leitores de tela (nomes em português), movimento reduzido.
3. Desempenho: medir TTFB/DCL do login e tempo de carga do Atendimento antes e depois; tamanho do bundle.
4. Textos revisados com a Humanizer; `/impeccable polish` por tela.
5. Relatório em português para a Dra. com o que mudou, o que ficou igual e o que depende dela; publicação pela Dra.

## Decisões pendentes da Dra.

| # | Decisão | Onde afeta |
|---|---|---|
| 1 | "Aprovações": só renomear para "Revisões" ou passar a aprovar a minuta ali | Fase 4 |
| 2 | ~~Bolhas da conversa na cor da marca ou manter o verde do WhatsApp~~ Resolvido em 27/11/2026: bolhas e botão de envio no turquesa do MANAGER ADV | — |
| 3 | Adotar a biblioteca `motion` (lista animada, status) ou só CSS | Fase 2 |
| 4 | ~~Existe logotipo oficial?~~ Resolvido em 27/11/2026: logo oficial recebida e aplicada (ver `../IDENTIDADE_VISUAL.md`) | — |
| 5 | Substituir o papel de parede atual da conversa | Fase 3 |
| 6 | Manter ou retirar o cadastro aberto no login e o botão "Continue with Lovable" | Fase 5 (Reavaliar) |
| 7 | Autorizar o executável da Impeccable (captura de tela e de movimento, detector) | Verificação |
