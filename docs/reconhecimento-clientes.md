# Correção de reconhecimento — Anne

## Resultado
- O índice completo de telefones principais substitui a lista parcial como origem do reconhecimento. Cadastro único sozinho não prova processo ativo.
- Processos ativos verificados, contrato, etapa e histórico do próprio contato protegem atendimentos existentes contra reinício comercial.
- Cadastro anterior e identificação duvidosa nunca iniciam captação automática, mas a dúvida é resolvida internamente (26/11/2026): a Anne não pergunta "atendimento em andamento ou nova demanda?" nem variações (ver abaixo).
- Vídeos, imagens e documentos permanecem na conversa para conferência, sem associação automática nem alegações de análise/salvamento/encaminhamento.
- Áudio permanece silencioso. Controle humano e consulta factual revisada continuam prevalecendo.
- Agenda oficial, carteira de clientes, aprovação jurídica e integrações foram preservadas. Nenhuma migração ou alteração de permissões.

## Classificação interna, sem pergunta ao cliente (26/11/2026)
Causa do erro recorrente: `protegerRelacionamentoAna` trocava qualquer resposta de contato `incerto` ou `cadastro_anterior` pela pergunta "Esse assunto é de um atendimento que já está em andamento conosco ou é uma nova demanda?" (e variações para cliente ativo), e a única saída desses estados era o cliente responder a ela — com telefone em dois cadastros nem isso, então a pergunta se repetia a cada mensagem. A REGRA MASTER do prompt mandava "esclarecer se retoma atendimento ou é nova demanda", o contexto dizia `tipo_cliente_agenda: desconhecido; perguntar` e as regras de agenda perguntavam "É seu primeiro contato ou você já é cliente do escritório?".

Agora (`ana-demanda.ts`, compartilhado por produção e simulador):
- Leitura interna da mensagem: saudação, outro assunto, nova demanda (relato de problema jurídico ou pedido de consulta), intenção não identificada ou conteúdo.
- Ex-cliente sem processo ativo que relata um problema já é nova demanda (lead); vínculo em conferência só vira lead com sinal explícito (pedido de consulta, "outro assunto" com relato). Telefone em dois cadastros nunca é classificado pelo conteúdo: a equipe confirma. A fala da equipe depois do relato devolve a decisão à equipe; relatos com mais de 30 dias não reclassificam conversa retomada.
- Respostas de contato conhecido: saudação → "Olá! Tudo bem? Como posso te ajudar?"; outro assunto → "Claro! Pode me contar um pouco sobre o assunto?"; sem intenção clara → "Claro! Como posso te ajudar?"; cliente da casa com nova demanda → convite para atendimento com a Dra. (só com "sim" explícito, agenda de cadastrado); acontecimento no caso → reconhecer e continuar o atendimento existente; vínculo em conferência com nova demanda → equipe.
- Saudações seguidas na mesma sessão recebem uma resposta só (sem chamar o modelo).
- O histórico enviado ao modelo traz `origem` (cliente, equipe, anne, automacao); a pessoa da equipe "Ana Paula" não é a Anne.
- Barreira final (`semPerguntaTriagemAna`) em `aplicarRegrasAna` e `protegerRelacionamentoAna` remove qualquer variação vinda do modelo ou do treinamento; a bateria reprova qualquer resposta com a pergunta (`sem-pergunta-triagem`) e um teste varre todos os textos literais do código e dos prompts.

## Verificação
Dez cenários do pedido cobertos por testes de regras; testes do fluxo central incluem mídia, áudio, leitura fora da coorte, duplicidade, falha oficial, controle humano e consulta revisada. Integrações externas são substituídas nos testes: não comprovam entrega real no WhatsApp.

Clientes e Atendimento foram abertos com a conta autenticada, dados reais e zero erros de execução. A página Clientes mostrou 50 linhas na primeira página. Nenhuma mensagem foi enviada ou prova associada durante a verificação.

## Limitações
Publicação e validação completa por mensagens reais no WhatsApp aguardam autorização. O reconhecimento informa vínculo operacional, nunca autorização independente de acesso a fatos processuais.