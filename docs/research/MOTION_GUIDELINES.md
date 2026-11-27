# Diretrizes de movimento: Manager ADV

27/11/2026. Base: Impeccable (`reference/animate.md` e `operate.md`), Web Design Guidelines (Vercel), Taste Skill
(seção "Never"), UI/UX Pro Max (prioridade 7, Animation) e os princípios 31–40 de `../DESIGN_PRINCIPLES.md`.

## Tese de movimento

O Manager ADV é uma ferramenta usada o dia inteiro. O movimento existe para quatro coisas:

1. **Confirmar uma ação** (botão pressionado, mensagem enviada, item marcado).
2. **Explicar uma mudança de estado ou de lugar** (abrir um painel, trocar de aba, uma conversa subir na lista).
3. **Manter a continuidade** na navegação (troca de tela sem "piscar").
4. **Um único momento autoral**: o fio avançando quando um caso muda de etapa.

Se tirar uma animação não faz perder informação nem esse momento, ela não deveria existir.

### O momento autoral: o fio avança

Quando um caso muda de etapa (Trato feito, checklist aprovado, minuta aprovada, protocolo confirmado, etc.), o fio do
cabeçalho do caso preenche o trecho até o próximo nó e o nó novo ganha o anel da etapa atual.

- Duração 450ms, `cubic-bezier(0.16, 1, 0.3, 1)`, desenhado com `transform: scaleX()` numa linha (nada de animar
  `width`).
- Só acontece depois da confirmação do servidor (recibo/gravação), nunca de forma otimista: o fio não pode mostrar um
  avanço que não aconteceu.
- Com movimento reduzido: troca instantânea de cor e um realce de 1s no rótulo da etapa.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--motion-instant` | 100ms | Pressionar botão, hover de cor |
| `--motion-quick` | 150ms | Tooltip, check, troca de ícone |
| `--motion-base` | 200ms | Segmentado, indicador do menu, sublinhado da aba, abrir popover |
| `--motion-panel` | 280ms | Sheet, acordeão, centro de avisos, painel do cliente |
| `--motion-view` | 320ms | Troca de tela (view transition) |
| `--motion-focal` | 450ms | O fio avançando |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entradas e deslizamentos |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Movimentos de ida e volta (polegar do segmentado) |
| `--ease-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | Saídas |

Saída ≈ 75% da duração da entrada. Nada de `bounce`, `elastic` ou molas com ricochete visível.

## Catálogo por situação

| Situação | Movimento | Duração | Movimento reduzido |
|---|---|---|---|
| Trocar de tela | Conteúdo some com fade e o novo entra com fade + 6px de subida (View Transitions do TanStack Router, opção `defaultViewTransition`, presente na versão instalada 1.170) | 320ms | Só fade de 120ms |
| Rota com carregamento | Barra de progresso fina (2px, `--brand-strong`) no topo do conteúdo | contínua | Barra estática com "Carregando…" |
| Lista/tabela carregando | Skeleton no formato das linhas, brilho suave | até chegar | Skeleton sem brilho |
| Item ativo do menu | Fundo e fio aqua deslizam até o novo item | 200ms | Troca instantânea |
| Aba | Sublinhado `--brand-strong` desliza; conteúdo com fade | 200ms | Troca instantânea |
| Segmentado (Modo da Anne etc.) | Polegar desliza | 200ms | Troca instantânea |
| Popover, menu, select | Fade + escala 0,97→1 a partir do gatilho (já vem do `tw-animate-css`) | 150ms | Só fade |
| Sheet, painel do cliente | Desliza da borda | 280ms | Fade |
| Acordeão, centro de avisos, `<details>` | Altura animada (Radix Accordion/Collapsible, já instalados) | 280ms | Abre direto |
| Nova conversa ou conversa que sobe na lista | Reordenação animada (FLIP) só da linha que mudou | 250ms | Sem reordenação animada |
| Mensagem enviada | Bolha entra deslizando 8px + fade; o tique muda de relógio → ✓ → ✓✓ quando chegam os recibos | 200ms | Só fade |
| Mensagem recebida | Bolha entra com fade | 150ms | Aparece |
| Check do checklist | Caixa preenche e o tique é desenhado (`stroke-dashoffset`) | 180ms | Troca instantânea |
| Contador (badge, KPI) | Na primeira carga, o número conta até o valor; em atualizações, só um destaque de 1s no fundo | 600ms (só 1ª vez) | Valor final direto |
| Botão | Pressionar: escala 0,98; carregando: indicador no próprio botão, largura fixa | 100ms | Sem escala |
| Ação interna concluída | Botão vira "Feito · Desfazer" por 5s (ver "Fuse Button" em `FRONTEND_COMPONENTS.md`) | 5s de janela | Sem a barra que se consome; texto fixo |
| Toast | Entra pelo canto e sai deslizando (Sonner) | 200ms | Fade |
| Erro de formulário | Mensagem aparece abaixo do campo com fade; foco vai para o primeiro erro | 150ms | Aparece |
| IA trabalhando (sugerir resposta, gerar minuta, auditoria IA) | Linha de status com indicador discreto e cronômetro real ("Gerando minuta · 0:14") | contínua | Texto e cronômetro, sem animação |
| O fio avança (momento autoral) | Ver acima | 450ms | Troca instantânea + realce |
| Login | O painel petróleo entra com fade e o fio da marca é desenhado uma vez sob "Manager ADV" | 600ms, uma vez | Aparece |

## Como implementar

1. CSS (transições e keyframes) para estados declarativos. `tw-animate-css` já está no projeto.
2. View Transitions pela opção do TanStack Router para troca de tela; sem dependência nova.
3. Radix (Accordion, Collapsible, ToggleGroup, Tooltip, AlertDialog), que já está instalado, para altura animada,
   segmentado, tooltip e confirmações.
4. `motion` (motion.dev) só se a reordenação de listas (FLIP) e os componentes do React Bits escolhidos exigirem.
   Decisão a tomar na implementação (pendente da Dra.): é uma dependência nova. O tamanho exato no bundle deve ser medido
   no build; não foi medido nesta etapa.
5. GSAP não entra: os componentes do React Bits que dependem dele (Animated Content, Fade Content) fazem revelação por
   rolagem, que não serve a uma ferramenta.

Regras técnicas (Vercel + Impeccable):
- Animar só `transform` e `opacity` (e `clip-path`/`stroke-dashoffset` em SVG pequenos).
- Nunca `transition: all`; listar as propriedades.
- Animações interrompíveis: um novo clique cancela a anterior.
- `will-change` só durante a animação.
- O estado padrão é visível: se o JavaScript falhar, nada fica escondido.
- Nada que se mova sozinho por mais de 5s sem controle de pausa.

## Movimento reduzido

Em `@media (prefers-reduced-motion: reduce)`:
- Remove deslocamento, escala e reordenação animada.
- Mantém mudanças de cor e opacidade curtas que confirmam uma ação.
- Contadores mostram o valor final; skeletons ficam sem brilho.
- Nenhum conteúdo depende de animação para aparecer.

## Proibido no sistema

- Parallax, 3D, inclinação de cartão, cursor personalizado, partículas, fundos animados (todos os "Backgrounds" do
  React Bits).
- Fade-in de cada seção ou cartão ao rolar; scroll sequestrado; seções fixas que prendem a rolagem.
- Texto que se digita sozinho, embaralha, brilha ou treme.
- Coreografia de abertura de tela (elementos entrando um a um em toda navegação).
- Animações de exclusão "divertidas" (papel amassado, triturador): o tom do escritório é sério.
- Qualquer animação que sugira uma ação concluída antes do recibo real (envio, reserva, aprovação, protocolo).

## Como verificar

- Gravar cada interação em velocidade normal e com movimento reduzido. A Impeccable tem `motion-capture`, que depende
  do binário dela (não autorizado ainda); sem ele, gravar pela demonstração local e pelo navegador do app.
- Conferir a 60fps em 1366×768 com a lista de conversas cheia (500+ itens).
- Repetir a mesma ação rapidamente (interrupção) e pelo teclado.
- Rodar `/web-design-guidelines` nos arquivos alterados.
