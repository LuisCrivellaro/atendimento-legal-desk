# Sistema de design proposto: Manager ADV

Proposta de 27/11/2026, derivada de `CREATIVE_DIRECTION.md`. É uma evolução dos tokens que já existem em
`src/styles.css`: os nomes atuais são mantidos sempre que possível, para a troca ser feita por valor e não por
reescrita das telas. Nada aqui foi implementado ainda.

Contrastes calculados pela fórmula WCAG 2.x (27/11/2026). Texto normal precisa de 4,5:1; texto grande e elementos
de interface (bordas de campo, indicadores de estado, ícones que carregam significado) precisam de 3:1.

## 1. Cor

### Marca e estrutura

| Token (atual → proposto) | Valor | Uso | Contraste |
|---|---|---|---|
| `--petrol` / `--sidebar` | `#0F3533` | Menu lateral, login, tooltips | branco 13,3:1 |
| `--sidebar-accent` | `#164441` | Hover no menu | — |
| `--sidebar-active` (novo, hoje fixo `#1B4B48`) | `#1B4B48` | Fundo do item ativo | — |
| `--sidebar-foreground` | `#D3E6E4` | Texto do menu | 10,3:1 no petróleo |
| `--sidebar-muted` (novo, hoje fixo `#8FB3B0`) | `#8FB3B0` | Rótulos de grupo, ícones inativos | 5,9:1 no petróleo |
| `--brand` | `#00ACA7` | O fio sobre petróleo; detalhes da marca | 4,7:1 no petróleo; **2,8:1 no branco (não usar como indicador em fundo claro)** |
| `--thread` (novo) | `#00938E` | O fio sobre fundos claros (seleção, etapas, linha do tempo) | 3,8:1 no branco; 3,5:1 no `#F4F7F7` |
| `--primary` | `#007F7B` | Botão primário, links, anel de foco | 4,9:1 com branco |
| `--primary-hover` | `#006A67` | Hover/pressionado | 6,5:1 com branco |
| `--brand-pale` / `--accent` | `#E9F7F6` | Fundo de item selecionado em lista, realce leve | texto `#0F4744` 9,5:1 |

### Papel e tinta

| Token | Valor | Uso |
|---|---|---|
| `--background` | `#F4F7F7` | Fundo do conteúdo |
| `--card` / `--popover` | `#FFFFFF` | Superfícies de trabalho, menus |
| `--surface-2` (novo) | `#EEF3F3` | Segunda camada (barra de filtros, painel lateral, cabeçalho de tabela) |
| `--foreground` | `#141A1A` | Texto principal (16,4:1 no fundo) |
| `--muted-foreground` | `#5B6B6B` | Texto secundário (5,2:1 no fundo, 5,6:1 no branco) |
| `--border` | `#D9E6E5` | Linhas divisórias (decorativas) |
| `--input` | `#7E9997` (hoje `#CFDEDD`) | Borda de campo de formulário: precisa de 3:1 para o campo ser identificável (3,05:1 no branco) |

### Semânticas (substituem o amarelo `#FFE600`)

| Estado | Texto / ícone | Fundo | Borda | Contraste do texto | Uso |
|---|---|---|---|---|---|
| Crítico | `#B42318` | `#FEF3F2` | `#F4B8B2` | 6,1:1 | Prazo fatal, erro, falha de envio |
| Atenção | `#7A4B00` | `#FDF3D8` | `#E8B44C` | 6,7:1 | Pendência, aguardando aprovação, vencendo |
| Concluído | `#1E7A46` | `#EAF6EE` | `#9FD3B2` | 4,8:1 | Aprovado, recebido, enviado com recibo |
| Informação | `#0F4744` | `#E9F7F6` | `#A8DCD8` | 9,5:1 | Dica, estado neutro, "simulado" |
| Neutro | `#4A5A5A` | `#EEF3F3` | `#D9E6E5` | 6,7:1 | Rascunho, sem prazo, desligado |

Regras:
- Estado nunca só por cor: pílula com ícone + palavra ("Atenção · 3 pendências").
- Vermelho só para o que pode causar perda (prazo fatal, falha, erro). Zero nunca aparece em vermelho.
- Badges do menu: vermelho para prazo fatal; âmbar para fila; nenhum badge com número zero.

### Conversa (Atendimento)

| Token | Valor | Observação |
|---|---|---|
| `--bubble-out` | `#DDF2F0` (aqua claro da marca) | Proposta. Hoje a conversa usa `#D9FDD3` (verde WhatsApp). Decisão da Dra. |
| `--bubble-in` | `#FFFFFF` | |
| `--chat-bg` | `#F7F5EE` liso ou padrão próprio em 4% de opacidade | Substitui o papel de parede atual (provável arte do WhatsApp) |
| Botão enviar | `--primary` | Hoje `#00A884` (verde WhatsApp) |

### Gráficos

Série principal `#00938E`; secundária `#0F3533`; terceira `#8FB3B0`; estados usam as semânticas acima. Rótulos de
eixo em `#5B6B6B` 12px, sem rotação (barras horizontais quando os rótulos forem longos).

### Modo escuro

Não faz parte desta etapa. Os tokens `.dark` atuais (padrão shadcn azulado) ficam como estão até haver pedido.

## 2. Tipografia

| Papel | Fonte | Tamanho / altura | Peso | Onde |
|---|---|---|---|---|
| Título de página | EB Garamond | 28px / 34px | 600 | H1 de cada tela |
| Nome do cliente (cabeçalho do caso) | EB Garamond | 22px / 28px | 600 | Produção, Auditoria, Protocolo, Andamentos, Atendimento |
| Título de seção | Inter | 15px / 22px | 600 | H2 dentro das telas |
| Subtítulo | Inter | 14px / 20px | 600 | H3, cabeçalho de cartão |
| Corpo | Inter | 14px / 21px | 400 | Texto de interface |
| Secundário | Inter | 13px / 18px | 400–500 | Descrições, metadados longos |
| Metadado | Inter | 12px / 16px | 500 | Horários, contadores, rótulos de tabela |
| Números | Inter `tabular-nums` | conforme o papel | 500–600 | Prazos, contagens, valores |
| Lockup e cidades | como hoje (`.brand-lockup`, `.brand-cities`) | — | — | Cabeçalho, login |
| Peças | Times New Roman 12pt (como hoje) | — | — | Prévia Visual Law; não muda |

Regras: escala fixa em px/rem (sem tamanho fluido), razão ≈ 1,2; `text-wrap: balance` em títulos; nenhum texto abaixo
de 12px; espaçamento entre letras 0 fora do lockup.

## 3. Espaço

Base de 4px. Tokens: `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 ·
`--space-6` 24 · `--space-8` 32 · `--space-10` 40 · `--space-12` 48.

- Dentro de um grupo (rótulo + campo, ícone + texto): 4–8px.
- Entre itens de um grupo: 12–16px.
- Entre seções de uma tela: 24–32px.
- Margem da área de conteúdo: 24px (32px a partir de 1600px).
- Mais espaço acima de um título do que abaixo dele.

## 4. Raio e bordas

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | 4px | Badges, chips pequenos, células |
| `--radius-md` | 6px | Botões, campos, itens de menu (hoje `--radius` 0.375rem) |
| `--radius-lg` | 10px | Painéis, cartões, popovers, diálogos |
| `--radius-full` | 999px | Pílulas de status, avatares, segmentado |

Harmonia (princípio 17): raio externo = raio interno + espaçamento interno. Ex.: botão de 6px dentro de um painel com
4px de respiro usa painel de 10px.

Bordas: 1px `--border` para separar; nada de caixa dentro de caixa (no máximo dois níveis). A régua lateral aqua
(`section-title`) sai das telas e fica só nas peças.

## 5. Profundidade

| Camada | Sombra | Uso |
|---|---|---|
| Plano | nenhuma | Conteúdo, tabelas, painéis fixos |
| Elevado | `0 1px 2px rgb(15 53 51 / 6%), 0 4px 12px -4px rgb(15 53 51 / 12%)` | Cartão em hover, barra fixa ao rolar |
| Flutuante | `0 12px 32px -8px rgb(15 53 51 / 22%)` | Popover, menu, toast |
| Modal | flutuante + véu `rgb(15 53 51 / 40%)` | AlertDialog, Sheet |

Camadas (`z-index`): conteúdo 0 · barra fixa 10 · cabeçalho 30 · menu lateral 30 · popover 40 · toast 50 · modal 60.

## 6. Ícones

`lucide-react`, traço 1,75, 16px em botões e listas, 20px no menu e cabeçalhos. Ícone decorativo com
`aria-hidden`; botão só com ícone tem `aria-label` em português e tooltip.

## 7. Vocabulário de estados (todo componente interativo)

Padrão, hover, foco (anel 2px `--primary` com 2px de afastamento), pressionado, desabilitado (com motivo no tooltip),
carregando (skeleton ou indicador no próprio botão), erro, vazio, selecionado (fundo `--brand-pale` + fio `--thread`).

## 8. Componentes-base

| Componente | Especificação |
|---|---|
| Botão | Variantes: primário (`--primary`), secundário (contorno), fantasma, perigo. Altura 36px (32px compacto). Rótulo verbo + objeto. Carregando: o rótulo vira "Enviando…" com indicador, largura fixa |
| Pílula de status | Raio cheio, ícone 14px + texto 12px/500, cores semânticas da seção 1 |
| Segmentado | Para 2–4 opções exclusivas (Modo da Anne; Caso/Quadro; Todos/Com prazo/Concluídos). Rádios nativos ou Radix ToggleGroup, polegar que desliza 200ms |
| Campo | Rótulo visível acima, ajuda abaixo, erro abaixo em vermelho com ícone; borda `--input`; máscara onde houver formato (CPF, CNJ, telefone) |
| Cabeçalho do caso | Nome (Garamond 22px), código, área, responsável, pílula de aprovação, fio das 10 etapas; fixo ao rolar |
| Fio das etapas | Nós de 10px ligados por linha de 2px: concluída = preenchida `--thread`; atual = anel + preenchimento; futura = contorno `--border`. Rótulo da etapa atual sempre visível; os outros em tooltip |
| Linha do tempo | Fio vertical `--thread` 2px, marcadores por tipo (audiência, perícia, prazo, mensagem) |
| Centro de avisos | Um bloco recolhível "Precisa de atenção (N)" com itens ordenados crítico > atenção > informação, cada um com sua ação |
| Toast | Sonner (já usado), com as cores semânticas; ações "Desfazer" ou "Tentar de novo" quando couber |
| Confirmação | AlertDialog (já existe em `ui/`, hoje sem uso) no lugar de `window.confirm`; título com a consequência, botão com a ação ("Cancelar consulta de 03/12 às 14h") |
| Skeleton | `ui/skeleton` (já existe) no formato do conteúdo que vai chegar |
| Estado vazio | Uma frase do que aparece ali e a próxima ação |
| Tabela | Cabeçalho em `--surface-2`, linhas com hover, números tabulares, coluna de ação à direita, paginação no rodapé |

## 9. Regras de acessibilidade (prioridade da UI/UX Pro Max + Vercel)

1. Contraste: texto 4,5:1, interface 3:1 (tabela da seção 1).
2. Teclado: tudo alcançável, ordem lógica, foco visível, atalhos documentados num painel "Atalhos" (tecla `?`).
3. Nomes acessíveis em português (trocar "Close", "Sidebar", "Toggle Sidebar" dos componentes base).
4. `aria-live="polite"` para toasts, contadores da fila e status de envio.
5. Movimento reduzido respeitado (ver `MOTION_GUIDELINES.md`).
6. Estado na URL quando fizer sentido (aba, filtros, conversa aberta), usando os search params do TanStack Router.
7. Formatos com `Intl.DateTimeFormat`/`Intl.NumberFormat` em `pt-BR` e fuso `America/Sao_Paulo`.
