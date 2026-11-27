# Passagem de contexto para outra IA ou pessoa — front-end do MANAGER ADV

Para quem vai continuar o front-end depois do redesenho completo de 27/11/2026. Leia isto antes de mexer em
qualquer tela.

## O que é o sistema

MANAGER ADV é o sistema interno do escritório CS Lawyers | Advocacia (Dra. Carolina Santos): atendimento de
clientes pelo WhatsApp com a assistente de IA Anne, produção de petições, aprovações, auditoria, protocolo,
andamentos, clientes e contencioso. Publicado em https://atendimento-legal-desk.lovable.app (projeto ligado ao
Lovable). Pilha: TanStack Start/Router 1.170, React 19, Tailwind 4, shadcn/Radix, Supabase.

## Regras que não se negociam

1. Nada sai: nenhuma página, funcionalidade, informação, botão, filtro ou etapa de fluxo pode ser removida ou ficar
   menos acessível por causa de visual. Matriz de preservação: `FUNCTIONAL_INVENTORY.md`.
2. Visual não muda regra de negócio, permissão, gate jurídico, integração, Anne/agentes de IA, WhatsApp, backend ou
   banco. Textos oficiais (biblioteca de mensagens, petições) não mudam.
3. Identidade (`IDENTIDADE_VISUAL.md`): nome sempre MANAGER ADV; logo "CS" intocada; turquesa `#00C9CB` como
   identidade e `#017F80` para ação/foco; neutros grafite; alerta em âmbar suave (o amarelo `#FFE600` foi aposentado).
4. Toda cor, tamanho, sombra e raio vem dos tokens de `src/styles.css`. Faltou um? Crie o token e documente em
   `DESIGN_SYSTEM.md`.
5. Não publicar em produção nem fazer commit sem autorização da Dra.

## Onde está cada coisa

| Assunto | Arquivo |
|---|---|
| Tokens, classes de página, movimento | `src/styles.css` |
| Componentes base | `src/components/ui/*` (shadcn ajustado) |
| Cabeçalho, menu, recolher menu no Atendimento | `src/routes/_authenticated/route.tsx`, `src/components/app-sidebar.tsx`, `src/components/ui/sidebar.tsx` |
| Cabeçalho e contêiner de página, barra do caso | `src/components/office/shared.tsx` (`PageHeader`, `paginaClasse`, `OfficePage`, `Section`, `Empty`) |
| Atendimento | `src/routes/_authenticated/atendimento.tsx` + `src/components/office/attendance-*`, `chat-messages.tsx`, `centro-avisos.tsx` e vizinhos |
| Confirmações, skeletons | `src/components/confirmar.tsx`, `src/components/skeletons.tsx` |

## Documentos desta rodada

`REDESIGN_PLAN.md` (plano e estado), `FRONTEND_AUDIT.md` (medidas de antes), `FUNCTIONAL_INVENTORY.md` (matriz),
`DESIGN_SYSTEM.md` (o que foi implementado), `REDESIGN_QA.md` (testes e comparação), `SKILLS_SETUP.md` (skills de
design). Pesquisa anterior: `research/` (começar por `research/RESEARCH_SUMMARY.md`).

## Como trabalhar

- Muitos componentes têm JSX em linhas muito longas. Edite trechos com substituição exata; não reformate arquivos
  inteiros (outras sessões trabalham no mesmo checkout e o diff fica ilegível).
- Pré-visualização sem login real: demonstração local em `tools/demo-navegador` (dados fictícios, nada sai do
  computador). `node node_modules/vite/bin/vite.js --config tools/demo-navegador/vite.spa.config.ts` ou a
  configuração `demo-navegador` de `.claude/launch.json` (porta 8090). Qualquer e-mail e senha com 6+ caracteres.
- Verificação: `node node_modules/typescript/bin/tsc --noEmit -p .` e `node node_modules/vitest/vitest.mjs run`.
  `vite build` pode falhar no Windows por causa do caminho no `@lovable.dev/mcp-js` (ambiente, não código).
- Conferir em 1280×720, 1366×768, 1440×900 e 1920×1080 a 100% de zoom; nada de escala global.
- Skills de design instaladas em `~/.claude/skills` (ver `SKILLS_SETUP.md`): Impeccable (modo Operate, ler
  `reference/craft-floor.md`), Humanizer (textos), Web Design Guidelines (revisão), UI/UX Pro Max (consulta).

## Pendências conhecidas

Ver a seção "Pendências" de `REDESIGN_QA.md`.
