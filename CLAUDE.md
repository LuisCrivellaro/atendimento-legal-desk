# CLAUDE.md

As regras técnicas do projeto estão em `AGENTS.md` (e nos `AGENTS.md` das subpastas). Leia esse arquivo antes de
mudar qualquer coisa. Este arquivo só acrescenta o contexto do redesenho visual; não substitui nada do `AGENTS.md` nem
do `README.md`.

## Redesenho do Manager ADV (iniciado em 27/11/2026)

Decisões da Dra. Carolina:
- Melhorar o visual, a intuitividade e as animações do sistema que já existe. Não é um site novo nem uma reconstrução.
- Só desktop. Não há versão mobile e ela não é necessária. (Atualização de 27/11/2026: o desktop continua sendo a
  prioridade, mas nada pode quebrar em tablet e celular.)
- Nenhuma funcionalidade sai sem autorização dela; nenhuma regra de negócio, permissão, gate jurídico, rotina de
  servidor ou texto oficial muda por causa do redesenho.

Documentos, nesta ordem:
1. `docs/research/RESEARCH_SUMMARY.md`: resumo da Etapa 01 (empresa, sistema, problemas).
2. `docs/DESIGN_PRINCIPLES.md`: os 50 princípios do projeto e como se aplicam aqui.
3. `docs/research/CREATIVE_DIRECTION.md`: direção criativa ("o fio do processo").
4. `docs/research/DESIGN_SYSTEM.md`: cores, tipografia, espaço, raios, componentes-base, acessibilidade.
5. `docs/research/MOTION_GUIDELINES.md`: animações e microinterações.
6. `docs/research/UX_STRATEGY.md` e `docs/research/CONVERSION_STRATEGY.md`.
7. `docs/research/FRONTEND_COMPONENTS.md`: componentes escolhidos e descartados (React Bits, Uiverse, shadcn/Radix).
8. `docs/research/FUNCTIONAL_REQUIREMENTS.md`: o que preservar, aprimorar, corrigir, adicionar ou reavaliar, e a
   matriz de comparação funcional que precisa fechar sem regressão antes da entrega.
9. `docs/research/IMPLEMENTATION_PLAN.md`: fases, critérios de pronto e decisões pendentes.

Etapa 01 completa: `COMPANY_PROFILE.md`, `BRAND_IDENTITY.md`, `CONTENT_INVENTORY.md`, `ASSETS_INVENTORY.md`,
`WEBSITE_AUDIT.md`, `REDESIGN_OPPORTUNITIES.md` e `capturas/` em `docs/research/`.

## Redesenho completo do front-end (27/11/2026)

Segunda rodada, pedida pela Dra.: proporção, hierarquia, densidade e acabamento de todas as telas, sem perder nenhuma
página, funcionalidade, informação ou ação. O que vale a partir dela (prevalece sobre `docs/research/DESIGN_SYSTEM.md`
quando houver diferença):
- `docs/DESIGN_SYSTEM.md`: o sistema implementado (tokens, tamanhos, componentes base, classes `.superficie`,
  `.tabela-dados`, `.faixa-indicadores`, `section-title` de 15px, estrutura de 56px de cabeçalho e menu de 232/56px).
- `docs/FUNCTIONAL_INVENTORY.md`: matriz de preservação; toda mudança visual precisa manter a matriz sem ❌.
- `docs/REDESIGN_QA.md`: medidas de antes e depois, testes, limitações e decisões pendentes da Dra.
- `docs/REDESIGN_PLAN.md`, `docs/FRONTEND_AUDIT.md` e `docs/AI_HANDOFF.md` (passagem de contexto para outra IA).

Regras de tamanho: texto 13–14px, secundário 12–13px (nunca abaixo de 12px), títulos de seção 15px, título de página
24px (EB Garamond), botões 32–36px, campos 36px, raio 6–8px, espaçamento em múltiplos de 4px. Nada de zoom ou escala
global. No Atendimento a conversa é o elemento central; os avisos críticos nunca ficam escondidos.

## Identidade visual (obrigatória)

`docs/IDENTIDADE_VISUAL.md` é a referência. Em resumo:
- O nome da plataforma é sempre **MANAGER ADV**; a logo "CS" (`src/assets/brand/`) é só o símbolo e não pode ser
  redesenhada, recolorida nem distorcida.
- Turquesa da logo `#00C9CB` como identidade; `#017F80` para ação, texto de destaque e foco; neutros grafite.
- Todas as cores vêm dos tokens de `src/styles.css`. Nada de HEX solto em componente: crie o token e documente.
- Sucesso e erro continuam com as cores atuais. O alerta passou do amarelo `#FFE600` para âmbar suave (pedido da
  Dra. em 27/11/2026); tokens `pending`, `pending-foreground`, `pending-border`, `pending-strong` e `warning-*`.
- Petições (Visual Law/DOCX) mantêm o timbre e o aqua do escritório, salvo pedido da Dra.

## Skills de design

Instaladas em `~/.claude/skills` (detalhes, limitações e conflitos em `docs/SKILLS_SETUP.md`):
- `/impeccable`: o sistema é modo **Operate**. Ler `reference/craft-floor.md` antes de editar interface.
- `/humanizer`: revisar todo texto novo de interface e documentação.
- `/web-design-guidelines`: revisar os arquivos de interface alterados.
- `/ui-ux-pro-max`: consulta de estilos, UX e stack (o script precisa de Python; sem ele, ler os CSV de `data/`).
- `/design-taste-frontend` (Taste Skill): só como referência das regras anti-"cara de IA"; não usar para construir
  telas do sistema (é feita para sites institucionais e tem um hook que roda `node`).

O executável da Impeccable (captura de tela/movimento e detector) não está autorizado; não rodar sem pedido da Dra.

## Como pré-visualizar telas internas

A demonstração local (`tools/demo-navegador`, dados fictícios, nada sai do computador) é a forma de ver as telas sem
login: configuração `demo-navegador` de `.claude/launch.json` (porta 8090) ou
`node node_modules/vite/bin/vite.js --config tools/demo-navegador/vite.spa.config.ts`. Login: qualquer e-mail e senha
com 6+ caracteres. Detalhes em `tools/demo-navegador/LEIA-ME.md`.
