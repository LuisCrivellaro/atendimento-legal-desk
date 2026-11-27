# CLAUDE.md

As regras técnicas do projeto estão em `AGENTS.md` (e nos `AGENTS.md` das subpastas). Leia esse arquivo antes de
mudar qualquer coisa. Este arquivo só acrescenta o contexto do redesenho visual; não substitui nada do `AGENTS.md` nem
do `README.md`.

## Redesenho do Manager ADV (iniciado em 27/11/2026)

Decisões da Dra. Carolina:
- Melhorar o visual, a intuitividade e as animações do sistema que já existe. Não é um site novo nem uma reconstrução.
- Só desktop. Não há versão mobile e ela não é necessária.
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

A demonstração local (`tools/demo-navegador`, dados fictícios) é a forma de ver as telas sem login. Hoje ela precisa
dos adaptadores descritos em `docs/research/RESEARCH_SUMMARY.md` ("Como reproduzir a navegação da demonstração") até
a Fase 0 do plano incorporá-los ao `tools/`.
