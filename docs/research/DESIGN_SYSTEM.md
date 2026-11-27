# Sistema de design proposto: Manager ADV

Proposta de 27/11/2026, derivada de `CREATIVE_DIRECTION.md`. É uma evolução dos tokens que já existem em
`src/styles.css`: os nomes atuais são mantidos sempre que possível, para a troca ser feita por valor e não por
reescrita das telas. Nada aqui foi implementado ainda.

Contrastes calculados pela fórmula WCAG 2.x (27/11/2026). Texto normal precisa de 4,5:1; texto grande e elementos
de interface (bordas de campo, indicadores de estado, ícones que carregam significado) precisam de 3:1.

## 1. Cor

**Atualizado em 27/11/2026: a paleta oficial agora vem da logo do MANAGER ADV.** Valores, contrastes e regras de uso
estão em `../IDENTIDADE_VISUAL.md` e implementados em `src/styles.css`. A proposta anterior desta seção (aqua
`#00ACA7`, petróleo `#0F3533`, fio `#00938E`) foi substituída.

Resumo do mapeamento:

| Papel | Token | Valor |
|---|---|---|
| Cor da logo (realces, régua do cabeçalho, indicador do menu, gráficos de destaque) | `--brand` | `#00C9CB` |
| Ação (botão primário, link, foco) | `--primary`, `--ring`, `--brand-strong` | `#017F80` (4,8:1 com branco) |
| Hover de ação | `--primary-hover` | `#066768` |
| Seleção e fundos claros de destaque | `--accent`, `--secondary`, `--brand-pale` | `#EEFAFA` |
| Estrutura escura (menu lateral, painel do login) | `--sidebar`, `--petrol` | `#082B2B` |
| Fundo / superfície / texto | `--background` / `--card` / `--foreground` | `#F1F7F7` / `#FFFFFF` / `#192020` |
| Texto secundário / bordas / borda de campo | `--muted-foreground` / `--border` / `--input` | `#5A6666` / `#D8E2E2` / `#7D8989` |
| Sucesso / alerta / erro (preservadas) | `--success` / `--pending` / `--destructive` | inalteradas |

O "fio" da direção criativa usa `--brand` sobre fundos escuros e `--brand-strong` quando precisa ser o único indicador
sobre fundo claro.
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
carregando (skeleton ou indicador no próprio botão), erro, vazio, selecionado (fundo `--brand-pale` + fio `--brand-strong`).

## 8. Componentes-base

| Componente | Especificação |
|---|---|
| Botão | Variantes: primário (`--primary`), secundário (contorno), fantasma, perigo. Altura 36px (32px compacto). Rótulo verbo + objeto. Carregando: o rótulo vira "Enviando…" com indicador, largura fixa |
| Pílula de status | Raio cheio, ícone 14px + texto 12px/500, cores semânticas da seção 1 |
| Segmentado | Para 2–4 opções exclusivas (Modo da Anne; Caso/Quadro; Todos/Com prazo/Concluídos). Rádios nativos ou Radix ToggleGroup, polegar que desliza 200ms |
| Campo | Rótulo visível acima, ajuda abaixo, erro abaixo em vermelho com ícone; borda `--input`; máscara onde houver formato (CPF, CNJ, telefone) |
| Cabeçalho do caso | Nome (Garamond 22px), código, área, responsável, pílula de aprovação, fio das 10 etapas; fixo ao rolar |
| Fio das etapas | Nós de 10px ligados por linha de 2px: concluída = preenchida `--brand-strong`; atual = anel + preenchimento; futura = contorno `--border`. Rótulo da etapa atual sempre visível; os outros em tooltip |
| Linha do tempo | Fio vertical `--brand-strong` 2px, marcadores por tipo (audiência, perícia, prazo, mensagem) |
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
