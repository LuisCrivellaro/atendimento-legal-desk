# Requisitos funcionais do redesenho: Manager ADV

27/11/2026, a pedido da Dra.: o redesenho é uma evolução completa, sem perda de capacidade. Este documento lista
cada funcionalidade existente e as novas propostas, com uma classificação:

- **Preservar**: existe e fica como está (o visual pode mudar, o comportamento não).
- **Aprimorar**: existe e deve ficar melhor (apresentação, clareza, atalhos), sem mudar a regra.
- **Corrigir**: existe e tem problema.
- **Adicionar**: não existe; proposta com justificativa.
- **Reavaliar**: remover, trocar ou mudar o papel exige autorização da Dra.

Verificação: **D** = visto na demonstração local (mesmo código, dados fictícios); **P** = visto no site publicado;
**C** = confirmado no código; **N** = não verificado (ver seção final). Fontes de detalhe: `CONTENT_INVENTORY.md`,
`WEBSITE_AUDIT.md` e o inventário funcional do código (Etapa 01).

Nenhuma regra de negócio, permissão, gate jurídico, rotina de servidor, contrato JSON, migração ou texto oficial muda
por causa do redesenho. Onde uma melhoria tocaria nisso, ela está em "Reavaliar".

## G · Acesso e estrutura global

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| G-01 | Login por e-mail e senha | Preservar | Novo visual com monograma e entrada única do painel | P |
| G-02 | Login com Google | Preservar | | P, C |
| G-03 | Botão "Continue with Lovable" | Reavaliar | Texto em inglês e marca de terceiro na tela de entrada; manter só se a equipe usa | P |
| G-04 | Cadastro aberto da equipe (conta nova entra como atendente) | Reavaliar | Qualquer pessoa consegue criar conta; os dados seguem protegidos por proprietário, mas a decisão de manter é da Dra. | P, C |
| G-05 | Retorno à página pedida após o login (`?redirect`) | Preservar | | C |
| G-06 | Cabeçalho: lockup, busca rápida, perfil, sair | Aprimorar | Menu do perfil hoje só lista papéis; incluir "Meu perfil" e "Atalhos" | D |
| G-07 | Menu lateral com grupos e linha do "Fluxo do caso" | Aprimorar | Indicador deslizante, ícones distintos, nomes ("Painel") | D, C |
| G-08 | Badges do menu (prazos fatais, fila, etapas, movimentações novas) | Aprimorar | Vermelho só para prazo fatal, âmbar para fila, sem zero; badge em Revisões/Aprovações | D, C |
| G-09 | Menu recolhível (Ctrl/Cmd+B) | Preservar | Mostrar badges também recolhido | D, C |
| G-10 | Itens do Contencioso visíveis para quem não tem acesso | Corrigir | Mostrar só para sênior/admin; o servidor continua barrando | C |
| G-11 | Busca rápida (nome, CPF, RG, celular, petição, protocolo, CNJ) | Aprimorar | Atalho Ctrl+K global; para sênior/admin, incluir a carteira ProJuris | D, C |
| G-12 | Notificações na tela (nova mensagem, retorno pendente, nova movimentação) | Preservar | | C |
| G-13 | Toasts de ação com "Tentar novamente" | Preservar | Cores semânticas | C |
| G-14 | Tempo real das conversas e recarga do painel (60s) | Preservar | | C |
| G-15 | Papéis em `user_roles` e rótulos de papel | Preservar | Exibir rótulos legíveis em vez de `advogada_senior` | C |
| G-16 | Página 404 e tela de erro em inglês | Corrigir | Português, com identidade | P, C |
| G-17 | `robots.txt` liberando indexação do sistema interno | Corrigir | `noindex` + `Disallow: /` | P |
| G-18 | Favicon da Lovable | Corrigir | Monograma CS (após aprovação) | P |
| G-19 | Selo "Edit with Lovable" no site publicado | Reavaliar | Depende de configuração do plano na Lovable | P |
| G-20 | Rótulos de acessibilidade em inglês ("Close", "Sidebar") | Corrigir | Traduzir | C |
| G-21 | Rotas técnicas: `/mcp`, consentimento OAuth, `/api/public/*` (webhooks) | Preservar | Fora do redesenho | C |

## PA · Painel ("Assessor")

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| PA-01 | Saudação e data | Preservar | | D |
| PA-02 | "Escritório inteiro" (sênior/admin) × "Meus casos" | Preservar | | C |
| PA-03 | Seis indicadores do dia | Aprimorar | Uma faixa só, cor por significado, zero neutro | D |
| PA-04 | "O que fazer hoje" com links | Aprimorar | Primeira faixa da tela, ações diretas | D |
| PA-05 | Colunas Prazos fatais / Audiências e perícias / Retornos de sexta | Aprimorar | Uma lista "Prazos e eventos" | D |
| PA-06 | Data e hora de evento deslocadas (perícia de 11/11 às 14h30 aparece como 10/11 às 21:00) | Corrigir | Tratar data sem hora no fuso de São Paulo | D, C |
| PA-07 | Eventos já passados contados em "Audiências e perícias" | Corrigir | Filtrar por data futura (`src/lib/assessor.ts:8`) | C |
| PA-08 | Três indicadores extras (casos, prazos vencidos, checklists aprovadas) | Aprimorar | Fundir com PA-03 | D |
| PA-09 | Filtros (busca, status, responsável, prioridade) | Preservar | | D |
| PA-10 | Quatro gráficos | Aprimorar | Cores da marca, rótulos legíveis, clicáveis | D |
| PA-11 | Tabela de casos com pendências e link para Produção | Preservar | Novo visual de tabela | D |
| PA-12 | Agenda de prazos | Aprimorar | Fundir com PA-05 | D |
| PA-13 | Funil do escritório clicável (contato → consulta → trato feito → contrato) | Adicionar | Ajuda a equipe a ver onde os casos param (`CONVERSION_STRATEGY.md`), com dados que o sistema já grava | — |

## AT · Atendimento

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| AT-01 | Lista única de conversas por última mensagem, rolagem infinita, avatares, não lidas, etapa, etiqueta | Preservar | Skeleton no carregamento; reordenação animada | D, C |
| AT-02 | Busca na lista (Ctrl+K) e filtros (etapa, etiqueta, responsável) | Preservar | | D |
| AT-03 | Popover de filtros invadindo o menu lateral | Corrigir | | D |
| AT-04 | Alertas "automações paradas" e "IA pausada" com "Testar a chave e retomar" | Aprimorar | Texto sem jargão, dentro do centro de avisos | D, C |
| AT-05 | "Canal e Agente" (canal, registrar recebimento, verificar WhatsApp, nomes da agenda, atender todo mundo, contatos liberados/bloqueados, agente, fonte das sugestões, ações real/simulado) | Preservar | Manter o acesso direto pelo cabeçalho da lista (regra do `AGENTS.md`); o conteúdo pode também aparecer em Configurações | D, C |
| AT-06 | Etapas da conversa (popover com as 10 etapas e registro para lançar no ProJuris) | Aprimorar | Fio das etapas no cabeçalho | D, C |
| AT-07 | Modo da Anne (Automático / Híbrido / Humano / Bloqueado; confirmação ao voltar para Automático) | Aprimorar | Segmentado visível; confirmação mantida | D, C |
| AT-08 | Modo antigo da IA (Desligada / Sugerir / Automática) quando a secretaria digital está desligada | Preservar | | C |
| AT-09 | Iniciar videochamada | Preservar | | D |
| AT-10 | Menu "Mais opções" (Automações do Atendimento, Ver dados no ProJuris; Assumir/Pausar/Reativar Anne sem secretaria) | Preservar | | D, C |
| AT-11 | TRATO FEITO | Aprimorar | Botão primário normal "Registrar trato feito"; mesma regra | D |
| AT-12 | Próxima conversa aguardando | Preservar | | D |
| AT-13 | Próximo passo com ação | Aprimorar | Ação principal da conversa | D |
| AT-14 | Faixas: status da Anne/Retomar, encaminhamento ao advogado (Em atendimento, Respondido, Concluir), avisos da equipe (Usar texto pronto, Resolvido), funil internacional (PIX Confirmado), aviso de Produção, vínculo pendente, notícias processuais pendentes | Aprimorar | Todas as ações continuam; apresentação no centro de avisos | D, C |
| AT-15 | Painel da secretaria digital (Realizada, Cliente faltou, Retomar, Pausar, Cancelar, anexar transcrição/resumo, checklist trabalhista T09, Anne remarca, histórico) | Preservar | | C |
| AT-16 | Mensagens: bolhas, tiques, separadores de dia, áudio, imagem/documento com visualizador, "Ver no Google Drive", mensagem apagada, carregar anteriores | Preservar | Cor das bolhas conforme decisão da Dra. | D, C |
| AT-17 | Estados de anexo (guardado, enviando, não confirmado; "Enviar ao cliente", "Conferi, enviar de novo") e falha de envio ("Tentar de novo") | Aprimorar | Marca de status única | C |
| AT-18 | Apagar para mim / Apagar para todos (sênior/admin, com recibo do provedor) | Preservar | AlertDialog | C |
| AT-19 | Arrastar e soltar ou colar arquivo (prévia antes de enviar) | Preservar | | C |
| AT-20 | Rascunho da IA (enviar, editar, enviar mesmo assim, alertas) | Preservar | Linha de status de IA com cronômetro | C |
| AT-21 | Compositor: chips de mensagens prontas, campos a preencher, anexar, agenda rápida, ações da etapa (11 ações), mensagens prontas (busca, categorias, criar, editar, excluir, voltar ao original), sugerir com IA, "/" atalhos, enviar | Aprimorar | Rótulos visíveis no hover/foco, tooltips em grupo, organização das entradas | D, C |
| AT-22 | Atalhos Alt+↑/↓ e Esc | Aprimorar | Esc fecha popover e limpa busca antes de fechar a conversa; listar atalhos | D, C |
| AT-23 | Aba Cliente (resumo da IA, retornos pendentes, etiqueta, carteira de agendamento, dados, contrato e "Atualizar status", pasta do Drive, processos, automações programadas) | Preservar | | D |
| AT-24 | Aba Documentos (checklist, correção com confirmação, análise de documentos com IA) | Preservar | Check desenhado | D |
| AT-25 | Aba Consulta e histórico (cancelar/reagendar com confirmação, Meet, compromisso, resumo, histórico) | Preservar | | D |
| AT-26 | Player de gravação com progresso fixo em 33% e botões "Enviar transcrição"/"Enviar sumarização" desabilitados | Reavaliar | São marcadores sem função; retirar ou manter como "em breve" | D, C |
| AT-27 | Aba ProJuris (indicadores, processos, informações, arquivos locais, "Abrir Andamentos") | Preservar | | D |
| AT-28 | Painel de detalhes sem botão de fechar em tela larga; abre sozinho a cada conversa abaixo de 1024px | Corrigir | Recolhível; respeitar a escolha do usuário | C |
| AT-29 | Diálogo "Automações do atendimento" (8 interruptores, modo padrão, secretaria digital, biblioteca de 19 mensagens oficiais) | Aprimorar | Página/seção própria; o atalho pelo menu da conversa continua | D, C |
| AT-30 | Rolagem horizontal no diálogo de automações | Corrigir | | D |
| AT-31 | "Ana" e "Anne" misturados | Corrigir | "Anne" em toda a interface | C |
| AT-32 | Iniciar conversa por telefone (código existe, interface não aparece) | Reavaliar | Recuperar a função ou apagar o código | C |
| AT-33 | Vínculo pendente com caixa desabilitada "Atualizar telefone no ProJuris — ainda não disponível" | Reavaliar | Marcador de função futura | C |
| AT-34 | Visibilidade dos lembretes já enviados e restantes por conversa | Adicionar | Evita cobrança repetida à mão (princípio 50); os dados existem nas automações | — |
| AT-35 | Notificação do navegador para mensagem nova com a aba em segundo plano | Adicionar (opcional) | A equipe trabalha com várias janelas; exige permissão do navegador | — |

## PR · Produção

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| PR-01 | Abas Caso / Quadro (kanban de 4 colunas) | Aprimorar | Segmentado; barras de progresso nas cores semânticas | D |
| PR-02 | Seletor de caso (busca + select) | Aprimorar | Cabeçalho do caso compartilhado | D |
| PR-03 | Faixa das 10 etapas (texto miúdo) | Aprimorar | Fio das etapas | D |
| PR-04 | Área (Previdenciário, Trabalhista, Civil/alimentos), fase, Salvar | Preservar | | D |
| PR-05 | Gerar minuta com IA (exige checklist aprovado) | Preservar | Linha de status de IA | D, C |
| PR-06 | Checklist de provas e "Aprovar checklist" (papel validado no servidor) | Preservar | Check desenhado | D, C |
| PR-07 | 1 Start (originais): adicionar documentos, examinar, analisar, conferido, contrato cliente/advocacia, classificação A–F, copiar para 3 Upload, avisos de 10.000 KB e contrato não copiado | Aprimorar | Legenda da classificação A–F | D, C |
| PR-08 | Pacote 3 Upload (ZIP) | Preservar | | D |
| PR-09 | Fatos e fontes | Preservar | | D |
| PR-10 | Petição inicial: DOCX, Aprovar minuta, Enviar à auditoria, Editar texto, Visual Law, pendências | Preservar | Barra de ações única | D |
| PR-11 | Memorial de cálculos (texto e PDF) | Preservar | | C |
| PR-12 | Aviso de alterações não salvas ao sair da tela | Adicionar | Hoje não existe em nenhuma tela (nenhum `beforeunload`/bloqueio de navegação no código); evita perder trabalho | C |

## AP · Aprovações

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| AP-01 | Notícias processuais pendentes (Revisar: Recusar, Corrigir, Aprovar e enviar) | Preservar | | D, C |
| AP-02 | Indicadores, pendências por advogado, filtros, tabela | Preservar | Novo visual | D |
| AP-03 | Diálogo da minuta (advogado revisor, prazo, "Revisão jurídica", salvar) | Preservar | | D |
| AP-04 | Nome "Aprovações" sem aprovação de minuta na tela | Reavaliar | Renomear para "Revisões" ou trazer a aprovação para cá | D, C |
| AP-05 | Sem badge no menu | Aprimorar | Badge de pendências | C |

## AU · Auditoria

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| AU-01 | Selo de aptidão; Salvar revisão; Auditoria IA; Validação humana (júnior/sênior) | Preservar | | D, C |
| AU-02 | 16 itens com SIM/NÃO/N/A/PENDENTE e três campos | Aprimorar | Progresso "x de 16", itens recolhíveis, filtro "só pendentes" | D |
| AU-03 | Relatório e fatos novos; PDF do checklist e relatório | Preservar | | C |
| AU-04 | Pendências (incluir, resolver) | Preservar | | D |
| AU-05 | Aviso de alterações não salvas | Adicionar | Mesmo motivo de PR-12 | C |

## PT · Protocolo

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| PT-01 | Faixa de bloqueio ("Avanço bloqueado…") | Aprimorar | Explicar o que falta e onde resolver | D |
| PT-02 | Autuação preliminar (tribunal, vara, classe; salvar) | Preservar | | D |
| PT-03 | Registro do protocolo externo (CNJ validado, recibo, data; Confirmação da sênior) | Preservar | Etapas verticais | D, C |
| PT-04 | "Simular autuação" e "Simular vínculo" habilitados mesmo quando falhariam com o canal real ativo | Corrigir | Desabilitar com o motivo quando o canal real está ativo | C |
| PT-05 | Documentos do pacote final: estado vazio não aparece com lista vazia | Corrigir | | C |
| PT-06 | Registro de operações | Preservar | | C |

## AN · Andamentos (registro manual)

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| AN-01 | Indicadores; "Prazos em aberto" em vermelho mesmo com zero | Corrigir | Zero neutro | D |
| AN-02 | Movimentações e prazos (Todos, Com prazo, Concluídos; marcar nova; providência concluída) | Preservar | Linha do tempo no fio | D |
| AN-03 | Avisar o cliente (linguagem simples, gerar com IA, enviar) | Aprimorar | Hoje é simulado e falha com o canal real ativo: mostrar o motivo antes do clique | D, C |
| AN-04 | Registrar andamento (CNJ, data, movimentação, prazo, prazo fatal, tipo de evento, data/hora) | Preservar | Máscara de CNJ e data | D |
| AN-05 | Nome igual ao "Andamentos processuais" do Contencioso | Aprimorar | Selo "registro manual" × "ProJuris oficial" | D |

## CL · Clientes

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| CL-01 | Atualizar; Cadastrar cliente e caso (formulário) | Preservar | Máscaras e erro junto ao campo | D |
| CL-02 | Carteira ProJuris (sênior/admin): busca, tabela de 50 por página, "Ver dados" com abas, edição com verificação no ProJuris | Preservar | | C |
| CL-03 | Sincronização da base (cadastros, andamentos até 20, histórico por processo) | Preservar | Textos sem jargão ("pendente de Inngest") | D |
| CL-04 | Ficha do cliente local (dados, caso, etapas, casos e processos, documentos, checklist, histórico, novo registro) | Preservar | Cabeçalho do cliente | C |
| CL-05 | Perfis não sênior sem lista dos próprios clientes (filtros calculados e nunca exibidos) | Corrigir | Mostrar a lista própria | C |
| CL-06 | Aba "Demais dados" com JSON bruto do ProJuris | Aprimorar | Lista legível | C |
| CL-07 | Nome "Base própria CS.IA" | Reavaliar | Confirmar com a Dra. o nome a exibir | D |
| CL-08 | Máscaras de CPF, telefone e CNJ nos formulários | Adicionar | Hoje não há máscara nos campos (só mascaramento de CPF para privacidade); princípio 25 | C |

## CO · Contencioso

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| CO-01 | Processos: importar/atualizar, sincronizar históricos, indicadores, falhas, filtros, ordenação, paginação | Preservar | | D, C |
| CO-02 | Ficha do processo com linha do tempo e "Sincronizar processo" | Preservar | | C, N |
| CO-03 | Andamentos processuais (linha do tempo da API oficial) | Preservar | | D |
| CO-04 | Busca navega a cada tecla, sem atraso nem indicador | Corrigir | Atraso de digitação e barra de progresso | C |
| CO-05 | Pílulas que repetem a navegação do menu | Aprimorar | Abas simples ou remover a duplicação | D |
| CO-06 | Rodapé técnico ("…erro 500…") | Aprimorar | "Sobre esta fonte" recolhido | D |

## TR · Treinamento de IA

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| TR-01 | Orientações (instruções de atendimento, "Não pode dizer") e "Salvar versão" | Preservar | | D |
| TR-02 | Instruções operacionais (sênior/admin: interpretar, prévia, validade, ativar, editar, desativar, histórico) | Preservar | | D, C |
| TR-03 | Teste de respostas e exemplos revisados | Preservar | | C |
| TR-04 | Versões (restaurar como rascunho) | Preservar | | C |
| TR-05 | Tela exige um caso selecionado e fica inacessível sem casos | Corrigir | Remover a dependência de caso | D, C |
| TR-06 | Rótulo "Modelo Lovable AI" × Claude citado em Integrações | Corrigir | Texto coerente com a configuração real | D |

## CF · Configurações e Integrações

| ID | Funcionalidade | Classe | O que fazer | Ver. |
|---|---|---|---|---|
| CF-01 | Meu perfil (nome, cargo, e-mail somente leitura) | Preservar | Papéis legíveis | D |
| CF-02 | Modo das integrações; Integrações preparadas; Outros serviços | Corrigir | Status hoje contradiz o que funciona de verdade (ProJuris, Drive, Agenda reais no Atendimento aparecem como "Demonstração") | D |
| CF-03 | Tabela de endpoints n8n | Reavaliar | Mover para "Avançado" (só admin) | D |
| CF-04 | Log de auditoria (sênior/admin) | Preservar | | C, N |
| CF-05 | Segurança documental (texto) | Preservar | | D |
| CF-06 | Configurações e Treinamento exigindo caso selecionado | Corrigir | | D, C |
| CF-07 | Monitoramento 24h da Anne (verificar agora, alertas, indicadores, histórico) | Preservar | | D, C |
| CF-08 | Migração da agenda (conferir Google e ProJuris, migrar consulta com confirmação, histórico) | Preservar | AlertDialog | D, C |
| CF-09 | Cartões ProJuris, ZapSign, Mercado Pago, UltraMsg ("Conectar", "Testar leitura", "Importar conversas do WhatsApp", "Documentação") | Aprimorar | "Conectar" passa a "Verificar acesso" (é o que faz) | D, C |
| CF-10 | H1 "Integrações" abaixo de dois painéis | Corrigir | | D |
| CF-11 | Configurações reunidas numa página com navegação lateral | Adicionar | Hoje estão em 2 telas e 2 modais; menos procura | — |

## SV · Funcionalidades de servidor (sem tela; o redesenho não toca)

| ID | Funcionalidade | Classe | Ver. |
|---|---|---|---|
| SV-01 | Rotina única `monitorar-ana` (5 min): lembrete das 08h, confirmação de presença, relatório diário, relatório ao advogado 09h/16h, reconciliação da fila, sincronização ProJuris, pausa e retomada da IA, coleta de documentos, acompanhamento, eventos processuais | Preservar | C |
| SV-02 | Webhooks do WhatsApp (UltraMsg) e regras de entrada, liberação e bloqueio | Preservar | C |
| SV-03 | Anne (Claude) com respostas validadas pelo servidor, biblioteca oficial de 19 mensagens e seus snapshots | Preservar | C |
| SV-04 | Google Agenda/Meet, ProJuris como agenda oficial, Google Drive (pastas 1 a 4) | Preservar | C |
| SV-05 | Geração de DOCX/PDF no padrão Visual Law | Preservar | C |
| SV-06 | Ferramentas MCP (listar casos, ver checklist) | Preservar | C |
| SV-07 | Regras de acesso por proprietário, papéis, hash de revisão das aprovações, log de auditoria, armazenamento privado e originais imutáveis | Preservar | C |

## LK · Documentos e links

| ID | Item | Classe | Ver. |
|---|---|---|---|
| LK-01 | Site `carolinasantos.com.br`, Instagram e LinkedIn nas mensagens oficiais | Preservar | C |
| LK-02 | Links de "Documentação" das integrações, pasta do Drive por caso, Meet, compromisso | Preservar | D, C |
| LK-03 | Documentação do projeto em `docs/` e guias de continuidade | Preservar | C |

## Funcionalidades novas recomendadas (resumo de "Adicionar")

| ID | Proposta | Por quê |
|---|---|---|
| PA-13 | Funil clicável no Painel | Mostra onde os casos param, com dados existentes |
| AT-34 | Lembretes enviados e restantes por conversa | Follow-up honesto, sem cobrança repetida |
| AT-35 | Notificação do navegador (opcional) | Mensagem nova não passa despercebida com a aba em segundo plano |
| PR-12, AU-05 | Aviso de alterações não salvas | Hoje não existe; evita perda de trabalho |
| CL-08 | Máscaras de entrada | Menos erro de digitação em CPF, CNJ, telefone |
| CF-11 | Configurações numa página com seções | Fim da configuração espalhada |
| NV-01 | Centro de avisos no Atendimento | Ordem clara de prioridade e mais espaço para a conversa |
| NV-02 | Cabeçalho do caso compartilhado com o fio das 10 etapas | Mesmo caso em todas as telas do fluxo jurídico |
| NV-03 | Ctrl+K global e painel de atalhos (`?`) | Atalhos existentes passam a ser descobertos |
| NV-04 | Estado na URL para abas e filtros | Voltar, recarregar e mandar o link à colega sem perder o contexto (hoje só conversa, caso, cliente e filtros do Contencioso vão na URL) |
| NV-05 | "Desfazer" em ações internas reversíveis | Corrige clique errado sem diálogo extra |
| NV-06 | Skeletons e barra de progresso de navegação | Carregamento claro, sem tela congelada |
| NV-07 | Indicadores de uso antes/depois de cada fase (a partir do log) | Medir se o redesenho ajudou, sem números inventados |

## Itens a reavaliar com a Dra. (resumo)

G-03, G-04, G-19, AT-26, AT-32, AT-33, AP-04, CL-07, CF-03, e ainda: o papel de parede atual da conversa (provável
arte do WhatsApp), a cor das bolhas (verde WhatsApp × aqua da marca), os tokens de modo escuro sem uso e o componente
`EmBreve` sem uso (`src/components/em-breve.tsx`).

## O que não foi verificado completamente

- A área autenticada do site publicado não foi acessada (sem login). As telas internas foram vistas na demonstração
  com o código local, que está à frente do publicado (lista única do Atendimento, commit `79208ea`, ainda não
  publicada segundo as notas do projeto).
- Telas que dependem de dados reais: carteira ProJuris, ficha de processo do Contencioso, monitoramento da Anne, log
  de auditoria, lista da migração da agenda, importação de conversas.
- Comportamento com o canal WhatsApp real ativo (envios, recibos, botões simulados que falham).
- Exportação de DOCX/PDF, prévia Visual Law com uma minuta real, arrastar e soltar arquivos, áudio.
- Diferenças por perfil na interface: a demonstração só foi usada como Advogada Sênior.
- Notificações na tela e contagens de badges com dados reais.

## Comparação funcional antes da entrega

Antes de entregar cada fase (e no fim, a Fase 6 do `IMPLEMENTATION_PLAN.md`):

1. Copiar a tabela de IDs deste documento para uma matriz de verificação com as colunas: ID · resultado (igual /
   melhorado / regressão) · como foi verificado (demo, teste automático, sistema publicado) · perfil usado · evidência
   (captura ou nome do teste).
2. Testar com os cinco perfis (Advogada Sênior, Advogado Júnior, Atendente/Assessora, Operações, Administrador),
   porque várias ações dependem de papel.
3. Rodar a suíte de testes e os snapshots da biblioteca oficial; nenhum snapshot pode mudar.
4. Comparar as capturas novas com `capturas/` da Etapa 01, tela por tela.
5. Qualquer "regressão" bloqueia a entrega até ser corrigida ou autorizada pela Dra. por escrito.
6. Depois da publicação pela Dra., repetir os itens marcados **N** no sistema real.
