# Revisão e regressão do redesenho completo — MANAGER ADV

27/11/2026. O que foi conferido, como, com que resultado e o que ficou de fora. Matriz item por item:
`FUNCTIONAL_INVENTORY.md`. Sistema visual: `DESIGN_SYSTEM.md`. Medidas de antes: `FRONTEND_AUDIT.md`.

## Resumo

- Nenhuma página, funcionalidade, botão, filtro ou informação foi removida. A matriz fecha sem regressão; 9 itens
  mudaram de lugar e continuam a no máximo 1 clique (lista na seção "Mudou de lugar").
- Nenhum arquivo de regra de negócio, servidor, integração, Anne, WhatsApp ou banco foi alterado. O diff toca
  componentes de interface, estilos, o roteador (só a regra da transição de tela) e a demonstração local.
- Tipos ok, 1403 de 1403 testes passando, lint sem nenhum apontamento novo. O build de produção não roda nesta
  máquina por um problema de caminho do Windows numa biblioteca do Lovable (ver "Limitações").
- Nada foi commitado nem publicado.

## Ambiente

Demonstração local (`tools/demo-navegador`, dados fictícios, nada sai do computador), navegador embutido do app
(Chromium 156), zoom de 100%. Nenhuma mensagem real foi enviada, nenhum cadastro real foi alterado e nenhuma ação
externa foi disparada: a demonstração simula Supabase, IA e integrações.

## Antes e depois (1366 × 768)

| Medida | Antes | Depois |
|---|---|---|
| Cabeçalho global | 64px | 56px |
| Menu lateral aberto / recolhido | 255px / 48px | 232px / 56px |
| Título de página | 38px | 24px |
| Números de destaque | 30px | 22px |
| Atendimento: área das mensagens | 482 × 189px (menu aberto) | 710 × 489px (menu recolhido automaticamente; 68,7% da altura útil) |
| Atendimento: cabeçalho da conversa | 93px, 2 linhas | 56px, 1 linha |
| Atendimento: avisos | 263px aberto por padrão | 37px recolhido; críticos sempre visíveis |
| Atendimento: item da lista | 88px | 66px |
| Atendimento: painel do cliente | 340px fixo | 320px, redimensionável e recolhível |
| Painel: altura da página | 2083px | 1416px |
| Auditoria: altura da página | ~3100px | 2198px |
| Integrações: altura da página | 1174px | 827px |
| Cabeçalho de tabela / linha | 45px / 67px | 36px / 52px |
| Amarelo de alerta | `#FFE600` em blocos | âmbar suave, texto escuro (7,4:1) |

Outras resoluções (Atendimento com uma conversa aberta e o painel do cliente aberto):

| Tela | Conversa | Área das mensagens |
|---|---|---|
| 1280 × 720 | 624px de largura | 441px (66% de 664px) |
| 1440 × 900 | — | 658px |
| 1920 × 1080 | 1184px | 801px |
| 768 × 1024 (tablet) | uma linha de cabeçalho; painel na gaveta | — |
| 390 × 844 (celular) | lista em cima (210px), conversa embaixo; cabeçalho em 2 linhas | 272px |

Rolagem horizontal da página: nenhuma, em todas as telas, nas larguras 1280, 1366, 1440, 1920, 768 e 390.

## Capturas

`research/capturas/antes-redesign-1366/` (Painel e Atendimento antes) e `research/capturas/depois-redesign-1366/`:
Painel (2), Atendimento, Produção, Auditoria, Protocolo, Andamentos, Aprovações, Clientes, Processos, Treinamento,
Configurações, Integrações, Atendimento em 1280 × 720, 1920 × 1080 e tablet, Painel no celular. Só dados fictícios da
demonstração.

## Testes automáticos

| Verificação | Comando | Resultado |
|---|---|---|
| Tipos | `node node_modules/typescript/bin/tsc --noEmit -p .` | exit 0 |
| Testes | `node node_modules/vitest/vitest.mjs run` | 125 arquivos, 1403 testes, todos passando (nenhum teste foi alterado) |
| Lint (sem a regra de formatação) | `eslint --rule '{"prettier/prettier":"off"}'` nos 71 arquivos alterados | 22 apontamentos antes e 22 depois, mesmas regras e arquivos (6 erros e 16 avisos que já existiam) |
| Lint (com Prettier) | `eslint` | milhares de "Delete ␍": o Git converte para CRLF no Windows e o Prettier espera LF. Acontece igual no código antigo; não é do redesenho |
| Build de produção | `vite build` | falha antes de compilar: `@lovable.dev/mcp-js` recusa o caminho `C:\...` (problema conhecido da biblioteca no Windows) |

## Revisões com as skills

- **Impeccable** (`reference/craft-floor.md`, modo Operate): saíram as faixas laterais coloridas (`section-title`,
  `border-l-4`, barra do item ativo do menu, seleção da lista), os cartões dentro de cartões e o bloco amarelo. Barras
  de rolagem, seleção de texto, cursor e números de tabela no tom do sistema.
- **Web Design Guidelines** (arquivos globais): acrescentados "Pular para o conteúdo", `autocomplete`/`name` no login,
  `spellCheck` desligado no e-mail, status de carregamento com texto na busca rápida, `translate="no"` em MANAGER ADV,
  `overscroll-behavior: contain` em diálogos e gavetas, `scroll-padding-top` para o cabeçalho fixo não cobrir o foco,
  `text-wrap: balance` no título da página. Não aplicado: Title Case (não vale para o português, conflito 4 de
  `SKILLS_SETUP.md`) e estado de filtros na URL (seria mudança de funcionamento).
- **UI/UX Pro Max** (`data/ux-guidelines.csv`): conferidas as diretrizes de foco não coberto por elementos fixos (100),
  redimensionar sem depender só de arrastar (103: as alças aceitam setas, Home/End e Enter), conteúdo que não pula ao
  carregar (19: skeleton com o mesmo formato da faixa de indicadores), chips (115: linha com rolagem, nada cortado) e
  erros persistentes (138: os avisos de erro não somem sozinhos).
- **Humanizer**: aplicada na redação dos documentos desta rodada (frases diretas, sem enfeite).
- **Taste Skill**: usada só como referência das regras contra "cara de IA" (sem gradiente em texto, sem eyebrow, sem
  métrica gigante como enfeite).

## Atendimento: critério de aviso crítico

Com o centro de avisos recolhido, continuam visíveis numa linha:
1. Status da Anne (só aparece com erro, prioridade, Anne pausada ou humano na conversa): vermelho com erro, âmbar nos
   outros casos.
2. Aviso da equipe marcado como prioridade.
3. Pendência do advogado cuja mensagem ao cliente ficou "incerta" ou "não enviada".
4. Checklist T09 sem recibo do WhatsApp.
5. Erro ao carregar as notícias processuais.

"Automações paradas", "IA pausada" e as falhas de envio nas bolhas nunca passaram pelo centro e continuam sempre à
vista.

## Mudou de lugar (⚠️)

| Item | Onde está agora |
|---|---|
| Painel: saudação e data | descrição sob o título da página |
| Painel: filtros | logo acima da tabela que eles filtram (os gráficos usam todos os casos) |
| Atendimento: ações do centro de avisos | a 1 clique, em "Precisa de atenção · N"; críticos visíveis |
| Atendimento: "Trato feito" e "Próxima" | viram ícone com dica quando a conversa tem menos de 640px |
| Produção: "Pendências da minuta" | acima do editor (antes abaixo de 620px de editor) |
| Auditoria: progresso x/16 | na linha do selo |
| Andamentos: "Nova" | na linha da data |
| Clientes: "Integração ProJuris" | ações do cabeçalho |
| Treinamento: "Restaurar como rascunho" | linha do título de cada versão |

## Correções feitas na revisão

- Transição de tela: só acontece ao trocar de tela com o app já aberto e visível. No primeiro carregamento e em aba em
  segundo plano a troca é direta (antes, com a página oculta, o carregamento podia ficar esperando a animação).
- Selo de prontidão (Auditoria e Protocolo): o subagente tinha passado "NÃO APTO" para vermelho. Voltou aos dois tons
  de antes (verde "apto", âmbar para o resto), porque todo caso novo começa "NÃO APTO" e o vermelho deixaria a tela em
  alerta permanente.
- Cabeçalho no celular: o botão do menu encolhia para 21px; agora fica com 32px e o nome do perfil fica só para leitor
  de tela em telas pequenas.

## Para a Dra. decidir

Textos novos de interface (só visuais, nenhuma mensagem a cliente):
- estados vazios: "Nenhuma pendência registrada.", "Nenhum tema cadastrado.", "Nenhum exemplo revisado.",
  "Nenhum processo vinculado a este cliente.";
- rótulos e dicas: "Fase:", "Minutas" (título de seção em Aprovações), "Marcar como lida" (dica do botão "Nova"),
  "Ver aviso(s)" e "Recolher" (centro de avisos), "Trato feito: cliente aprovou iniciar o processo" e "Próxima: abrir
  a próxima conversa…" (dicas), "Consultando integrações…", "Tentar novamente" nos erros do Painel e de Aprovações;
- "(falha)" no lugar do símbolo ⚠ no histórico do monitor e o rótulo do aviso de PIX sem o emoji;
- itens da Auditoria com cor por resposta (SIM verde, NÃO vermelho, PENDENTE âmbar).

## Limitações (não testado ou testado só pelo código)

- Build de produção: bloqueado pelo `@lovable.dev/mcp-js` no Windows. O build da demonstração precisa de
  `vite-plugin-singlefile`, que não está instalado (não instalamos dependências). O servidor de desenvolvimento
  compilou e abriu todas as telas.
- Dados que a demonstração não tem: carteira ProJuris, tabelas e ficha do Contencioso com processos, lista "Meus
  clientes" (a demo entra sempre como sênior), lista do "1 Start" com arquivos, editor de instruções operacionais
  (`podeEditar` falso na demo). Conferidos pela estrutura, pelos estados vazios e pelo código.
- Ações que gravam ou enviam (Enviar, Aprovar, Sincronizar, Importar, Excluir) não foram clicadas.
- Animações: com o painel do navegador oculto o emulador não desenha quadros; as transições foram conferidas pelo
  código e pelos estados finais, não quadro a quadro.
- Leitor de tela real não foi usado; a acessibilidade foi conferida pela árvore de acessibilidade e pelos atributos.

## Pendências sugeridas (próxima rodada)

- Classes compartilhadas que os subagentes repetiram à mão: selo de status fixo (sucesso/atenção/erro sem
  `role="alert"`), `<select>` nativo com o visual do campo, estado vazio discreto dentro de superfície, linha do tempo
  (fio + marcador), controle segmentado, aviso de erro com ação, `Badge` com quebra de linha opcional.
- Aba "Consulta e histórico" do painel do cliente quebra em duas linhas com o painel em 320px.
- O lint com Prettier só fica limpo com `core.autocrlf=false` ou `endOfLine: "auto"` no Prettier (decisão de projeto,
  não feita aqui).
