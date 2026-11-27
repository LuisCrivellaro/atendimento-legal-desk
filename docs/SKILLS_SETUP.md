# Skills de design do projeto

Instaladas em 27/11/2026 para o redesenho visual do Manager ADV. Ficam no nível do usuário
(`C:\Users\User\.claude\skills\`), então valem para qualquer sessão do Claude Code neste computador. Sessões na nuvem
ou em outra máquina não as têm: lá é preciso instalar de novo pelas fontes abaixo.

## Como foram instaladas

Cada repositório oficial foi clonado (`--depth 1`) numa pasta temporária, os scripts de instalação foram lidos e a
pasta da skill foi copiada à mão para `~/.claude/skills/<nome>`. Nenhum instalador, script ou binário foi executado.
Os instaladores oficiais fazem a mesma cópia (ou um link simbólico); o da Impeccable também cria um hook e baixa um
executável, e isso ficou de fora de propósito (ver "Ativação explícita").

| Skill | Pasta instalada | Origem (commit) | Licença | Tamanho |
|---|---|---|---|---|
| Impeccable 4.11.1 | `~/.claude/skills/impeccable` | <https://github.com/pbakaus/impeccable> `.claude/skills/impeccable` (2fc5e14, 26/11/2026) | Apache 2.0 | 63 arquivos, 2,2 MB |
| Humanizer 4.0.0 | `~/.claude/skills/humanizer` | <https://github.com/blader/humanizer> (a32f244, 19/11/2026) | MIT | 6 arquivos, 61 KB |
| Taste Skill 2.5.1 (`design-taste-frontend`) | `~/.claude/skills/taste-skill` | <https://github.com/leonxlnx/taste-skill> `skills/taste-skill` (952435f, 27/11/2026) | MIT | 1.631 arquivos, 35 MB |
| Web Design Guidelines 1.1.0 | `~/.claude/skills/web-design-guidelines` | <https://github.com/vercel-labs/agent-skills> `skills/web-design-guidelines` (5a37a63, 20/11/2026) | MIT | 2 arquivos, 10 KB |
| UI/UX Pro Max | `~/.claude/skills/ui-ux-pro-max` | <https://github.com/nextlevelbuilder/ui-ux-pro-max-skill> `.claude/skills/ui-ux-pro-max` (11ca2b3, 26/11/2026) | MIT | 83 arquivos, 3,7 MB |

Do repositório UI/UX Pro Max só a skill `ui-ux-pro-max` foi instalada; as outras seis do mesmo repositório
(banner-design, brand, design, design-system, slides, ui-styling) não foram pedidas.

## Para que serve cada uma neste projeto

**Impeccable.** Direção de design, crítica e auditoria. Classifica o Manager ADV no modo **Operate** (ferramenta de
trabalho): a interface tem de sumir dentro da tarefa, movimento só para estado e feedback, nada de coreografia de
carregamento, paleta contida e uma única "assinatura" visual. Comandos úteis nas próximas etapas: `/impeccable shape`
(planejar uma tela), `critique`, `audit`, `animate`, `layout`, `typeset`, `clarify`, `polish`. Antes de qualquer edição
de interface, ler `reference/craft-floor.md` (piso de qualidade e proibições).

**Humanizer.** Revisão de texto: interface, mensagens de erro, documentação, commits. Remove marcas de texto de IA
(contraste "não é X, é Y", trios forçados, travessões em excesso, negrito decorativo, frases de efeito). Não altera
fatos, nomes, números nem os textos oficiais da biblioteca de mensagens (esses são aprovados pela Dra. e não se tocam).

**Taste Skill.** Feita para sites institucionais e de produto (fotos, hero, uma seção por tela). O Manager ADV não é
isso. Aproveitamos só as regras que valem para qualquer interface: um sistema só (um par de botões, um estilo de cartão,
uma escala de raio), botões com verbo + objeto, nada de depoimentos/números inventados, nada de fade-in em toda seção,
parallax em texto ou scroll sequestrado, nada de violeta/lilás, tudo visível com movimento reduzido.

**Web Design Guidelines (Vercel).** Checklist de revisão de código de interface: acessibilidade, foco, formulários,
animação, tipografia, conteúdo, desempenho, navegação e estado na URL. Usar como `/web-design-guidelines <arquivos>`
depois de cada tela redesenhada. A regra lê as diretrizes de `references/command.md` (cópia local) ou da URL do
repositório `vercel-labs/web-interface-guidelines`.

**UI/UX Pro Max.** Base de dados de estilos, paletas, tipografia, UX e stacks. Para "Legal Services" recomenda estilo
"Accessible & Ethical + Minimalism & Swiss Style" e painel do tipo "Case Management Dashboard"; marca como
antipadrões o visual datado, credenciais escondidas e gradientes roxo/rosa de IA. A prioridade de regras dela (1
acessibilidade, 2 interação, 3 desempenho...) entra no `DESIGN_SYSTEM.md`.

## Ativação explícita e limitações

- **Impeccable, executável e hook.** O `scripts/impeccable` (e `.cmd`) baixa e roda um binário (`impeccable.exe`)
  verificado por checksum. Não foi executado. Sem ele não funcionam `impeccable context`, `shot`, `motion-capture`,
  `detect`, `live` e o hook que analisa cada arquivo editado. A skill prevê esse caso: a sessão lê PRODUCT.md/DESIGN.md
  direto e segue as referências em Markdown. Para ligar, a Dra. precisa autorizar a execução do binário.
- **Taste Skill, hook Stop.** O cabeçalho do `SKILL.md` registra um hook que, enquanto a skill está ativa, roda
  `node scripts/gate.mjs --hook claude` ao final de cada resposta. Ele só verifica sites gerados pela própria skill
  (pasta `.taste-skill`). Não invocar `/design-taste-frontend` para construir telas do Manager ADV; consultar o
  `SKILL.md` como referência.
- **UI/UX Pro Max, script de busca.** `scripts/search.py` precisa de Python 3, que não está instalado (só o atalho da
  Microsoft Store). Nesta etapa os dados foram lidos direto dos CSV em `data/` (`products.csv`, `ui-reasoning.csv`,
  `styles.csv`). Para usar o script, instalar Python 3.
- **Sessões futuras.** As skills aparecem na lista de skills de uma sessão nova (não nesta, que já tinha começado).
  Comandos: `/impeccable`, `/humanizer`, `/web-design-guidelines`, `/ui-ux-pro-max`, `/design-taste-frontend`.

## Conflitos entre as skills e como resolvemos

Critério de desempate pedido pela Dra.: acessibilidade, funcionamento, desempenho e identidade da empresa, nessa ordem.

| # | Conflito | Decisão |
|---|---|---|
| 1 | Taste Skill quer fotos, hero e "momentos" em cada página; Impeccable (Operate) proíbe coreografia em ferramenta de trabalho | Vale a Impeccable. O sistema é uma ferramenta; da Taste ficam só as regras gerais listadas acima |
| 2 | Impeccable: em produto, "uma família tipográfica costuma bastar"; a marca usa EB Garamond | Garamond fica no título da página, no nome do cliente no cabeçalho do caso, no lockup e na prévia das peças. Rótulos, botões, dados e títulos de seção em Inter |
| 3 | Impeccable recusa "barra num lado de uma caixa"; a faixa `section-title` (régua aqua + fundo claro) é motivo da marca | A régua continua nas peças (Visual Law, papel timbrado). Na interface, sai das caixas e vira o "fio" (ver `CREATIVE_DIRECTION.md`) |
| 4 | Vercel pede Title Case em títulos e botões | Não se aplica ao português. Usamos caixa de frase ("Enviar horários"), como a Humanizer também pede |
| 5 | Vercel pede aspas curvas e `…` na interface; Humanizer trata aspas curvas como marca fraca de IA em prosa | Interface: “ ” e `…` (tipografia correta em pt-BR). Documentos Markdown do repositório: aspas retas |
| 6 | UI/UX Pro Max sugere azul-marinho + dourado para escritórios de advocacia | Vale a marca: aqua `#00ACA7` e petróleo `#0F3533` (a Impeccable manda honrar a paleta definida) |
| 7 | UI/UX Pro Max e Taste pedem alvos de toque de 44px e mobile-first | O sistema é só desktop (decisão da Dra.). Alvos mínimos de 24×24px (WCAG 2.5.8) e botões de 32–36px de altura |
| 8 | Vercel exige confirmação ou desfazer em ações destrutivas; Impeccable diz que modal costuma ser preguiça | Ações jurídicas, envios ao cliente e exclusões mantêm confirmação (AlertDialog). Ações internas reversíveis ganham "Desfazer" em vez de modal |
| 9 | Princípios 31–37 do projeto (scroll storytelling, parallax, sticky, 3D); Impeccable e Taste vetam isso em ferramenta | Usamos sticky onde ajuda (cabeçalho do caso, barra de ações). Nada de parallax, 3D ou narrativa por rolagem dentro do sistema; o login pode ter uma única entrada animada |
