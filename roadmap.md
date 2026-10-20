# Construção dos módulos Manager ADV

## Busca, clientes e Visual Law
- [ ] Incluir cadastro real de cliente vinculado a caso, histórico e atualização do painel.
- [ ] Criar tela de status das integrações com verificação de conexão usando credenciais salvas, sem operações externas automáticas.
- [ ] Criar busca rápida no cabeçalho por cliente, CPF, RG, celular, petição/processo e protocolo, respeitando acesso.
- [ ] Criar Clientes com filtros e ficha de informações, processos e documentos disponíveis.
- [ ] Importar clientes, processos e documentos reais do ProJuris — bloqueado: credenciais e endereço da API do escritório.
- [ ] Conferir regras visuais dos prompts e aplicar pré-visualização de peça na Produção, mantendo revisão jurídica.
- [ ] Verificar busca e ficha com sessão autenticada e executar testes relevantes.

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
