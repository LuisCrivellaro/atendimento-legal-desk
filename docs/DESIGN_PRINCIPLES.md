# Os 50 princípios do projeto

Diretrizes permanentes definidas pela Dra. em 27/11/2026, vindas dos estudos de UI/UX, front-end, motion design,
storytelling, desenvolvimento e vendas. Orientam pesquisa, design, desenvolvimento, revisão e otimização.

Não são uma lista de efeitos obrigatórios. Cada princípio vale quando faz sentido para a empresa, o público e o
objetivo da tela. A coluna da direita diz como cada um se aplica ao **Manager ADV**, que é uma ferramenta interna da
equipe, usada só no computador (decisão da Dra.). Onde um princípio foi pensado para site institucional, a coluna
explica a adaptação.

## 01 · Direção criativa e identidade

| # | Princípio | No Manager ADV |
|---|---|---|
| 1 | **Originalidade:** nunca produzir sites genéricos. | Fugir do visual "painel shadcn padrão": assinatura própria (o fio do processo, ver `research/CREATIVE_DIRECTION.md`) |
| 2 | **Identidade:** respeitar a personalidade da marca. | Aqua `#00ACA7`, petróleo `#0F3533`, EB Garamond, lockup tipográfico, tom sóbrio e acolhedor |
| 3 | **Referências:** buscar inspiração, não copiar. | Componentes do React Bits/Uiverse entram adaptados; nenhum layout de outro produto é reproduzido |
| 4 | **Direção de arte:** criar composições intencionais. | Cada tela tem uma área principal de trabalho; o resto é apoio |
| 5 | **Hero:** causar impacto imediatamente. | Em ferramenta, o "primeiro impacto" é saber o que fazer: "O que fazer hoje" no Painel e "Próximo passo" na conversa. O login tem a única entrada animada |
| 6 | **Storytelling:** construir uma narrativa visual. | A narrativa é o caminho do caso pelas 10 etapas, mostrado sempre do mesmo jeito |
| 7 | **Hierarquia:** destacar informações realmente importantes. | Prazo fatal, conversa aguardando e aprovação pendente acima de tudo; o resto recolhido |
| 8 | **Autenticidade:** evitar aparência de IA. | Sem gradientes, brilhos, vidro ou ícones decorativos; textos revisados com a Humanizer |
| 9 | **Consistência:** manter uma linguagem visual. | Um botão primário, um cartão, uma pílula de status, uma escala de espaço em todas as telas |
| 10 | **Propósito:** unir estética e resultados. | Toda mudança visual tem de reduzir passos, erros ou tempo de leitura da equipe |

## 02 · Design visual e tipografia

| # | Princípio | No Manager ADV |
|---|---|---|
| 11 | **Legibilidade:** priorizar fontes fáceis de ler. | Inter para interface e dados; corpo de 14px, nunca abaixo de 12px |
| 12 | **Peso tipográfico:** evitar textos excessivamente finos. | Pesos 400/500/600; nada abaixo de 400 |
| 13 | **Contraste:** destacar elementos e seleções. | Texto ≥ 4,5:1; item selecionado com fundo + fio aqua, não só cor do texto |
| 14 | **Espaçamento:** diferenciar distâncias conforme relacionamentos. | Escala de 4px; grupos com 8–12px, seções com 24–32px |
| 15 | **Alinhamento:** manter linhas visuais consistentes. | Grade de colunas por tela; rótulos e valores alinhados em listas de dados |
| 16 | **Agrupamento:** aproximar elementos relacionados. | Ações do caso juntas numa barra; dados do cliente numa lista de definição |
| 17 | **Border radius:** harmonizar cantos internos e externos. | Raio externo = raio interno + espaçamento interno (ver `research/DESIGN_SYSTEM.md`) |
| 18 | **Cores:** aplicar significado e contexto. | Vermelho só para crítico, âmbar para atenção, verde para concluído, aqua para seleção e ação |
| 19 | **Tipografia:** evitar letter spacing desnecessário. | Espaçamento extra só no lockup e nas cidades da marca; o resto em 0 |
| 20 | **Minimalismo:** simplificar sem esconder informações. | Detalhes técnicos atrás de "Ver detalhes", nunca apagados |

## 03 · UX e componentes funcionais

| # | Princípio | No Manager ADV |
|---|---|---|
| 21 | **CTAs:** utilizar textos claros e específicos. | Verbo + objeto: "Enviar horários", "Aprovar minuta", "Registrar protocolo" |
| 22 | **Linguagem:** escrever de maneira humana. | Frases operacionais curtas, sem jargão de servidor ("rotina", "erro 500", "Inngest") |
| 23 | **Formulários:** manter labels sempre identificáveis. | Rótulo visível acima de cada campo, nunca só placeholder |
| 24 | **Placeholders:** apresentar exemplos de preenchimento. | "Ex.: 0001234-56.2026.5.02.0001" no CNJ; "Ex.: maria@email.com" |
| 25 | **Máscaras:** facilitar entradas de dados. | CPF, CNJ, telefone e datas com máscara e colagem livre |
| 26 | **Validação:** mostrar erros junto aos campos. | Erro abaixo do campo, com a correção; foco vai para o primeiro erro |
| 27 | **Feedback:** comunicar ações e resultados. | Todo envio mostra estado (enviando, enviado com recibo, simulado, falhou) |
| 28 | **Seleções:** utilizar rádio ou checkbox corretamente. | Uma opção = rádio/segmentado; várias = checkbox; liga/desliga = switch |
| 29 | **Touch targets:** garantir áreas tocáveis adequadas. | Desktop: alvos mínimos de 24×24px, botões de 32–36px |
| 30 | **Onboarding:** dividir etapas e mostrar progresso. | Protocolo e Auditoria em etapas com progresso (x de 16, etapa 2 de 3) |

## 04 · Motion design e storytelling

| # | Princípio | No Manager ADV |
|---|---|---|
| 31 | **Scroll animations:** revelar conteúdo progressivamente. | Revelação por abertura (acordeões, painéis), não por rolagem |
| 32 | **Parallax:** criar sensação de profundidade. | Não se aplica dentro do sistema; profundidade vem de camadas e sombras leves |
| 33 | **Scroll storytelling:** transformar rolagem em narrativa. | Não se aplica; a narrativa é o fio das etapas |
| 34 | **Sticky sections:** fixar cenas estrategicamente. | Cabeçalho do caso e barra de ações fixos ao rolar Produção, Auditoria e Protocolo |
| 35 | **Transições:** manter movimentos fluidos e naturais. | 150–300ms, desaceleração suave, saída mais rápida que a entrada |
| 36 | **Microinterações:** responder visualmente às ações. | Botão pressionado, check desenhado, mensagem enviada, contador atualizado |
| 37 | **Animações 3D:** explorar perspectiva e imersão. | Não se aplica a uma ferramenta jurídica |
| 38 | **Sequenciamento:** sincronizar movimento e conteúdo. | O fio avança junto com a mudança de etapa; listas entram em cascata curta só na primeira carga |
| 39 | **Motion funcional:** orientar atenção e compreensão. | Movimento só para estado, feedback e continuidade |
| 40 | **Performance:** otimizar animações e respeitar acessibilidade. | Só `transform`/`opacity`; caminho para `prefers-reduced-motion` em tudo |

## 05 · Arquitetura, desenvolvimento e qualidade

| # | Princípio | No Manager ADV |
|---|---|---|
| 41 | **Responsividade:** adaptar cada experiência ao dispositivo. | Desktop de 1280 a 1920px, com atenção a 1366×768 |
| 42 | **Componentização:** desenvolver estruturas reutilizáveis. | Quebrar as telas escritas em uma linha só em componentes legíveis antes de reestilizar |
| 43 | **Acessibilidade:** garantir navegação inclusiva e funcional. | Teclado, foco visível, nomes acessíveis em português, status não só por cor |
| 44 | **Performance:** otimizar imagens, código e carregamento. | Skeletons, nada de dependência pesada para efeito simples, menos JS no login |
| 45 | **SEO:** estruturar páginas para mecanismos de busca. | Sistema interno: o objetivo é **não** ser indexado (`noindex`); semântica correta de cabeçalhos continua |

## 06 · Conversão e estratégia comercial

| # | Princípio | No Manager ADV |
|---|---|---|
| 46 | **Conversão:** transformar visitantes em oportunidades reais. | Ajudar a equipe a levar o contato do WhatsApp até a consulta e do "trato feito" ao contrato |
| 47 | **Landing pages:** construir experiências com objetivos claros. | Cada tela tem um objetivo e uma ação principal visível |
| 48 | **Propostas:** apresentar valor, não apenas preço. | O modelo de orçamento já mostra tabela OAB e condições; a interface ajuda a explicar o serviço antes do valor |
| 49 | **Negociação:** evitar descontos sem contrapartidas. | Desconto só nas condições aprovadas (à vista no PIX); nada de desconto improvisado na interface |
| 50 | **Relacionamento:** realizar follow-ups úteis e honestos. | Lembretes e retornos com recibo real, um lembrete por pendência, sem insistência (regras da OAB) |

Os princípios 46 a 50 orientam a estratégia comercial (`research/CONVERSION_STRATEGY.md`) e não viram, por si só,
funcionalidades novas.
