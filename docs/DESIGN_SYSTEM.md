# Design system do MANAGER ADV (implementado)

Versão do redesenho completo de 27/11/2026. Tudo o que está aqui existe no código: tokens em `src/styles.css`,
componentes base em `src/components/ui/`, estrutura em `src/routes/_authenticated/route.tsx`,
`src/components/app-sidebar.tsx` e `src/components/office/shared.tsx`. A pesquisa e as justificativas da Etapa 02
estão em `research/DESIGN_SYSTEM.md`; as regras de marca, em `IDENTIDADE_VISUAL.md` (que prevalece).

Regra geral: **nenhuma cor, tamanho ou sombra solta em componente**. Se faltar um valor, crie o token em
`src/styles.css`, registre no `@theme inline` e documente aqui.

## Princípios aplicados

- Ferramenta de trabalho, não site: densidade equilibrada, proporção calma, nada decorativo que roube atenção.
- Um nível de superfície por bloco. Nada de cartão dentro de cartão nem faixa colorida em todo título.
- Cor com função: turquesa para ação e foco; âmbar para atenção; vermelho para erro e prazo crítico; verde para
  concluído. Grandes áreas ficam em branco/grafite claro.
- Sem faixa lateral colorida em caixa arredondada (o "risco" de 3–4px na borda esquerda). Avisos usam fundo suave,
  borda inteira discreta e ícone.
- Tudo funciona a 100% de zoom em 1280 × 720 e acima, sem escala global.

## Cores

| Token (classe Tailwind) | Valor | Uso |
|---|---|---|
| `brand` | `#00C9CB` | Logo, realces sobre fundo escuro, gráficos. Nunca texto sobre branco (2,1:1) |
| `primary` / `ring` | `#017F80` (turquesa 700) | Botão principal, links, foco, indicador ativo (4,8:1) |
| `primary-hover` | `#066768` | Hover do botão principal |
| `turquoise-50…950` | escala | `secondary`/`accent` = 50, bolha enviada = 100 |
| `graphite-25…900` | escala | Neutros. Texto `graphite-900`, secundário `muted-foreground` = 600 (5,9:1) |
| `background` | `graphite-50` | Fundo das páginas |
| `card` / `popover` | branco | Superfícies |
| `surface-subtle` | `graphite-25` | Cabeçalho de tabela, hover de linha, campo de busca do cabeçalho |
| `border` | `graphite-200` | Bordas e divisórias |
| `border-strong` | `graphite-300` | Botão contornado |
| `input` | `#7D8989` | Borda de campo (3,6:1, para o campo ser identificável) |
| `overlay` | grafite 45% | Fundo atrás de diálogos e painéis |

### Semânticas (sólida + suave)

| Função | Sólida | Suave (fundo / texto / borda) | Contraste do texto |
|---|---|---|---|
| Alerta, pendência | `pending-strong` `#E9A23B` (só indicador ao lado de texto); `warning-600` `#B7791F` quando o indicador está sozinho (3,6:1) | `pending` `#FDEFC9` / `pending-foreground` `#6B4500` / `pending-border` `#F0C873` | 7,4:1 |
| Erro, prazo crítico | `destructive` | `destructive-soft` `#FDECEB` / `destructive-soft-foreground` `#A3261E` / `destructive-border` | 6,4:1 |
| Sucesso | `success` | `success-soft` `#E8F5EC` / `success-soft-foreground` `#1E6B37` / `success-border` | 5,8:1 |
| Informação | `primary` | `info-soft` (turquesa 50) / `info-soft-foreground` (turquesa 800) / `info-border` | 6,3:1 |

O amarelo `#FFE600` saiu do sistema (pedido da Dra. em 27/11/2026). Quem usava `bg-pending text-pending-foreground`
passou automaticamente para o âmbar suave. Escala completa: `warning-50, 100, 200, 300, 500, 600, 700, 800, 900`.

Menu lateral (fundo petróleo `#082B2B`): `sidebar-muted` (rótulos), `sidebar-line` (linha do fluxo),
`sidebar-active` (item ativo), `sidebar-badge`/`sidebar-badge-foreground` (contador âmbar translúcido, 6,7:1) e
`sidebar-badge-critical`/`-foreground` (prazo fatal, 6,9:1).

Gráficos: `chart-1` turquesa 600, `chart-2` verde, `chart-3` âmbar 500, `chart-4` vermelho, `chart-5` turquesa 900.

Conversa do Atendimento: `--chat-wallpaper` (fundo creme sob o papel de parede), `--chat-read` (azul dos tiques de
"lida", convenção do WhatsApp) e `avatar-ink` (texto sobre avatares de iniciais e ícones de arquivo).

## Tipografia

| Papel | Tamanho / peso | Classe |
|---|---|---|
| Título da página (h1) | 24px, EB Garamond 600 | `PageHeader` (`text-2xl font-semibold`) |
| Título de diálogo | 20px, EB Garamond 600 | já no `DialogTitle`/`AlertDialogTitle`/`SheetTitle` |
| Título de seção (h2/h3) | 15px, Inter 600 | `section-title` ou `text-md font-semibold` |
| Texto de leitura | 14px | `text-sm` |
| Texto secundário, tabelas | 13px | `text-xs` |
| Metadados, rótulos de tabela, etiquetas | 12px (mínimo) | `text-2xs` |
| Número de destaque | 22px, 600, algarismos tabulares | `.indicador-valor` |

h1 usa EB Garamond (voz da marca); h2/h3 usam Inter por padrão (base em `styles.css`). Não usar tamanhos acima
de 24px dentro das telas internas. Nada abaixo de 12px.

## Espaço, raio, sombra, camadas

- Espaçamento em múltiplos de 4px (escala do Tailwind). Página: `px-4 py-5`, `md:px-6`, `lg:px-8 lg:py-6`
  (`paginaClasse` em `shared.tsx`), largura máxima `--page-max` = 1560px.
- Entre seções: 24px (`mb-6`). Título de seção → conteúdo: 12px (`mb-3`). Grupos de campos: 12–16px.
- Raio: `--radius` 8px. `rounded-md` (6px) em botões, campos, etiquetas; `rounded-lg` (8px) em superfícies,
  diálogos, menus, avisos. Nada acima de 12px.
- Sombras (matiz grafite, com deslocamento): `shadow-xs` botões e campos; `shadow-md` tooltip; `shadow-lg` menus e
  popovers; `shadow-xl` diálogos. Superfícies de página ficam sem sombra (só borda).
- Camadas: `--z-sticky` 20 (barra do caso), `--z-header` 30, `--z-progress` 35, `--z-overlay` 50 (diálogos,
  menus), `--z-toast` 60.
- Quebras: padrão do Tailwind (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536) + `3xl` 1920.

## Estrutura

| Peça | Medida |
|---|---|
| Cabeçalho | 56px (`--header-h`), branco, borda inferior de 1px; logo 32px + "MANAGER ADV" 16px; busca rápida como campo; avatar com iniciais, nome e papel; Sair |
| Menu lateral | 232px aberto, 56px recolhido (`SIDEBAR_WIDTH`/`SIDEBAR_WIDTH_ICON`). Itens de 32px. Recolhido: ícones centralizados, tooltip com nome e contador, ponto colorido no canto do ícone |
| Atendimento | Abaixo de 1536px de largura o menu abre recolhido ao entrar na tela; quem abrir o menu mantém aberto; ao sair, volta como estava (`RecolherMenuNoAtendimento` em `route.tsx`) |
| Atendimento: colunas | Lista e painel do cliente com largura por `--lista-w`/`--painel-w` e `clamp` (a conversa nunca fica abaixo de 420px). Padrão 280/320px, 296/340 a partir de 1440px, 320/360 a partir de 1920px. Alça `AlcaLargura` (`ui/resizable.tsx`): arrastar, setas (16px, 64px com Shift), Home/End, Enter ou duplo clique volta ao padrão; a escolha fica no navegador |
| Atendimento: avisos | `CentroAvisos` abre recolhido numa linha de 36px ("Precisa de atenção · N" + o aviso mais importante); aberto, até 36vh com rolagem própria. Avisos com `data-critico` ficam sempre visíveis (critério em `REDESIGN_QA.md`) |
| Atendimento: conversa | Cabeçalho de 56px em uma linha; abaixo de 640px de conversa, "Trato feito" e "Próxima" viram ícone com dica; abaixo de 400px o cabeçalho passa a 2 linhas. Compositor com chips de 28px em linha rolável e campo de 40 a 160px |
| Página | `PageHeader` (título 24px, `descricao` opcional, ações à direita, sem régua) dentro de `paginaClasse` |
| Barra do caso | Fixa sob o cabeçalho, 56px + fio das etapas; busca 240px, seletor 288px |

## Componentes base (`src/components/ui`)

| Componente | Padrão |
|---|---|
| `Button` | 36px (`default`), 32px (`sm`, texto 13px), 40px (`lg`), `icon` 36px, `icon-sm` 32px. Raio 6px. Foco com anel de 2px. `outline` com borda `border-strong` e fundo branco |
| `Input`, `Textarea`, `SelectTrigger` | 36px, fundo branco, borda `input`, foco = borda turquesa + anel suave |
| `Badge` | 20px, 12px, suave. Variantes: `default` (info), `secondary` (neutro), `destructive`, `warning`, `success`, `outline` |
| `Alert` | Fundo suave + borda inteira + ícone. Variantes: `default`, `info`, `warning`, `success`, `destructive` |
| `Card` | Borda, sem sombra, raio 8px, padding 16px (só use quando o bloco é realmente uma unidade) |
| `Table` | Cabeçalho 36px em `surface-subtle`, células `px-3 py-2`, texto 13px |
| `Tooltip` | Grafite 900, texto 12px, `shadow-md` |
| `Dialog`/`AlertDialog`/`Sheet` | Fundo `overlay`, superfície branca, `shadow-xl`, título em EB Garamond 20px |
| `Tabs` | Lista em `muted`, aba ativa branca com `shadow-xs` |

## Classes de página (`styles.css`, camada `components`)

- `.superficie`: bloco branco com borda e raio de 8px.
- `.tabela-dados` no `<table>`: cabeçalho fixo de 36px, linhas com hover, texto 13px, `.num` alinha à direita.
- `.faixa-indicadores` com filhos `.indicador` > `.indicador-valor` + `.indicador-rotulo`: indicadores lado a lado
  com divisórias finas, em vez de um cartão por número.
- `section-title`: título de seção em 15px (sem faixa nem régua).

## Movimento

Tokens em `styles.css` (`--motion-instant` 100ms … `--motion-focal` 450ms, `--ease-out`). Detalhes em
`research/MOTION_GUIDELINES.md`. Troca de tela com transição curta só no conteúdo, e só quando o app já está aberto e
visível (`src/router.tsx`; no primeiro carregamento e em aba em segundo plano a troca é direta); skeleton com brilho;
`entrada-suave` para item novo; `prefers-reduced-motion` desliga deslocamentos.

## Acessibilidade

Contraste conferido para todos os pares acima (cálculo WCAG 2.x). Foco visível em todos os controles. Contadores do
menu têm texto para leitor de tela no próprio link. Rolagem e seleção de texto no tom do sistema. Alvos de clique de
32px ou mais.
