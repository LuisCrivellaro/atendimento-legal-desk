# Direção criativa: o fio do processo

Proposta de 27/11/2026 para o redesenho do Manager ADV (sistema interno da CS Lawyers | Advocacia, só desktop).
Base: `RESEARCH_SUMMARY.md`, `BRAND_IDENTITY.md`, os 50 princípios (`../DESIGN_PRINCIPLES.md`) e as skills
(`../SKILLS_SETUP.md`). Detalhes de tokens em `DESIGN_SYSTEM.md`; movimento em `MOTION_GUIDELINES.md`.

## Ponto de partida

A Impeccable classifica o sistema no modo Operate: a equipe abre o Manager ADV para concluir tarefas (responder um
cliente, aprovar uma minuta, registrar um protocolo). Nesse modo a marca aparece em quatro coisas e só nelas:
tipografia, paleta, densidade e uma assinatura visual. A navegação e os controles continuam os padrões que todo mundo
já sabe usar (menu lateral, abas, campos, tabelas, paleta de comandos).

O visual atual já tem a matéria-prima certa: aqua `#00ACA7`, petróleo `#0F3533`, EB Garamond, o lockup
"CS LAWYERS | ADVOCACIA" com a barra aqua e a linha que liga as etapas do "Fluxo do caso" no menu. O que falta é
usar isso com intenção: hoje a régua aqua se repete em dezenas de caixas, o amarelo-limão grita em todo canto e nada
se move.

## Conceito

**Todo caso é um fio que atravessa o escritório.** Ele entra pelo WhatsApp, passa pelo contrato, pelos documentos,
pela petição, pela revisão da advogada, pelo protocolo e chega aos andamentos. A barra aqua do lockup é esse fio visto
de frente; a linha do menu é o mesmo fio visto de lado.

A assinatura do sistema é um traço aqua de 2px que aparece sempre com o mesmo significado:

1. **Onde você está.** Item ativo do menu, conversa selecionada, aba atual: o fio marca o lugar e desliza quando a
   seleção muda. (O foco do teclado usa o anel `#007F7B`, que tem contraste suficiente em qualquer fundo.)
2. **Até onde o caso chegou.** No cabeçalho de cada caso, as 10 etapas aparecem como nós ligados pelo fio. Etapas
   concluídas ficam preenchidas, a atual pulsa uma vez quando a tela abre, as futuras ficam em contorno.
3. **O que aconteceu.** Linhas do tempo (histórico do atendimento, andamentos, versões) correm sobre o mesmo fio
   vertical.

Fora desses três usos, o aqua não decora nada. É a única "assinatura" do sistema (regra da Impeccable para o modo
Operate) e nasce do próprio produto: um caso jurídico anda por etapas.

## Personalidade

Precisa, calma, acolhedora e discreta, como um escritório organizado: papel branco, tinta escura e uma cor de
destaque.

| Sim | Não |
|---|---|
| Papel, tinta, petróleo e um traço aqua | Gradientes, vidro, brilho, neon, sombras grandes |
| Títulos de página em Garamond, como num documento | Garamond em botões, rótulos ou números |
| Movimento curto que confirma uma ação | Elementos que entram dançando ao abrir a tela |
| Cor com significado (crítico, atenção, concluído) | Amarelo-limão em tudo que é aviso |
| Linguagem de escritório ("Enviar horários", "Aprovar minuta") | Jargão de servidor ("rotina monitorar-ana", "erro 500") |

## Direção de arte

**Mundo visual.** Um escritório de papel e tinta. O fundo do conteúdo é um cinza-esverdeado claro (`#F4F7F7`), as
superfícies de trabalho são brancas e separadas por linhas finas (1px), sem caixas dentro de caixas. O menu lateral e
o painel do login são petróleo, a "estrutura" do escritório. Sombras só em camadas que flutuam (menus, diálogos,
avisos).

**Composição por tela.** Cada tela tem uma área principal e áreas de apoio, e o olho deve ir primeiro para a principal:

| Tela | Área principal | Apoio |
|---|---|---|
| Painel | "O que fazer hoje" | Prazos e eventos; carteira (gráficos e tabela) |
| Atendimento | A conversa | Lista de conversas; painel do cliente |
| Produção / Auditoria / Protocolo | O documento ou checklist em trabalho | Cabeçalho do caso fixo; barra de ações |
| Clientes / Processos | A tabela | Filtros e ficha lateral |
| Configurações | O formulário da seção | Navegação lateral de seções |

**Cabeçalho do caso.** Componente novo, compartilhado por Produção, Auditoria, Protocolo e Andamentos: nome do cliente
em Garamond, código do atendimento, área (Trabalhista, Cível/Família, Previdenciário), responsável, situação da
aprovação e o fio das 10 etapas. Fica fixo no topo quando a tela rola. Substitui o seletor "Buscar cliente + caso"
atual, que vira uma busca com sugestões dentro do próprio cabeçalho.

**Atendimento.** Continua parecido com o WhatsApp Web, porque a equipe usa o WhatsApp o dia inteiro e esse
reconhecimento é valioso. Mudam a cor das bolhas de saída (tom aqua claro da marca no lugar do verde do WhatsApp, a
confirmar com a Dra.), o fundo (padrão próprio ou liso, no lugar da arte do WhatsApp) e a área acima das mensagens:
as várias faixas amarelas viram um único bloco "Precisa de atenção" recolhível, com o "Próximo passo" como ação
principal.

## Paleta (resumo)

Detalhes e valores de contraste em `DESIGN_SYSTEM.md`.

- **Petróleo** `#0F3533`: estrutura (menu lateral, login, tooltips).
- **Aqua da marca** `#00ACA7`: o fio sobre o petróleo (menu, login) e detalhes da marca. No branco tem só 2,8:1, por
  isso sobre fundos claros o fio usa `#00938E` (3,8:1), um tom do mesmo aqua.
- **Aqua de ação** `#007F7B`: botões primários, links e anel de foco (4,9:1 com branco).
- **Papel e tinta**: `#FFFFFF`, `#F4F7F7`, `#141A1A`, cinzas esverdeados para texto secundário e linhas.
- **Semânticas**: vermelho para crítico (prazo fatal, erro), âmbar para atenção (pendência), verde para concluído.
  O amarelo `#FFE600` sai do sistema.

## Tipografia (resumo)

- **EB Garamond 600**: título da página (28px), nome do cliente no cabeçalho do caso, lockup, tela de login, prévia da
  peça (Visual Law). É a "voz de documento" do escritório.
- **Inter 400/500/600**: tudo o mais. Corpo 14px, secundário 13px, metadados 12px, títulos de seção 15–16px em 600.
- **Números** em Inter com `tabular-nums` (prazos, contagens, valores), para alinhar em colunas.

## Imagens e ícones

- Não há fotografia no sistema e não precisa haver. Avatares mostram a foto do WhatsApp quando existe, ou iniciais
  num tom da paleta (hoje são cores aleatórias; passam a ser 6 tons derivados do petróleo/aqua).
- Ícones: `lucide-react` (já instalado), traço 1,75, tamanhos 16 e 20px, um ícone diferente por item de menu. Sem
  emoji como ícone na interface (os emojis continuam nas mensagens oficiais enviadas ao cliente, que são aprovadas pela
  Dra.).
- Estados vazios com uma frase útil e a ação seguinte ("Nenhuma conversa aguardando. As novas aparecem aqui em tempo
  real."), sem ilustrações genéricas.

## Linguagem

- Caixa de frase em títulos e botões.
- Botões com verbo e objeto ("Enviar horários", "Registrar andamento"), nunca "OK" ou "Continuar".
- Avisos com o problema e a saída: "Lembretes pausados: a rotina automática não rodou nos últimos 15 min. Ver
  detalhes". O detalhe técnico vai para "Ver detalhes".
- "Anne" em toda a interface (hoje há "Ana" em alguns pontos).
- Estados de envio sempre honestos: "Enviado", "Simulado (canal desligado)", "Falhou: confira antes de reenviar".
- Revisar todo texto novo com a Humanizer.

## Movimento (resumo)

Movimento para estado, feedback e continuidade (ver `MOTION_GUIDELINES.md`). Um único momento autoral: quando um caso
muda de etapa, o fio avança até o próximo nó (cerca de 450ms). O resto é rápido (150–250ms) e quase invisível:
indicador do menu deslizando, sublinhado da aba, bolha enviada, check desenhado, skeletons no carregamento. Nada de
parallax, 3D ou narrativa por rolagem dentro do sistema.

## Estrutura de "história" do sistema

A história que o sistema conta é a do caso, sempre na mesma ordem e com os mesmos nomes:

1. Atendimento inicial → 2. Contrato assinado → 3. Coleta de documentos → 4. Produção → 5. Auditoria IA →
6. Auditoria humana → 7. Autuação → 8. Protocolo → 9. Cadastro ProJuris → 10. Andamentos.

O menu "Fluxo do caso", o fio no cabeçalho do caso, o quadro da Produção e os filtros do Painel usam essa mesma
sequência e os mesmos rótulos.

## Estratégia comercial (resumo)

O sistema não vende para visitantes. O papel comercial dele é ajudar a equipe a converter contatos em consultas e
consultas em contratos, com ética OAB. Detalhes em `CONVERSION_STRATEGY.md`.

## Desktop e mobile

Só desktop, por decisão da Dra. Faixa de trabalho: 1280 a 1920px, com atenção a 1366×768 (notebooks comuns). O código
atual tem regras para telas pequenas (menu vira gaveta, lista em cima da conversa); elas são mantidas como estão, sem
investimento novo.

## O que esta direção não faz

- Não troca a marca nem cria logotipo novo sem material da Dra. (um monograma "CS" é proposto como favicon, a aprovar).
- Não muda regras de negócio, permissões, textos oficiais nem gates jurídicos.
- Não copia o visual de outro produto. As referências do React Bits e do Uiverse entram como comportamento adaptado.
