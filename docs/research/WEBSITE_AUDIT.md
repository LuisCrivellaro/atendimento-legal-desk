# Auditoria do sistema atual — Manager ADV

> Avaliação profissional (27/11/2026) do sistema em <https://atendimento-legal-desk.lovable.app>, para orientar a
> **melhoria visual, de intuitividade e de animação, sem reconstruir do zero**. Escopo: **desktop** (a Dra. confirmou
> que não precisa de versão mobile).
>
> Método: parte pública navegada no site publicado; telas internas navegadas na demonstração local do mesmo código
> (dados fictícios), com o HEAD local `79208ea` — que pode estar **à frente** do que está publicado (lista única do
> Atendimento ainda não publicada, segundo as notas do projeto). Medições de desempenho: uma amostra do `/auth`
> publicado. Leitura de código para confirmar comportamentos.
>
> **[O]** observado na navegação · **[Cód]** confirmado no código · **[I]** inferência · **[R]** recomendação.

## 1. Resumo da avaliação

| Dimensão | Nota (1–5) | Síntese |
|---|---|---|
| Identidade e consistência da marca | 3 | Paleta e tipografia bem escolhidas; quebradas pelo amarelo-limão, pelo verde WhatsApp, pelo favicon/selo Lovable e por textos em inglês |
| Estética e modernidade | 2,5 | Limpo, mas plano: tudo é caixa com régua, sem profundidade, ritmo ou estados visuais |
| Tipografia e paleta | 3,5 | Garamond + Inter elegantes; corpo miúdo (12–13px) e títulos desproporcionais |
| Hierarquia e organização | 2 | Páginas longas, informação repetida, até 9 faixas empilhadas no Atendimento, H1 fora de ordem |
| UX/UI | 2,5 | Funcionalidade rica e segura, mas com muitas entradas para a mesma ação, nomes confusos e ícones sem rótulo |
| Animação e microinterações | 1 | Praticamente inexistentes (só spinner e animações padrão dos popovers) |
| Responsividade (desktop) | 3,5 | Grade do Atendimento se adapta bem de 1024 a 1920px; alguns popovers/diálogos transbordam |
| Desempenho | 3 | Leve em bytes; resposta inicial lenta (SSR + Workers); sem skeletons e sem indicador nas rotas com loader |
| Acessibilidade | 2,5 | Bons rótulos ARIA em muitos botões; status só por cor, inglês em leitores de tela, confirmações nativas |
| Clareza da comunicação | 2 | Muito jargão técnico e de projeto exposto à equipe (rotinas, erro 500, T04/T12.2, Inngest, camelCase) |
| Credibilidade | 3 | Sério e cuidadoso; perde autoridade com marcas de "demonstração/simulado" espalhadas e status contraditórios |

## 2. Pontos positivos (preservar)

1. **Arquitetura de informação do fluxo do caso** no menu, com a linha ligando as 6 etapas na ordem real do escritório. **[O]**
2. **Atendimento no modelo WhatsApp Web**: três colunas, lista única, atalhos (Ctrl+K, Alt+↑/↓, Esc), "/" para
   mensagens prontas, arrastar-e-soltar arquivos, prévia antes de enviar. A equipe reconhece o padrão. **[O][Cód]**
3. **Identidade discreta e coerente com o papel timbrado**: lockup tipográfico, aqua `#00ACA7`, petróleo `#0F3533`,
   EB Garamond. **[O]**
4. **Transparência e segurança**: o sistema diz o que é simulado, nunca finge envio, pede confirmação para ações
   sensíveis, respeita papéis. É um diferencial a manter, só que com outra forma visual. **[O]**
5. **Login** bem resolvido (painel petróleo + formulário limpo). **[O]**
6. **Feedback padronizado** por toasts (`executar()`), com "Tentar novamente" em falhas. **[Cód]**
7. **Leveza**: ~259 KB transferidos no login, 236 KB de JS. **[O]**

## 3. Identidade visual e consistência

- **Amarelo `#FFE600` em excesso [O]:** badges do menu, pílulas "N pendência(s)", barras "Provas 3/6", rosca do
  gráfico, faixas de aviso, selos de status. É a cor mais forte da tela e não pertence à paleta; vira ruído e
  perde a função de alerta (capturas 03, 04, 23, 24).
- **Dois sistemas visuais [O]:** a conversa usa verde WhatsApp (`#D9FDD3`, botão `#00A884`) e papel de parede de
  doodles (aparentemente o do WhatsApp — ver `ASSETS_INVENTORY.md`); o resto usa aqua/petróleo.
- **Marcas de terceiros na frente da marca [O]:** favicon da Lovable, selo "Edit with Lovable", botão "Continue with Lovable".
- **Nomes inconsistentes [O][Cód]:** "Ana" × "Anne" ("Status da Ana", `atendimento.tsx:173`); "Assessor" (menu) ×
  "Painel de casos" (H1); "Base própria CS.IA"; "Equipe CS Advocacia" × "CS Lawyers".
- **Modo escuro** não é da marca (tokens shadcn azulados) e não tem alternador. **[Cód]**

## 4. Design, estética e modernidade

- Tudo é **caixa branca + faixa `section-title`** (régua aqua + fundo claro). Repetida dezenas de vezes por página,
  deixa de destacar e achata a hierarquia (capturas 20, 26, 27, 34). **[O]**
- **Sem profundidade nem estados**: sombras quase inexistentes, cartões sem hover, sem transições; a interface parece
  estática e "de formulário". **[O]**
- **Indicadores (KPIs) sem tratamento**: número grande solto, ícone pequeno, sem tendência nem cor por significado
  ("0 Prazos em aberto" em vermelho — captura 28). **[O]**
- **Gráficos com aparência padrão** do recharts: rótulos girados e cortados ("Coleta de documentos"), roscas enormes
  com um único valor, amarelo puro (captura 03). **[O]**
- **Botão "TRATO FEITO"** em caixa-alta e estilo próprio, destoando dos demais. **[O]**

## 5. Tipografia e paleta

- Par **EB Garamond (títulos) + Inter (texto)** adequado ao segmento. **[O]**
- **Escala desequilibrada [O]:** H1 de página grande (38px Garamond, medido a 1440px) contra corpo de 13–14px e metadados de 11–12px; a
  faixa das 10 etapas em Produção usa texto miúdo e círculos de 8px (captura 20).
- Paleta de marca boa; **semânticas mal distribuídas**: amarelo para tudo, vermelho também para zero, verde de
  sucesso pouco usado. **[O]**
- Cores fixas espalhadas no código (`#D3E6E4`, `#A9C9C6`, `#7FA6A2`, `#1B4B48`, `#008F72`, `#8696A0`…) fora dos tokens. **[Cód]**

## 6. Hierarquia visual e organização

- **Painel** longo (≈3 telas), com prazos em 4 lugares e duas faixas de indicadores (6 + 3). O "O que fazer hoje",
  mais útil, fica pequeno. **[O]**
- **Atendimento:** até ~9 faixas empilhadas entre o cabeçalho e as mensagens (Próximo passo, status, encaminhamento,
  avisos, secretaria, funil internacional, aviso de Produção, vínculo, notícias) — quase todas no mesmo amarelo —
  reduzindo a área de leitura (captura 19 mostra 4 delas). **[O][Cód]**
- **Seis mecanismos de ação rápida** no Atendimento (Próximo passo, Ações da etapa, Mensagens prontas, "/", chips,
  Agenda rápida), todos com ícones sem rótulo visível. **[Cód]**
- **Integrações:** o H1 aparece depois de dois painéis; espaçamentos duplicados (captura 35). **[O]**
- **Configurações** mistura perfil do usuário com tabela de endpoints n8n, log e integrações (captura 34). **[O]**
- **Seletor de caso** no topo de telas globais (Treinamento, Configurações) — e bloqueia a tela se não houver caso. **[O][Cód]**
- **Auditoria:** 16 cartões × 3 campos, sem progresso nem recolhimento (captura 26). **[O]**

## 7. UX/UI — atritos por tela

| Tela | Atrito | Evidência |
|---|---|---|
| Menu | Ícones repetidos; recolhido perde badges; itens visíveis para quem não tem acesso (Contencioso termina em erro) | captura 37; `contencioso.functions.ts:10` |
| Painel | Nome diferente no menu; KPI "Checklists aprovadas" com ícone de alerta; gráfico "Prazos vencidos" mostra também os a vencer | captura 03; `dashboard.tsx` |
| Atendimento | Esc fecha a conversa inteira (perde o contexto); filtros abrem por cima do menu; diálogo "Automações" estreito (32rem) com dezenas de controles e **rolagem horizontal** (scrollWidth 531 > 495); textos cortados em "Canal e Agente" | capturas 12, 14, 15 |
| Atendimento | Painel de detalhes sem botão de fechar em telas largas | `atendimento.tsx:117` |
| Produção | 5 botões de ação espalhados; classificação "A–F" sem legenda; nada indica "não salvo"; faixa de etapas ilegível | capturas 20–21 |
| Aprovações | Nome sugere aprovar, mas a aprovação da minuta é em Produção | captura 25 |
| Protocolo | "Simular autuação" e "Simular vínculo" habilitados mesmo quando falhariam com o canal real | `services/integracoes.ts:46-60` |
| Andamentos × Contencioso › Andamentos processuais | Dois "Andamentos" diferentes (manual × ProJuris) | capturas 28, 32 |
| Clientes | Quem não é sênior/admin não tem lista dos próprios clientes (filtros calculados e não exibidos) | `clients.tsx:26-29` |
| Treinamento | "Modelo Lovable AI" enquanto Integrações cita Claude | captura 33 |
| Integrações | "Conectar" só verifica; "automáticas desativadas" contradiz WhatsApp ativo | captura 35 |
| Geral | ~10 `window.confirm` nativos; `<select>` e checkbox nativos ao lado dos componentes estilizados | `grep window.confirm` |

## 8. Animação e microinterações (foco do pedido "mais animado")

**Existe hoje [Cód]:** `tw-animate-css` (fade/zoom/slide de Dialog, Popover, Select, Dropdown, Tooltip, Sheet);
`animate-spin` em 39 lugares; `transition-colors` em 2 componentes; largura do menu com transição linear de 200 ms;
animação padrão do recharts.

**Não existe [Cód]:** transição entre páginas; entrada/saída de itens de lista (novas mensagens, conversas que sobem,
cartões do quadro); troca de abas com movimento; skeletons (`ui/skeleton` não é usado); `<details>` abrem secos;
contadores que "contam"; feedback de envio na bolha (só o tique muda); progresso animado de checklist; hover em
linhas e cartões; indicador de navegação nas rotas com loader. Não há biblioteca de animação (sem `framer-motion`/`motion`).

## 9. Responsividade (desktop)

- Atendimento usa grade com quebras em 1440/1199/1050px e container queries no chat — bem feito. **[Cód]**
- Painel de detalhes vira Sheet abaixo de 1024px e **reabre sozinho a cada conversa**. **[Cód]**
- Popover de filtros invade o menu; diálogo de automações com rolagem horizontal; quadro da Produção chega à borda. **[O]**
- **[R]** Faixa alvo: 1280–1920px; testar também 1366×768 (notebooks comuns em escritórios).

## 10. Desempenho

Medição única do `/auth` publicado (navegador do app, 27/11/2026) **[O]**:

| Métrica | Valor |
|---|---|
| Tempo até o primeiro byte (TTFB) | **1,65 s** |
| DOMContentLoaded | 4,4 s |
| Load | 4,7 s |
| Transferido | 259 KB em 23 recursos (JS 236 KB · CSS 20 KB) |
| Maiores arquivos | index 96 KB · dist 54 KB · `contencioso-query` 24 KB (carregado já no login) · styles 18 KB |

- TTFB alto sugere SSR em Workers com partida a frio. **[I]**
- Chunk do Contencioso pré-carregado no login (desnecessário). **[O]**
- Painel recarrega a cada 60 s; Aprovações a cada 15 s; busca rápida a cada 15 s (enquanto aberta). **[Cód]**
- Sem skeletons: toda espera é "Carregando…" com spinner; rotas com loader (Clientes, Contencioso) ficam paradas sem
  indicação enquanto carregam. **[Cód]**

## 11. Acessibilidade

- **Bom:** `lang="pt-BR"`; muitos botões de ícone com `aria-label` ("Mais opções do atendimento", "Anexar arquivo ou
  imagem"…); foco visível em aqua. **[O]**
- **Problemas:** rótulos de leitor de tela em inglês ("Close", "Sidebar"); itens da lista de conversas e alguns
  botões sem nome acessível na árvore; status comunicados só por cor (amarelo/vermelho/verde); textos de 11–12px em
  cinza `#5B6B6B` sobre `#F4F7F7` (contraste limítrofe); `window.confirm` nativo; atalhos de teclado não documentados
  na interface. **[O][Cód]**

## 12. SEO e estrutura semântica

- É sistema interno: **não deve ser indexado**. Hoje `robots.txt` libera todos os robôs e não há `noindex`. **[O]**
  **[R]** `noindex, nofollow` + `Disallow: /`.
- Títulos de aba bons em algumas rotas; outras herdam "Manager ADV — CS Lawyers". **[O]**
- Ordem de cabeçalhos quebrada em Integrações (H2 antes do H1). **[O]**

## 13. Credibilidade e autoridade

- Transmite seriedade (marca sóbria, linguagem cuidadosa), mas **"Demonstração", "Simulado", "Não conectado"** e
  status contraditórios entre Configurações, Integrações e Atendimento fazem o sistema parecer inacabado. **[O]**
- Telas de erro/404 em inglês e selo da Lovable reduzem a percepção de produto próprio do escritório. **[O]**

## 14. Clareza da comunicação — jargão exposto à equipe

Exemplos reais da interface **[O]**: "confira o agendamento "monitorar-ana" a cada 5 minutos
(docs/automacoes-operacionais.md)"; "A consulta classificada apresentou erro 500; equivalência com "Visualizar
todos" não comprovada"; "Automática: pendente de Inngest"; "T04, T11.2, T12.2 e T12.3"; "Permissões:
advogada_senior, admin"; tabela de endpoints `enviarMensagem /webhook/whatsapp/enviar`; "Base própria CS.IA".

## 15. Problemas técnicos e funcionais encontrados

| # | Problema | Evidência | Gravidade |
|---|---|---|---|
| 1 | Painel mostra perícia de **11/11/2026 14h30** como **"10/11/2026 · 21:00"** — provável data sem hora interpretada em UTC | captura 02; `assessor.tsx` usa `dataHoraCurta(e.eventoData)` | Média (verificar com dados reais) |
| 2 | "Audiências e perícias" conta eventos **já passados** (não filtra por data) | `src/lib/assessor.ts:8` | Média |
| 3 | Diálogo "Automações do atendimento" com rolagem horizontal | captura 12 (scrollWidth 531 / clientWidth 495) | Baixa |
| 4 | Botões "Simular…" habilitados que falham com o canal real ativo | `src/services/integracoes.ts:46-60` | Média |
| 5 | Itens do Contencioso visíveis para perfis sem acesso (terminam em erro) | `contencioso.functions.ts:10` | Baixa |
| 6 | Clientes sem lista para atendente/júnior | `clients.tsx:26-29` | Média |
| 7 | Telas globais exigem caso selecionado | `shared.tsx` (`OfficePage`) | Média |
| 8 | Componentes de tela inteira escritos em uma só linha de JSX (até 8.717 caracteres) | `production.tsx:35`, `atendimento.tsx:111,171`, `audit.tsx:14`, `movements.tsx:14` | Alta para o redesenho (custo de manutenção) |
| 9 | Código morto: `EmBreve`, imports e estados não usados no Atendimento | `src/components/em-breve.tsx`; `atendimento.tsx:109-118` | Baixa |
| 10 | Demonstração (`tools/demo-navegador`) não abre com o código atual sem adaptações | esta pesquisa | Baixa (útil para pré-visualizar o redesenho) |
| 11 | `robots.txt` permite indexação do sistema interno | `public/robots.txt` | Baixa |
