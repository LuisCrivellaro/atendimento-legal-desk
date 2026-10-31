# Clientes CS.IA integrados ao ProJuris

## Resultado esperado

Atualizar o módulo Clientes para mostrar a carteira elegível do ProJuris, os cadastros completos e os processos associados, com telefone copiável na lista e alterações cadastrais enviadas ao ProJuris.

### 1. Filtragem e consulta
- Exibir somente pessoas cadastradas desde **01/01/2025**, inclusive, com pelo menos um processo **ativo** em que estejam identificadas como cliente.
- Consultar o código de situação “Ativo” no ProJuris, sem assumir um número fixo.
- Buscar os campos cadastrais disponíveis e os processos vinculados pelo **código da pessoa**, nunca por semelhança de nomes.
- A lista respeita a coorte; a ficha mostra os demais processos associados em que a pessoa é cliente, identificando sua situação.
- Datas de cadastro ausentes ou inválidas não comprovam elegibilidade; sinalizar a quantidade excluída por falta de informação.
- Manter o acesso integral restrito à advogada sênior/admin. Não importar arquivos, documentos ou módulos financeiros, nem enviar dados processuais aos clientes.

### 2. Lista e ficha
- Mostrar WhatsApp/telefone em coluna própria, com botão de copiar sem abrir a ficha.
- Abrir cadastro completo e processos em uma ficha organizada, com indicação de campos não informados e falhas de consulta.
- Retirar os contadores de clientes fictícios do cabeçalho da lista ProJuris; não apagar casos nem históricos locais.

### 3. Nomes padronizados
- Usar **RT 114 - Nome completo** ou **AC 230 - Nome completo**, com o código de cadastro da pessoa no ProJuris, não o código do processo.
- Conforme sua escolha, pessoas com ações RT e AC ativas aparecem como **RT/AC 114 - Nome completo**.
- Classificar a partir de informações verificáveis dos processos; casos sem classificação suficiente ficam identificados para conferência, sem inventar RT ou AC.
- Aplicar o mesmo nome na lista de Clientes, no cabeçalho do Atendimento e na lista de conversas que tenham vínculo confirmado com o cadastro.
- Preservar o nome completo original para mensagens, documentos e identificação. Não vincular conversas apenas pelo nome nem confirmar vínculos pendentes automaticamente.

### 4. Atualização do cadastro
- Incluir edição dos campos cadastrais suportados pelos endpoints documentados, com salvamento direto no ProJuris pela conta autorizada.
- Reconsultar o cadastro antes de alterar, preservar os demais campos e verificar o resultado depois do envio.
- Nome, dados pessoais, telefones, e-mails e endereços usam suas operações apropriadas; campos técnicos, identificadores e dados de processos não são livremente editáveis.
- Se uma operação for recusada ou seu resultado não puder ser confirmado, mostrar erro ou estado de conferência, nunca sucesso fictício.
- Atualizar a ficha e os nomes exibidos após sucesso confirmado. Não sincronizar automaticamente alterações feitas fora do módulo Clientes.

## Detalhes técnicos

- Reutilizar o cliente ProJuris, sua lista fechada de operações, autenticação, limite de requisições e tratamento de falhas.
- Expandir a lista fechada somente para leitura necessária e atualização cadastral explicitamente solicitada; sem exclusão, tarefas, agenda, documentos ou finanças.
- Confirmar os formatos reais dos cadastros e os campos de classificação com consultas de leitura antes de implementar os mapeamentos.
- A documentação indica **PUT /pessoa**, não PUT /pessoa/{id}; telefones, e-mails e endereços têm operações próprias. Não assumir que um PUT parcial preserva campos omitidos.
- Manter a consulta ao vivo, cache temporário no servidor e vínculo existente das conversas, sem nova tabela ou migração. “Importação” significa carregar e relacionar os dados reais na plataforma, sem uma segunda base cadastral independente.
- Preservar isolamento dos casos, aprovações jurídicas, pausas da Ana e regras de envio. Não alterar prompt, agenda ou canais.

## Verificação e limites

- Acrescentar testes das regras de data, processos ativos, vínculo por código e classificação única/mista.
- Executar os testes afetados e conferir a compilação automática.
- Verificar a listagem, telefone copiável, ficha e nomes numa sessão autenticada autorizada.
- Não alterar cadastro real só para testar: o salvamento será exercitado com respostas controladas; a confirmação real de escrita depende de uma alteração cadastral verdadeira autorizada pela doutora.
- **Não publicar, enviar mensagens ou notificações.**