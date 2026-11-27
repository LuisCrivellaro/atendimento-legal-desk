# Componentes front-end selecionados

Pesquisa de 27/11/2026 no **React Bits** (<https://reactbits.dev>) e no **Uiverse** (<https://uiverse.io>),
navegando as demonstrações no navegador. Critérios: usabilidade, praticidade, estética, identidade, desempenho,
acessibilidade, compatibilidade com a stack, manutenção, licença e efeito no trabalho comercial da equipe.

Stack do Manager ADV (verificada no repositório): React 19.2.8, TanStack Router 1.170, Tailwind 4, shadcn/ui com
Radix, `lucide-react`, `tw-animate-css`, Sonner, Recharts. Não há `motion`, `framer-motion` nem GSAP instalados.

Legenda: [V] verificado (demo aberta, página lida ou código do projeto conferido) · [E] estimativa.

## Licenças verificadas

- **React Bits:** "MIT + Commons Clause" (arquivo `LICENSE.md` do repositório oficial `DavidHDev/react-bits`, lido em
  27/11/2026). Permite usar, inclusive comercialmente, "como parte de uma aplicação, site ou produto"; proíbe vender ou
  redistribuir os componentes em si. O Manager ADV pode usar, mantendo o aviso de copyright no arquivo copiado. [V]
- **Uiverse:** cada página de elemento diz "MIT License — All content (UI elements) on this site are published under
  the MIT License". [V] Manter o crédito do autor num comentário.
- Componentes do próprio projeto (shadcn/Radix): MIT, já em uso.

## Como instalar (quando a implementação for autorizada)

- React Bits, verificado na página "Installation": cada componente é código-fonte copiado para o projeto, pela CLI do
  shadcn (`npx shadcn@latest add @react-bits/<Nome>-TS-TW`) ou pela aba "Code". Para este projeto: variante **TS-TW**,
  com Bun (`bun x --bun shadcn@latest add @react-bits/Stepper-TS-TW`). O projeto já tem `components.json`. [V]
- Uiverse: copiar o HTML+CSS ou Tailwind da página do elemento (botão "Export" oferece React) e reescrever com os
  tokens do projeto. [V]
- Nenhuma dependência foi instalada nesta etapa.

## Decisão geral

Os dois sites são vitrines de efeitos, a maior parte feita para páginas de marketing. Para uma ferramenta de trabalho
(modo Operate), a base continua sendo shadcn/Radix, que já está no projeto e é acessível. Do React Bits e do Uiverse
entram poucos componentes, e quase todos serão reescritos com os tokens do projeto a partir do comportamento visto na
demonstração. Assim o projeto não ganha dependências (hugeicons, motion, gsap) e continua com um sistema visual só.

---

## Selecionados

### 1. Confirmação com consequência explícita (AlertDialog)

| Campo | Detalhe |
|---|---|
| Origem | Projeto: `src/components/ui/alert-dialog.tsx` (shadcn/Radix), hoje sem uso [V] |
| Aplicação | Todas as ~10 chamadas a `window.confirm` (cancelar consulta, PIX confirmado, cliente faltou, voltar ao Automático, T09, atender todo mundo, migrar consulta, apagar mensagem) |
| Funcionalidade | Diálogo modal com título que descreve a consequência e botão com a ação exata |
| Benefício | A equipe lê o que vai acontecer antes de confirmar; visual da marca em vez da caixa do navegador |
| Justificativa | Vercel: ação destrutiva precisa de confirmação; gates jurídicos não podem ficar sem ela |
| Adaptação | Botão perigoso em vermelho só quando a ação perde algo; foco inicial no "Voltar" |
| Desktop / mobile | Centrado no desktop; o mesmo componente funciona em tela pequena |
| Dependências | Nenhuma nova |
| Desempenho | Desprezível [E] |
| Acessibilidade | Radix cuida de foco preso, Esc e `aria-describedby` |
| Prioridade | Essencial |

### 2. Skeleton no formato do conteúdo

| Campo | Detalhe |
|---|---|
| Origem | Projeto: `src/components/ui/skeleton.tsx` (sem uso hoje) [V]. Referência visual: Uiverse, "Loader by sahilxkhadka" <https://uiverse.io/sahilxkhadka/proud-octopus-27> (Tailwind `animate-pulse`, avatar + duas linhas) [V] |
| Aplicação | Lista de conversas, Painel, tabelas de Clientes/Processos, painel do cliente, Aprovações |
| Funcionalidade | Blocos cinza no formato do que vai chegar, com brilho suave |
| Benefício | A tela não "pula" quando os dados chegam e parece mais rápida |
| Justificativa | Impeccable (Operate): skeleton no lugar de spinner no meio do conteúdo |
| Adaptação | Cor `--surface-2`; sem brilho com movimento reduzido |
| Dependências | Nenhuma |
| Desempenho | Positivo: reserva espaço e evita deslocamento de layout [E] |
| Acessibilidade | Contêiner com `aria-busy="true"` e texto "Carregando conversas…" para leitor de tela |
| Prioridade | Essencial |

### 3. Controle segmentado (Modo da Anne, Caso/Quadro, filtros de 2–4 opções)

| Campo | Detalhe |
|---|---|
| Origem | Referência: Uiverse, "Radio by Yaya12085" <https://uiverse.io/Yaya12085/rude-mouse-79> (CSS puro, rádios nativos, pílula que desliza; demo com "HTML / React / Vue") [V]. Implementação: `src/components/ui/toggle-group.tsx` (Radix) [V] |
| Alternativa comparada | React Bits "Rubber Segment" <https://reactbits.dev/micro/rubber-segment> (polegar que estica e amassa; depende de `motion`) [V] |
| Escolha | Uiverse como referência visual + Radix ToggleGroup. O efeito elástico do Rubber Segment é brincalhão demais para o tom do escritório e traria uma dependência |
| Aplicação | Seletor de modo da Anne (Automático / Híbrido / Humano / Bloqueado), Caso / Quadro em Produção, Todos / Com prazo / Concluídos em Andamentos |
| Benefício | Todas as opções ficam visíveis (hoje o modo está escondido num dropdown) e a escolha atual fica clara |
| Adaptação | Polegar branco sobre `--surface-2`, cor por modo só num ponto à esquerda do rótulo; mudar para "Automático" continua pedindo confirmação (regra atual) |
| Dependências | Nenhuma nova |
| Desempenho | Desprezível [E] |
| Acessibilidade | `role="radiogroup"`/setas do teclado pelo Radix; estado não só por cor |
| Licença | MIT (Uiverse) |
| Prioridade | Essencial |

### 4. Centro de avisos recolhível

| Campo | Detalhe |
|---|---|
| Origem | Projeto: `src/components/ui/accordion.tsx` / Collapsible (Radix) [V] |
| Aplicação | Atendimento: substitui as até ~9 faixas empilhadas acima das mensagens |
| Funcionalidade | Um bloco "Precisa de atenção (N)", aberto quando há item crítico, com itens ordenados por gravidade e cada um com sua ação |
| Benefício | Mais espaço para a conversa e uma ordem clara do que fazer primeiro |
| Justificativa | Hierarquia (princípio 7) e Impeccable: hoje as faixas competem entre si |
| Adaptação | Cores semânticas do `DESIGN_SYSTEM.md`; "Próximo passo" fica fora do acordeão, como ação principal |
| Dependências | Nenhuma nova |
| Acessibilidade | Botão de abrir/fechar com `aria-expanded`; contagem anunciada com `aria-live` |
| Prioridade | Essencial |

### 5. Fio das etapas / Stepper

| Campo | Detalhe |
|---|---|
| Origem | React Bits "Stepper" <https://reactbits.dev/components/stepper> [V] ("A multi-step flow with a gliding step indicator, spring transitions and horizontal or vertical layouts"; 31 props; dependências `@hugeicons/react` e `@hugeicons/core-free-icons`) |
| Aplicação | (a) Cabeçalho do caso: as 10 etapas como nós ligados pelo fio. (b) Protocolo: Autuação → Registro externo → Confirmação da sênior em etapas verticais |
| Funcionalidade | Indicador de etapa que desliza entre os nós; layout horizontal ou vertical |
| Benefício | A equipe vê onde o caso está e o que falta, sem ler texto miúdo (hoje a faixa de etapas da Produção é ilegível) |
| Justificativa | É a assinatura da direção criativa e cumpre os princípios 6 e 30 |
| Adaptação | Componente próprio inspirado no comportamento: trocar hugeicons por lucide, usar `--brand-strong`, rótulo da etapa atual visível, avanço só após recibo do servidor (`MOTION_GUIDELINES.md`) |
| Desktop / mobile | Horizontal no desktop; vertical em painéis estreitos |
| Dependências | Nenhuma se reescrito; hugeicons se copiado como está [V] |
| Desempenho | Baixo [E] |
| Acessibilidade | Lista ordenada (`<ol>`) com `aria-current="step"`; não depender de cor |
| Licença | MIT + Commons Clause |
| Prioridade | Recomendado (o fio do cabeçalho do caso é essencial para a direção criativa; o código do React Bits é opcional) |

### 6. Check desenhado no checklist

| Campo | Detalhe |
|---|---|
| Origem | React Bits "Spring Check" <https://reactbits.dev/micro/spring-check> [V] (preenche a caixa, desenha o tique e risca o rótulo; 17 props; depende de `motion` e `@hugeicons/core-free-icons`) |
| Aplicação | Checklist de provas (Produção, aba Documentos do Atendimento), checklist da Auditoria |
| Benefício | Confirma visualmente o recebimento de cada documento |
| Adaptação | Sem riscar o rótulo (num checklist jurídico, riscado parece "removido"); tique em `--brand-strong`; reescrever em CSS (`stroke-dashoffset`) sobre o Checkbox do Radix, sem `motion` |
| Dependências | Nenhuma se reescrito |
| Desempenho | Desprezível [E] |
| Acessibilidade | Checkbox nativo/Radix com rótulo clicável |
| Licença | MIT + Commons Clause |
| Prioridade | Recomendado |

### 7. Janela de "Desfazer" em ações internas

| Campo | Detalhe |
|---|---|
| Origem | React Bits "Fuse Button" <https://reactbits.dev/micro/fuse-button> [V] (testado: clicar "Archive" troca o botão por "Undo" com uma borda que se consome; 23 props; depende de hugeicons) |
| Aplicação | Ações internas reversíveis: marcar aviso como resolvido, concluir retorno, marcar conversa como lida, arquivar pendência da fila do advogado |
| Benefício | Evita um diálogo de confirmação para coisas pequenas e permite corrigir um clique errado |
| Justificativa | Vercel: ação destrutiva pede confirmação **ou** janela de desfazer; Impeccable: evitar modal quando não precisa |
| Adaptação | Texto "Feito · Desfazer", 5s; anunciar com `aria-live` (a demo não anuncia [V]); nunca para envio ao cliente, reserva de agenda, aprovação jurídica ou protocolo |
| Dependências | Nenhuma se reescrito |
| Prioridade | Recomendado |

### 8. Marca de status de operação

| Campo | Detalhe |
|---|---|
| Origem | React Bits "Status Mark" <https://reactbits.dev/micro/status-mark> [V] ("glyph that morphs from an idle ring to a progress arc, then a check"; 18 props; depende de `motion`) |
| Aplicação | Estado de envio de anexo, reserva de horário, sincronização com ProJuris, verificação de integração |
| Benefício | Um só símbolo para "em andamento → concluído", no lugar de vários textos diferentes |
| Adaptação | Estados extras: "simulado" (anel tracejado) e "falhou" (vermelho com ícone); o check só aparece com recibo real |
| Dependências | `motion` se copiado; reescrever em SVG + CSS é viável [E] |
| Acessibilidade | Texto do estado ao lado ou em `aria-label`; mudança anunciada com `aria-live` |
| Prioridade | Recomendado |

### 9. Linha de status de IA com cronômetro

| Campo | Detalhe |
|---|---|
| Origem | React Bits "Lattice Loader" <https://reactbits.dev/micro/lattice-loader> [V] (células que acendem em onda ao lado de um cronômetro; demo "Thinking 2.8s"; sem dependências) |
| Alternativa comparada | React Bits "Thought Line" <https://reactbits.dev/micro/thought-line> (resume etapas de raciocínio; depende de `motion` + hugeicons) [V] |
| Escolha | Lattice Loader: não depende de dados de etapas que o servidor não envia; Thought Line exigiria inventar etapas |
| Aplicação | "Sugerir com IA" (Atendimento), "Gerar minuta com IA" (Produção), "Auditoria IA", análise de documento |
| Benefício | Mostra que algo está acontecendo e há quanto tempo, sem prometer prazo |
| Adaptação | Texto real ("Gerando minuta"), cores da marca, sem animação com movimento reduzido |
| Dependências | Nenhuma [V] |
| Prioridade | Recomendado |

### 10. Tooltips que aquecem (grupo de ícones)

| Campo | Detalhe |
|---|---|
| Origem | React Bits "Warm Tooltip" <https://reactbits.dev/micro/warm-tooltip> [V] ("the first label waits, then its siblings open instantly while warm"; depende de `motion`) |
| Implementação | O mesmo comportamento existe no Radix: `TooltipProvider` com `delayDuration` e `skipDelayDuration` (já instalado) |
| Aplicação | Barra de ícones do compositor, cabeçalho da conversa, menu lateral recolhido |
| Benefício | Ao percorrer os ícones, os nomes aparecem sem espera depois do primeiro |
| Dependências | Nenhuma (configuração) |
| Prioridade | Recomendado |

### 11. Navegação lateral de configurações

| Campo | Detalhe |
|---|---|
| Origem | Referência: Uiverse, "Radio by reglobby" <https://uiverse.io/reglobby/red-mayfly-78> [V] (lista vertical "Public profile, Account, Appearance, Accessibility, Notifications" com indicador) |
| Aplicação | Nova página de Configurações com seções (Meu perfil, Atendimento, Canal e Agente, Integrações, Monitoramento, Log, Avançado) |
| Adaptação | Implementar com links (o original usa rádios, o que é semântica errada para navegação), indicador = fio `--brand-strong`, seção na URL |
| Dependências | Nenhuma |
| Licença | MIT |
| Prioridade | Recomendado |

### 12. Contador na primeira carga

| Campo | Detalhe |
|---|---|
| Origem | React Bits "Count Up" <https://reactbits.dev/text-animations/count-up> [V] (19 props: `easing`, `format`, `separator`, `trigger` "view"/"load", `startWhen`, `onEnd`; depende de `motion`) |
| Aplicação | Contadores do "O que fazer hoje" no Painel |
| Benefício | Chama atenção para o número do dia uma vez, ao abrir o Painel |
| Ressalva | A Impeccable recusa o "template de número grande com rótulo pequeno"; por isso só nos contadores de tarefas e só na primeira carga, sem replay |
| Adaptação | `trigger="load"`, duração 0,6s, `Intl.NumberFormat('pt-BR')`; reescrever com `requestAnimationFrame` evita `motion` |
| Prioridade | Opcional |

### 13. Lista com seleção que desliza

| Campo | Detalhe |
|---|---|
| Origem | React Bits "Animated List" <https://reactbits.dev/components/animated-list> [V] ("rows spring into view, with a gliding selection and arrow keys"; 23 props; hugeicons) |
| Aplicação | Lista de conversas: o fundo da conversa selecionada desliza ao usar Alt+↑/↓ (atalhos que já existem) |
| Ressalva | A lista real tem rolagem infinita e centenas de itens: só o indicador de seleção anima; as linhas não "entram" uma a uma |
| Dependências | Nenhuma se reescrito |
| Prioridade | Opcional |

### 14. Compositor consolidado (referência)

| Campo | Detalhe |
|---|---|
| Origem | React Bits "Prompt Bar" <https://reactbits.dev/micro/prompt-bar> [V] ("Chat composer with @ sources, / commands, a model picker, dictation and attachments"; `motion` + hugeicons) |
| Aplicação | Atendimento: hoje há 6 jeitos de chegar a uma ação (Próximo passo, Ações da etapa, Mensagens prontas, "/", chips e Agenda rápida). A referência mostra como juntar comandos "/" e anexos numa barra só |
| Uso | Só referência de organização; o compositor atual tem regras de envio e recibo que não podem mudar |
| Prioridade | Opcional (referência) |

---

## Descartados e motivo

| Componente | Biblioteca | Motivo |
|---|---|---|
| Rubber Segment | React Bits | Efeito elástico fora do tom; substituído pelo segmentado do item 3 |
| Hold Button ("Hold to delete") | React Bits | Segurar para confirmar é ruim para teclado e para quem tem dificuldade motora; confirmações usam AlertDialog |
| Slide Commit | React Bits | Gesto de arrastar é de celular; o sistema é desktop |
| Squish Switch | React Bits | Brincalhão; o Switch do Radix com transição de 150ms basta |
| Swipe Toast | React Bits | O projeto já usa Sonner, que faz o mesmo |
| Counter (odômetro) | React Bits | Dígitos rolando em badges distraem num uso diário |
| Pill Nav, Line Sidebar, Gooey Nav, Bubble Menu, Staggered Menu, Dock | React Bits | Navegação de site de marketing ou efeito de proximidade do cursor; o menu lateral atual é o padrão certo |
| Animated Content, Fade Content | React Bits | Revelação por rolagem com GSAP; não serve a ferramenta |
| Gradual Blur | React Bits | Desfoque sobre texto prejudica a leitura; usar máscara de gradiente simples onde precisar |
| Thought Line | React Bits | Exige etapas reais de raciocínio que o servidor não envia (ver item 9) |
| Call Chip | React Bits | Termina "tremendo em vermelho"; o Status Mark cobre o caso com mais sobriedade |
| Todas as animações de texto (Blur Text, Text Type, Shiny Text, Glitch, Decrypted, Split Text etc.) | React Bits | Texto que se mexe atrapalha a leitura numa ferramenta |
| Todos os fundos (Aurora, Silk, Dot Grid, Particles, Waves etc.) | React Bits | Decoração; a Taste e a Impeccable vetam efeitos em serviços |
| Specular Button, Glass Surface, Fluid Glass, Glass Icons | React Bits | Vidro/brilho sem propósito (lista de padrões de IA do pedido) |
| Spotlight Card, Magic Bento, Tilted Card, Holo Card, Reflective Card, Border Glow | React Bits | Cartões decorativos; inclinação proibida |
| Carrosséis e galerias (Carousel, Circular Gallery, Dome Gallery, Masonry etc.) | React Bits | Não há imagens no sistema |
| Click Spark, Splash Cursor, Target Cursor e demais cursores | React Bits | Decoração de cursor |
| Shredder, Paper Crumple, Tear Ticket | React Bits | Tom inadequado para exclusões num escritório de advocacia |
| Voice Pill | React Bits | Gravação de áudio não está no escopo; áudios são tratados pela equipe no celular |
| Code Slots, Scrub Field, Peek Rating, Jelly Radio, Comet Dial, Wake Slider | React Bits | Sem caso de uso no sistema |
| Switch "On/Off" (m1her) <https://uiverse.io/m1her/odd-fireant-56> | Uiverse | Visual skeumórfico laranja, fora da marca |
| Tooltip (gharsh11032000) <https://uiverse.io/gharsh11032000/spotty-zebra-83> | Uiverse | Animação com quique; Radix Tooltip já resolve |
| Form de login (zanina-yassine) <https://uiverse.io/zanina-yassine/light-dragonfly-12> | Uiverse | Genérico; o login atual tem identidade própria melhor |
| Card "Tiny Browser Widget" (arthur_6104) <https://uiverse.io/arthur_6104/grumpy-pug-86> | Uiverse | Sem relação com o sistema |
| Card de alerta (Cybercom682) <https://uiverse.io/Cybercom682/empty-wolverine-58> | Uiverse | A prévia não carregou no teste; não verificado. O centro de avisos (item 4) cobre a necessidade |
| Checkboxes e switches "criativos" em geral | Uiverse | A maioria troca o controle nativo por truques de CSS sem garantia de acessibilidade; os primitivos do Radix são mais seguros |

## Observações da pesquisa

- A busca do Uiverse por URL (`/elements?search=`) devolve resultados aleatórios quando carregada fora da interface;
  os elementos citados aqui foram abertos um a um. [V]
- O site do React Bits também vende uma versão "Pro"; só componentes gratuitos foram considerados.
- O impacto no bundle de cada componente não foi medido; os números de dependência vêm das páginas oficiais. Medir no
  build antes de adotar qualquer um.
