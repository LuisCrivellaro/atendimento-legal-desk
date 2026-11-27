# Inventário funcional e matriz de preservação — MANAGER ADV

Base para validar o redesenho completo (27/11/2026). Cada linha é algo que **precisa continuar existindo e
acessível**. A coluna "Depois" foi preenchida na revisão (`REDESIGN_QA.md`): ✅ igual ou melhor · ⚠️ mudou de lugar
(dizer onde) · ❌ regressão. Detalhe de cada tela: `research/CONTENT_INVENTORY.md`; IDs: `research/FUNCTIONAL_REQUIREMENTS.md`.

Resultado: **nenhuma regressão (❌)**. Os itens ⚠️ mudaram de lugar e continuam a no máximo 1 clique.

## Rotas (17)

`/auth`, `/`, `/atendimento`, `/producao`, `/aprovacoes`, `/auditoria`, `/protocolo`, `/andamentos`, `/clientes`,
`/contencioso/processos`, `/contencioso/processos/$codigo`, `/contencioso/andamentos`, `/treinamento`,
`/configuracoes`, `/integracoes`, `/.lovable/oauth/consent`, 404. Mais as rotas técnicas sem tela (`/mcp`,
`/.well-known/oauth-protected-resource`, `/api/public/*`), que o redesenho não toca.

Depois: ✅ todas as 17 rotas continuam. Nenhuma rota técnica foi alterada.

## Estrutura global

| Item | Depois |
|---|---|
| Logo + "MANAGER ADV" no cabeçalho | ✅ logo 32px + nome 16px; cabeçalho de 64px para 56px |
| Busca rápida global (nome, CPF, RG, celular, petição, protocolo, CNJ) | ✅ agora com aparência de campo; resultados mais compactos |
| Menu do perfil (nome, papel, lista de perfis) e "Sair" | ✅ ganhou avatar com iniciais; no celular o nome fica só para leitor de tela |
| Menu lateral: Painel; Fluxo do caso (Atendimento, Produção, Aprovações, Auditoria, Protocolo, Andamentos) com linha do fluxo; Clientes; Contencioso (Processos, Andamentos processuais, só sênior/admin); Treinamento de IA, Configurações, Integrações | ✅ 232px aberto / 56px recolhido; mesma ordem, grupos e regra de acesso |
| Badges do menu (prazo fatal; fila do Atendimento; etapas; movimentações novas) | ✅ discretos; recolhido vira ponto no ícone + número no tooltip + texto para leitor de tela |
| Recolher/expandir menu (botão e Ctrl/Cmd+B) com tooltips | ✅ e, no Atendimento abaixo de 1536px, o menu abre recolhido (a pessoa pode abrir) |
| Notificações (nova mensagem, retorno pendente, nova movimentação) e toasts com "Tentar novamente" | ✅ sem mudança de lógica; toast com raio de 8px |
| Confirmações próprias (9 ações sensíveis) | ✅ mesmo componente, novo fundo e título |
| Barra de carregamento de navegação e transição entre telas | ✅ transição só entre telas com o app visível (primeiro carregamento e aba em segundo plano trocam direto) |
| (novo) "Pular para o conteúdo" | ✅ link de atalho para teclado |

## Login (`/auth`)

E-mail/senha · "Continuar com Google" · "Continue with Lovable" · "Não tem conta? Cadastre-se" (modo cadastro com Nome)
· mensagem de confirmação por e-mail · retorno à página pedida · logo e nome. | Depois: ✅ tudo igual; título de 24px,
campos com `autocomplete`, aviso de confirmação em tom informativo.

## Painel (`/`)

| Item | Depois |
|---|---|
| Saudação e data; "Escritório inteiro"/"Meus casos" e atualizar | ⚠️ saudação e data viraram a linha de descrição sob o título; o resto ✅ |
| "O que fazer hoje" com links | ✅ |
| 6 indicadores (prazos fatais, audiências e perícias, protocolos, auditorias, atendimentos de hoje, retornos de sexta) | ✅ numa faixa única |
| Colunas prazos fatais / audiências e perícias / retornos de sexta | ✅ |
| 3 indicadores (casos, vencidos/hoje, checklists aprovadas) | ✅ numa faixa única |
| Filtros (busca, status, responsável, prioridade) | ⚠️ logo acima da tabela (que é o que eles filtram; os gráficos usam todos os casos) |
| 4 gráficos | ✅ cores dos tokens, sem amarelo saturado |
| Tabela de casos com pendências expansíveis e link para Produção | ✅ |
| Agenda de prazos | ✅ |

## Atendimento (`/atendimento`)

| Item | Depois |
|---|---|
| Alertas "automações paradas" e "IA pausada" + "Testar a chave e retomar" (sênior/admin) | ✅ sempre visíveis no topo da lista |
| Título, "Canal e Agente" (sênior/admin), busca (Ctrl+K), filtros (etapa, etiqueta, responsável), "Limpar" | ✅ |
| Lista única por última mensagem, rolagem infinita, avatar/foto, não lidas, hora com cor de espera, prévia, etapa, etiqueta AC/RT, ícones de modo/revisão | ✅ item de 88px para 66px |
| Atalhos Alt+↑/↓, Esc, Ctrl+K | ✅ |
| Cabeçalho: nome, etapas (popover com as 10 e "lançar no ProJuris"), modo da Anne (4 modos com confirmação), videochamada, "⋯" (Automações, ProJuris, Assumir/Pausar/Reativar), Trato feito, Próxima, mostrar/ocultar detalhes | ✅ uma linha de 56px; com a conversa estreita (<640px) "Trato feito" e "Próxima" viram ícone com dica e nome acessível |
| Próximo passo com ação | ✅ |
| Centro de avisos: status da Anne/Retomar, encaminhamento ao advogado (Em atendimento/Respondido/Concluir), avisos da equipe (Usar texto pronto/Resolvido), secretaria digital (Realizada, Cliente faltou, Retomar, Pausar, Cancelar, anexar transcrição/resumo, T09, Anne remarca, histórico), funil internacional (PIX Confirmado), aviso de Produção, vínculo pendente, notícias processuais (Revisar) | ⚠️ abre recolhido numa linha ("Precisa de atenção · N" + o aviso mais importante + "Ver aviso(s)"); as ações ficam a 1 clique. Avisos críticos continuam sempre visíveis (critério em `REDESIGN_QA.md`) |
| Mensagens: bolhas, tiques, separadores, áudio, imagem/documento, Drive, apagada, anteriores, estados de anexo e falha, menu apagar (para mim/para todos), arrastar/colar arquivo | ✅ área das mensagens de 189px para 489px de altura (1366×768) |
| Compositor: rascunho da IA, chips, campos a preencher, anexar, agenda rápida, ações da etapa (11), mensagens prontas (busca, categorias, criar/editar/excluir), sugerir com IA, "/" atalhos, enviar | ✅ |
| Painel do cliente: Cliente (resumo IA, retornos, etiqueta, carteira, dados, contrato, Drive, processos, automações) · Documentos (checklist, correção, análise IA) · Consulta e histórico (cancelar/reagendar, Meet, compromisso, gravação, resumo, histórico) · ProJuris | ✅ e agora redimensionável (mouse e teclado) |
| Diálogos: Automações (8 interruptores, modo padrão, secretaria, biblioteca de 19 mensagens), Canal e Agente, Ações, editor de mensagem pronta, anexo, apagar, status do contrato | ✅ |

## Produção, Auditoria, Protocolo, Andamentos

| Item | Depois |
|---|---|
| Barra do caso (busca, seletor, código) fixa + fio das 10 etapas | ✅ (rótulo do fio não corta mais em tela estreita) |
| Produção: Caso/Quadro; PipelineSync; área; fase; Salvar; Gerar minuta com IA; Provas e documentos (checklist, Aprovar checklist, 1 Start, Adicionar, Pacote 3 Upload, Examinar, Analisar, classificação A–F, Copiar para 3 Upload); Fatos e fontes; Petição (DOCX, Aprovar minuta, Enviar à auditoria, Editar texto, Visual Law, pendências); Memorial (PDF); aviso de saída sem salvar | ✅; ⚠️ "Pendências da minuta" subiu para cima do editor (antes ficava abaixo de 620px de editor) |
| Auditoria: selo; Salvar revisão; Auditoria IA; Validação humana; progresso x/16; Só pendentes; 16 itens; Relatório e fatos novos (PDF); Pendências | ✅; ⚠️ progresso x/16 na linha do selo |
| Protocolo: bloqueio; autuação preliminar (Salvar, Simular); registro externo (CNJ, recibo, data, Confirmação da sênior, Simular vínculo); pacote final; registro de operações | ✅ |
| Andamentos: indicadores; Todos/Com prazo/Concluídos; Nova; Providência concluída; Avisar o cliente (linguagem simples, IA, enviar); Registrar andamento (todos os campos); processos do cliente | ✅; ⚠️ "Nova" na linha da data |

## Aprovações, Clientes, Contencioso

| Item | Depois |
|---|---|
| Aprovações: notícias processuais (Revisar → Recusar/Corrigir/Aprovar e enviar); indicadores; pendências por advogado; filtros; tabela; diálogo da minuta (revisor, prazo, Revisão jurídica, Salvar) | ✅ |
| Clientes: Atualizar; Cadastrar cliente e caso; carteira ProJuris (sênior/admin) com sincronização, busca, tabela, Ver dados (abas, edição); lista própria (não sênior); ficha do cliente (dados, casos, documentos, histórico, novo registro) | ✅; ⚠️ "Integração ProJuris" foi para as ações do cabeçalho |
| Contencioso: Importar/atualizar; Sincronizar históricos; indicadores; falhas; filtros e ordenação; tabela paginada; ficha do processo com linha do tempo e Sincronizar; andamentos processuais | ✅ |

## Treinamento, Configurações, Integrações

| Item | Depois |
|---|---|
| Treinamento: seletor de caso; Salvar versão; Orientações (instruções, Não pode dizer, instruções operacionais com prévia/ativação/desativação/histórico); Teste de respostas; Versões | ✅; ⚠️ "Restaurar como rascunho" na linha do título de cada versão |
| Configurações: Meu perfil; Modo das integrações; Conexão n8n (endpoints); Log de auditoria; Integrações preparadas; Outros serviços; Segurança documental | ✅ |
| Integrações: Monitoramento 24h da Anne (Verificar agora); Migração da agenda (Conferir, Migrar consulta); cartões ProJuris/ZapSign/Mercado Pago/UltraMsg (Verificar acesso, Testar leitura, Importar conversas, Documentação) | ✅ |

## Fora do alcance do redesenho (não muda)

Rotinas de servidor (`monitorar-ana` e etapas), webhooks, Anne, biblioteca oficial de mensagens, Google
Agenda/Meet/Drive, ProJuris, geração DOCX/PDF, MCP, regras de acesso e aprovação. Depois: ✅ nenhum desses arquivos
foi alterado (o diff toca só componentes de interface, estilos, o roteador e a demonstração).
