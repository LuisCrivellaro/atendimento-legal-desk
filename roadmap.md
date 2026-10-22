# Construção dos módulos Manager ADV

## Um bot Telegram para testes — 21/10/2026
- [x] Simplificar a tela para um bot, @ManagerADV2Bot; pedido de dois bots cancelado pela usuária.
- [x] Conferir contato Teste Dra. liberado e vinculado a Paulo, Ana ligada e modo Automática; webhook principal registrado no site publicado, sem pendências/erros. Teste assinado local processado, resposta enviada e lida na conversa após recarga; chamada sem assinatura recusada (401). Ana retomada ao final; 38 testes aprovados e compilação limpa.
- [ ] Publicar a atualização preparada — aguardando publicação manual pela usuária; após publicar, enviar nova mensagem ao @ManagerADV2Bot. Histórico de testes preservado, sem afirmar sessão nova.

## Agente Ana pelo Telegram — 21/10/2026
- [x] Ajustar brevidade, evitar perguntas repetidas, continuar acolhimento em temas delicados e permitir agenda fictícia claramente identificada no Telegram de teste; regras e duas respostas reais da IA verificadas sem envio externo.
- [x] Aplicar identidade enviada e regras de modos, aprovação, identificação e encaminhamento humano.
- [x] Processar mensagens do contato de teste liberado no servidor e persistir respostas/rascunhos sem depender da conversa aberta.
- [x] Ativar e verificar duas respostas reais localmente, retenção jurídica e deduplicação; integrações ProJuris/Agenda/Drive seguem indisponíveis.
- [ ] Efetivar Ana no Telegram publicado — bloqueado: publicação da atualização; a prévia pública ainda usa o webhook anterior. Webhook mantido no site publicado, sem trocar o recebimento existente.

## Atendimento por canal (Telegram) — 21/10/2026
- [x] Camada de canais (tipos, telegram, simulador, ultramsg stub) e funções puras de telefone com testes.
- [x] Tabelas atendimento_canal_config, atendimento_contatos_teste e audit_log com RLS; só sênior/admin alteram config.
- [x] enviarMensagemCanal no servidor + enviarMensagemSistema interna; n8n.ts renomeado para integracoes.ts.
- [x] Rota pública do webhook do Telegram com verificação de secret.
- [x] Aba "Canal e Agente" no Atendimento (só sênior/admin); remover campo URL n8n e modo demonstração do navegador.
- [x] Testes: telefone, canal desligado, contato não liberado, {campo} bloqueado, falha não grava, permissão, token fora de erros.

## Testes do Atendimento — próximos passos
- [ ] Fase 1: equipe testa os 5 roteiros na demonstração (`manager-adv-demonstracao.html`, gerada por `tools/demo-navegador`) e envia tempos e travamentos.
- [x] Corrigir: horários do cliente e reconhecimento sem ambiguidade.
- [x] Corrigir: registro do link HTTPS do contrato enviado fora do sistema.
- [x] Corrigir: próximo passo de cliente ativo e abertura da aba ProJuris.
- [x] Corrigir: cabeçalho e filtros no celular, incluindo área segura.
- [x] Corrigir: contraste do amarelo, apenas fundo com texto preto.
- Verificação em 21/10/2026: 70 testes aprovados e compilação limpa; busca/filtros em 390×844, 360×740 e 1440×900; aba ProJuris no celular; contrato HTTPS registrado e lido após recarga; horários enviados em demonstração sem ISO ou segundos no corpo da mensagem. Link de exemplo foi salvo no caso demonstrativo de Paulo durante o teste.
- [ ] Fase 2: sistema real no Lovable Cloud com contas da equipe e perfis em `user_roles`.
- [ ] Fase 3: ponte real com n8n (envio pelo servidor, recebimento de mensagens, simulador, workflows), UltraMsg em chip de teste, lembretes no n8n.

## Mensagens prontas no Atendimento — 20/10/2026
- [x] Sugestões da etapa acima da caixa de mensagem (aparecem com a caixa vazia): um clique coloca o texto já com o nome do cliente para revisar antes de enviar.
- [x] Botão "Mensagens prontas" com busca, categorias (Boas-vindas, Documentos, Agendamento, Processo, Geral) e prévia com os dados do cliente aberto.
- [x] Atalho "/" sem abrir janela: lista no próprio campo, setas para escolher, Enter para usar; também abre as ações da etapa.
- [x] Criar, editar, excluir e restaurar mensagens; variáveis {nome}, {nome_completo}, {documentos_faltantes}, {atendimento} e campos livres (ex.: {data}) que bloqueiam o envio até serem preenchidos.
- [x] Botão de ações da etapa separado das mensagens (ícone de lista), sem mudar handlers, permissões ou integrações.
- [x] 60 testes aprovados (7 novos), compilação sem erros; verificado no navegador em 1440×900 e 390 px.
- Limite: as mensagens criadas ficam no perfil de cada usuário (área de trabalho própria). Uma biblioteca compartilhada pelo escritório exige tabela nova e fica para uma próxima etapa.

## ProJuris no painel da conversa
- [x] Mostrar processos, andamentos, prazos, tribunal, classe, protocolo e arquivos locais do cliente selecionado em uma aba ProJuris, indicando que não houve importação real.
- [x] Verificar sessão autenticada: processos de Helena, ausência deles em Rogério, menu ProJuris, atualização e apresentação em 1424×661 e 855×661; 23 testes aprovados e compilação sem erros, sem alterar dados ou ativar integrações.
- Atualizar o ZIP somente quando os créditos estiverem no final, conforme solicitado.

## Apresentação minimalista do Atendimento
- [x] Reorganizar fila, cabeçalho, pipeline, próximo passo, mensagens e rodapé mantendo os handlers, permissões e integrações existentes.
- [x] Agrupar ações/respostas e detalhes nas três abas recolhíveis; simplificar perfis no topo e lembrar a escolha do painel localmente.
- [x] Verificar sessão autenticada em 1440×900: mensagens ocupam 681 de 836 px (81%), sete mensagens totalmente visíveis; menus, cobrança, documentos, consulta/histórico, automações, resposta rápida por barra, sugestão IA e edição verificados; 855×661 sem transbordamento e painel sem cortes; 50 testes aprovados e compilação sem erros.

## Evolução solicitada em 20/10/2026
- [x] Atendimento: fila, novas mensagens datadas, próximo passo, ações com prévia, respostas rápidas, IA por conversa, anexos e configurações de automação.
- [x] Assessor acima do painel atual, com prioridades e agenda no escopo existente.
- [x] Quadro de Produção e sincronização por etapa em Atendimento, Produção e Clientes.
- [x] Andamentos: eventos destacados e aviso revisável em linguagem simples.
- [x] Configurações: conexão n8n e log da sessão com identidade real; menu calculado e cabeçalho timbrado.
- [x] 50 testes aprovados; sessão master: resposta IA, resumo IA com checklist real, simplificação de andamento, mensagem salva após recarga, cobrança validada, horários livres, quadro, Assessor e ausência de transbordamento em 702 px; compilação sem erros.
- Limites: mensagens antigas sem ISO permanecem sem data (não inventar); lembretes simulados dependem da conversa aberta; URL n8n não conecta serviços; log é da sessão; vendedor e fora do horário estão configuráveis, mas sem fluxo externo ativado. Novos campos opcionais podem invalidar minuta pelo hash existente; nenhuma aprovação/banco foi alterada.

## Busca, clientes e Visual Law
- [x] Incluir cadastro real de cliente vinculado a caso, histórico e atualização do painel.
- [x] Criar tela de status das integrações com botões usando credenciais salvas; ZapSign e Mercado Pago verificam acesso, sem operações externas automáticas.
- [x] Criar busca rápida no cabeçalho por cliente, CPF, RG, celular, petição/processo e protocolo, respeitando acesso.
- [x] Criar Clientes com filtros e ficha de informações, processos e documentos disponíveis.
- [ ] Importar clientes, processos e documentos reais do ProJuris — bloqueado: credenciais e endereço da API do escritório.
- [x] Conferir regras visuais dos prompts e aplicar pré-visualização de peça na Produção e estilos DOCX, mantendo revisão jurídica.
- [ ] Verificar conexão ProJuris — bloqueado: autenticação e endpoint do escritório não confirmados.
- [ ] Verificar conexão UltraMsg — bloqueado: documentação exige token na URL; confirmar alternativa segura antes de usar credenciais.
- [x] Verificar cadastro e histórico após recarga, busca por RG, atualização do painel e Visual Law com conta master; 28 testes aprovados, Word gerado validado, tela de 390 px sem transbordamento.

## Preparação das integrações
- [x] Preparar contrato de integração Claude sem substituir a IA atual; modelo confirmado no catálogo, sem chamada de inferência nesta preparação.
- [x] Preparar contratos ZapSign com base em https://docs.zapsign.com.br, Mercado Pago e UltraMsg; operações reais continuam bloqueadas.
- [x] Exibir presença de credenciais e pendências em Configurações; conferir com conta master e 7 testes aprovados.
- [ ] Ativar ZapSign, Mercado Pago e UltraMsg — bloqueado: credenciais privadas e confirmação do fluxo de ativação.
- [ ] Ativar e testar inferência Claude separadamente — aguardando autorização para ativação; IA atual permanece inalterada.

- [x] Criar fila de aprovações de minutas por advogado, com prazo salvo, status da versão atual e atualização automática.
- [x] Verificar a fila autenticada, busca, prazo persistido após recarga, visualização da minuta e tela pequena sem alterar permissões de aprovação.
- [x] Exigir aprovação jurídica separada de checklist e minutas, com bloqueio de avanço e invalidação por alteração.
- [x] Verificar regras de autorização e bloqueio no atendimento, produção, auditoria e protocolo: testes de regras e tentativa real de avanço negada à atendente.
- [x] Criar painel geral de casos com status, prazos e pendências, atualização automática a cada 15 segundos e acesso conforme perfil.
- [x] Adicionar gráficos ao painel: casos em andamento por etapa, checklist concluída, prazos vencidos e pendências por categoria; verificar renderização autenticada.

- [x] Consolidar os três prompts anexados e preservar suas regras de segurança documental.
- [x] Construir Produção: checklist, arquivos privados, análise de conteúdo, cópias finais, minuta IA e exportação DOCX/memorial PDF.
- [x] Construir Auditoria: 16 categorias, relatório IA com leitura dos anexos, pendências e validação humana protegida.
- [x] Construir Protocolo: conferência final e registro externo; autuação e vínculo ProJuris demonstrativos.
- [x] Construir Andamentos: registros manuais, prazos, tarefas e avisos demonstrativos.
- [x] Construir Treinamento de IA: instruções versionadas, temas proibidos, testes reais e exemplos revisados.
- [x] Construir Configurações: perfil, permissões informativas e estado das integrações.
- [x] Verificar persistência, 11 testes, navegação autenticada, upload e respostas reais de IA; tela pequena sem transbordamento.
- [x] Preparar relatório em português com limites explícitos.

## Limites desta entrega

- Atribuição a advogado e leitura integral da nova fila aguardam uma conta com perfil jurídico; a sessão disponível tem perfil atendente e nenhum advogado cadastrado foi retornado. A fila não concede aprovação ou edição de minutas de outros usuários.
- Serviços externos e tribunal não conectados: dependem de credenciais e fluxos n8n reais; não há protocolo ou aviso real.
- Conversão/compressão, agrupamento de fotos, análise ZIP do chat e pesquisa de jurisprudência externa não automatizados nesta entrega. PDFs grandes e documentos ambíguos ficam para revisão manual.
- As aprovações estão protegidas por perfil, mas não foram exercidas com conta júnior/sênior; a conta disponível é atendente.
- Painel integral disponível à sênior e administração; demais perfis veem casos próprios. Leitura integral e aprovação positiva aguardam uma sessão desses perfis para verificação ponta a ponta; não houve alteração de cargos de usuários.
- Exportação DOCX tem cabeçalho/rodapé e margens; a reprodução integral dos modelos visuais e validação de paginação continuam fora desta etapa.
## Integração real ProJuris (aguardando credenciais)

- [ ] Cadastrar clientes/casos no ProJuris a partir do atendimento — bloqueado: credenciais de API.
- [ ] Vincular processo (CNJ) ao caso no ProJuris — bloqueado: credenciais de API.
- [ ] Enviar pacote final aprovado ao ProJuris — bloqueado: credenciais de API.
- [ ] Receber andamentos/prazos do ProJuris (webhook) em Andamentos — bloqueado: credenciais de API.

## Pacote de continuação — 22/10/2026
- [x] Gerar manager-adv-cs-lawyers_v3.zip com o estado atual do projeto para continuar em outra IA: 112 testes aprovados, compilação sem erros, sem .env nem chaves privadas.
