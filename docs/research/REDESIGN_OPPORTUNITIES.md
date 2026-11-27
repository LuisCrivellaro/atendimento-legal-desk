# Oportunidades de melhoria — Manager ADV (visual, intuitivo e animado)

> Recomendações (27/11/2026) para **evoluir o sistema existente**, não reconstruir. Escopo: **desktop**.
> Restrição central: **nenhuma mudança de regra de negócio, de permissão ou de gate jurídico** — só apresentação,
> organização e movimento (ver `AGENTS.md` e "Regras que não podem ser quebradas" no `README.md`).
> Base: `WEBSITE_AUDIT.md`, `CONTENT_INVENTORY.md`, `BRAND_IDENTITY.md`.

## 1. Princípios

1. **Calma e precisão**: a equipe passa o dia no sistema. Movimento curto e funcional; cor forte só para o que exige ação.
2. **Uma ação, um lugar**: cada tarefa tem um caminho principal visível; atalhos continuam, mas não competem.
3. **Transparência sem ruído**: o que é simulado/real continua dito, em forma de selo discreto e "Ver detalhes",
   não em parágrafos técnicos.
4. **Marca CS Lawyers na frente**: aqua + petróleo + Garamond; nada de marcas de terceiros na primeira impressão.
5. **Não mudar comportamento**: textos oficiais, confirmações e gates permanecem; só a forma muda.

## 2. Pré-requisito técnico (antes de reestilizar)

- **Quebrar o JSX de linha única** em componentes legíveis nas telas que serão redesenhadas (`production.tsx:35`,
  `atendimento.tsx:111,171`, `audit.tsx:14`, `movements.tsx:14`, `protocol.tsx`, `settings.tsx`, `training.tsx`,
  `clients.tsx`, `connection-status.tsx`). Refatoração mecânica, sem mudar lógica, com a suíte de testes passando.
- **Tokens primeiro**: mover as cores fixas para `src/styles.css` (tokens) antes de mexer nas telas.
- **Pré-visualização**: manter a demonstração (`tools/demo-navegador`) funcionando para revisar o redesenho sem dados
  reais. Hoje ela precisa de adaptações (aliases para `@lovable.dev/mcp-js`, `node:crypto` e métodos `not/lt/or` no
  Supabase falso) — vale incorporá-las ao `tools/` em uma tarefa separada.

## 3. Ganhos rápidos (baixo risco, alto impacto)

| # | Mudança | Onde |
|---|---|---|
| 1 | Trocar `--pending #FFE600` por âmbar sóbrio (fundo `#FDF3D8`, texto `#7A4B00`, borda `#E8B44C`) e usar vermelho só em prazo fatal/erro | `src/styles.css`, badges, pílulas, barras |
| 2 | Favicon/monograma CS; ocultar selo "Edit with Lovable"; traduzir 404/erro e rótulos "Close"/"Sidebar" | `public/`, `__root.tsx`, `ui/dialog.tsx`, `ui/sheet.tsx`, `ui/sidebar.tsx` |
| 3 | Padronizar nomes: "Anne" em toda a UI; menu "Painel" = H1 "Painel"; "Aprovações" → "Revisões e prazos" (ou mover aprovação para lá — decisão da Dra.) | rótulos |
| 4 | Ícones distintos para Processos e Andamentos processuais | `app-sidebar.tsx` |
| 5 | Esconder do menu o que o perfil não acessa (Contencioso para não sênior) — visual apenas; o servidor continua barrando | `app-sidebar.tsx` |
| 6 | `noindex` + `robots.txt` com `Disallow: /` | `__root.tsx`, `public/robots.txt` |
| 7 | Corrigir exibição de data de evento (perícia 11/11 14h30 aparecendo 10/11 21:00) e filtrar eventos passados do Painel | `assessor.tsx`, `src/lib/assessor.ts:8` |
| 8 | Remover o seletor de caso de Treinamento e Configurações | `OfficePage` |
| 9 | Substituir `window.confirm` por `AlertDialog` estilizado (já existe em `ui/`) | ~10 chamadas |
| 10 | Mensagens técnicas → frase curta + "Ver detalhes" (monitor parado, erro 500, Inngest, códigos T, papéis crus) | Atendimento, Contencioso, Clientes, Configurações |

## 4. Sistema visual proposto (evolução, não ruptura)

- **Cores**: manter aqua `#00ACA7`, ação `#007F7B`, petróleo `#0F3533`; criar escala neutra quente-esverdeada para
  superfícies (fundo `#F4F7F7`, cartão `#FFFFFF`, cartão elevado com sombra `--shadow-soft`); semânticas: sucesso verde,
  atenção âmbar, crítico vermelho, informação aqua.
- **Tipografia**: manter EB Garamond (H1/H2, números de KPI) + Inter. Escala sugerida: H1 32px · H2 22px · H3 17px ·
  corpo 14–15px · secundário 13px · mínimo 12px. KPIs em Garamond 32–40px com rótulo Inter 13px.
- **Superfícies**: menos `section-title`; usar a régua aqua só em títulos de seção principais; cartões com raio 10–12px,
  sombra suave e hover elevando 1–2px.
- **Status**: pílulas com ícone + texto (não só cor), mesmo componente em todas as telas.
- **Densidade**: duas densidades — "confortável" no Painel e telas de leitura; "compacta" no Atendimento e tabelas.

## 5. Animação (o "mais animado")

Personalidade de movimento: **rápido, suave, sem quique**. Durações 120–240 ms; easing `cubic-bezier(.2,.8,.2,1)`;
sempre respeitar `prefers-reduced-motion`.

| Onde | Movimento proposto |
|---|---|
| Troca de página | Fade + deslocamento de 6–8px do conteúdo (`View Transitions API` ou CSS) e barra de progresso fina aqua no topo durante loaders |
| Carregamento | **Skeletons** com brilho suave no lugar de "Carregando…" (Painel, listas, tabelas, painel do cliente) |
| Menu lateral | Indicador ativo deslizando entre itens; badges com "pop" ao mudar o número |
| Painel | Contadores dos KPIs contando até o valor; cartões entrando em cascata (stagger 30–40 ms); gráficos com cores da marca |
| Atendimento — lista | Conversa que recebe mensagem sobe com animação de layout; não lidas com pulso discreto uma vez |
| Atendimento — conversa | Bolha enviada entra com slide+fade; tique passa de relógio → ✓ → ✓✓ com transição; indicador de "Anne escrevendo/IA sugerindo" |
| Faixas de aviso | Entrada/saída com altura animada; agrupadas num único "centro de avisos" recolhível |
| Abas | Sublinhado aqua deslizando; conteúdo com fade curto |
| `<details>`/acordeões | Abrir/fechar com altura animada (Radix Collapsible/Accordion já instalados) |
| Checklist e etapas | Barra de progresso animada; check com traço desenhado; etapa concluída com transição de cor ao longo da linha do fluxo |
| Ações concluídas | Toast com ícone animado; botão primário com estado "salvo ✓" por 1,5 s |
| Kanban (Quadro) | Cartões com hover elevado; reordenação animada |

**Ferramenta**: começar com CSS + `tw-animate-css` (já instalado) e View Transitions; adicionar `motion` (sucessor do
framer-motion) só para animações de layout de listas (Atendimento, Quadro) — decisão a confirmar com a Dra.

## 6. Melhorias por tela

### Painel ("Assessor")
- Reorganizar em 3 faixas: **Hoje** ("O que fazer hoje" em destaque, com ações diretas) → **Prazos e eventos**
  (uma só visão: fatais, a vencer, audiências/perícias, retornos de sexta) → **Carteira** (gráficos + tabela).
- Eliminar duplicidades de prazos; uma única faixa de KPIs (6) com cor por significado e "0" neutro.
- Gráficos com rótulos legíveis (barras horizontais), cores da marca, estados vazios ilustrados.

### Atendimento
- **Centro de avisos**: as ~9 faixas viram uma única barra "Precisa de atenção (N)" recolhível acima da conversa, com
  prioridade (crítico > atenção > info) e o **Próximo passo** como ação principal destacada.
- Cabeçalho mais limpo: nome + etapa (stepper compacto de 10 pontos) · modo da Anne como segmento colorido ·
  "Trato feito" como botão primário normal (sem caixa-alta) · "Próxima" · menu.
- Compositor: rótulos visíveis no hover/foco, agrupar "Mensagens prontas" + "/" num só ponto; dica de atalhos (`?`).
- Painel do cliente com botão de recolher; abas com ícones; dados em lista de definição bem alinhada.
- Esc: limpar busca/fechar popover antes de fechar a conversa.
- Diálogos "Automações" e "Canal e Agente" → **página/aba de configurações do Atendimento** (largura total, seções
  com navegação lateral), em vez de modais estreitos.
- Papel de parede próprio da marca (ou liso) e bolhas alinhadas à paleta (manter o reconhecimento de "chat").

### Produção / Auditoria / Protocolo (o fluxo jurídico)
- **Cabeçalho de caso unificado** nas três telas: cliente, área, etapa (stepper visual de 10 etapas clicável),
  responsável, status de aprovação — e o seletor de caso como busca com autocomplete.
- Produção: barra de ações única à direita (Salvar · Gerar minuta · Aprovar · Enviar à auditoria) com estados claros;
  indicador "alterações não salvas"; legenda da classificação A–F (tooltip); lista de arquivos com miniatura.
- Auditoria: 16 itens como **checklist com progresso** (x/16), itens recolhíveis, filtro "só pendentes", status
  colorido por item.
- Protocolo: transformar em **etapas verticais** (Autuação → Registro externo → Confirmação da sênior), com o bloqueio
  explicado no topo; botões "Simular…" desabilitados com explicação quando o canal real está ativo.

### Aprovações
- Esclarecer o papel: fila de revisão com responsável e prazo; ação "Abrir para aprovar" leva direto à aba da minuta
  em Produção. Badge no menu com pendências.

### Andamentos e Contencioso
- Diferenciar visualmente "registro manual" × "ProJuris oficial" (selo e ícone); linha do tempo com marcadores por
  tipo (audiência, perícia, prazo); rodapé técnico → "Sobre esta fonte".

### Clientes
- Lista de clientes também para perfis não sênior (os próprios casos); ficha do cliente com cabeçalho rico (iniciais,
  status, contatos com copiar) e abas.

### Treinamento de IA, Configurações, Integrações
- **Configurações** com navegação lateral: Meu perfil · Atendimento (automações, secretaria, mensagens oficiais) ·
  Canal e Agente · Integrações · Monitoramento · Log de auditoria · Avançado (endpoints n8n, só admin).
- Integrações: H1 no topo; cartões por serviço com estado único e coerente (real / preparado / demonstração).
- Treinamento: sem seletor de caso; editor de instruções com prévia lado a lado.

### Login e erros
- Login: monograma, microanimação de entrada do painel petróleo, "Continuar com Lovable" traduzido ou removido;
  404/erro em português com a identidade.

## 7. Ordem sugerida (fases)

1. **Fundação** (sem mudança visível de fluxo): tokens, quebra do JSX, AlertDialog, traduções, nomes, favicon, noindex.
2. **Sistema visual e movimento base**: cartões, pílulas de status, KPIs, skeletons, transições de página/abas/menu.
3. **Atendimento**: centro de avisos, cabeçalho, compositor, configurações em página própria, animações da conversa.
4. **Fluxo jurídico**: cabeçalho de caso + stepper, Produção, Auditoria, Protocolo, Aprovações.
5. **Painel, Clientes, Contencioso, Configurações/Integrações**.

Cada fase: testes existentes passando (inclui snapshots das mensagens oficiais), revisão na demonstração, publicação
pela Dra. na Lovable.

## 8. Riscos e cuidados

- Branch conectada à Lovable: commits enviados sincronizam e aparecem no editor; nunca reescrever histórico.
- Outras sessões trabalham no mesmo checkout: mudanças por arquivo, commits só dos próprios caminhos.
- Textos oficiais (biblioteca de 19 modelos) e mensagens de segurança jurídica não podem mudar de sentido.
- Animações não podem atrasar ações críticas (envio, confirmação) nem esconder estados (enviado × simulado).
- Telas com muitos `useState` (Atendimento ~25) exigem cuidado ao extrair componentes.

## 9. Decisões pendentes da Dra.

1. "Aprovações": só renomear ou passar a aprovar a minuta ali?
2. Manter o visual "WhatsApp" na conversa (verde) ou adotar bolhas na paleta da marca?
3. Biblioteca de animação: só CSS ou incluir `motion` para listas?
4. Logo/monograma: existe arquivo oficial?
5. Substituir o papel de parede atual (provável arte do WhatsApp)?
