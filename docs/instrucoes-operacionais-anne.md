# Instruções dinâmicas e avisos operacionais da Anne (27/11/2026)

Onde: **Treinamento de IA → Orientações → "Avisos e instruções operacionais"**. As "Instruções de atendimento" e o
"Não pode dizer" continuam iguais; as instruções operacionais são uma seção nova, com prazo e efeito no servidor.

## Como funciona
1. A equipe escreve em linguagem natural (ex.: "Não agendar consultas para as próximas 2 horas") e clica em
   **Adicionar instrução**.
2. O servidor interpreta (`interpretarInstrucaoAnne`): expressões de tempo viram **datas absolutas no horário de
   Brasília** (America/Sao_Paulo) no momento do cadastro, a instrução vira **regras estruturadas** e a tela mostra a
   prévia: o que a Anne entendeu, validade, funções afetadas, consultas já marcadas no período e pendências.
3. A equipe ajusta (título, categoria, prioridade, tipo, início/término, período bloqueado ou "só orientação"),
   marca **Confirmo a interpretação** e clica em **Ativar instrução** (`salvarInstrucaoAnne`). O servidor
   reinterpreta e revalida tudo antes de gravar — o navegador nunca define as regras.
4. Vale **na hora**, sem republicar: a Anne e as rotinas leem a lista do banco a cada ação. Expira sozinha (a
   validade é calculada na leitura, sem rotina periódica) e o registro fica no histórico. **Desativar agora**
   (`desativarInstrucaoAnne`) também vale na próxima leitura.

Permissões: ver — qualquer usuário da área de trabalho; criar, editar e desativar — **advogada sênior ou admin**
(`user_roles`). Mensagens de clientes pelo WhatsApp nunca chegam a essas funções (não há caminho do webhook/Anne).
Armazenamento: `office_workspace.dados.instrucoesOperacionais` (sem migração), gravado só pelo servidor com CAS e
preservado pelo `saveOffice` (a tela nunca grava essa chave). Vale para a área de trabalho de quem cadastra — a mesma
regra da configuração da secretaria digital: cadastre na conta que recebe o WhatsApp.

## Regras estruturadas
| Regra | Efeito no servidor |
|---|---|
| `bloquear_periodo_agenda` (início/fim) | Horários que se sobrepõem ao período não são oferecidos nem reservados pela Anne; horários depois continuam livres. Vale desde o cadastro (nenhum horário do período é oferecido antes). |
| `suspender_agendamentos` | Nenhum novo agendamento ou remarcação pela Anne, em qualquer data, enquanto vale. |
| `suspender_captacao` | Sem oferta de consulta/agendamento para lead novo (a saudação inicial fica para a equipe). |
| `suspender_automacao` | Pausa uma automação: lembretes, confirmações, reagendamento automático, coleta de documentos, vendedor, lembretes de audiência/perícia, relatório do advogado ou encaminhamento ao advogado. |
| `comportamental` | Só orientação no contexto da Anne (`instrucoes_operacionais`), sem bloqueio automático. |

"Bloquear horários" × "suspender todos os novos agendamentos": com período citado ("próximas 2 horas", "amanhã das 14h
às 17h", "de 10/12 a 20/12") bloqueia só o período; sem período, ou com "suspender/pausar/parar", suspende tudo.

## Onde é aplicado
- **Oferta de horários** (`ocupadosAgendaAnne`): bloqueios entram como ocupados nas leituras da Anne
  (`processarAna`), do reagendamento automático (`secretaria.server.ts`) e do vendedor.
- **Revalidação antes de reservar/remarcar**: porta `revalidar` de `reservarAgenda`/`remarcarAgenda`, relida do banco
  antes do Meet e da reserva oficial. Horário oferecido antes da restrição → "Esse horário não está mais disponível."
  com novas opções conferidas (ou texto fixo sem data, quando nada está livre).
- **Rotinas** (monitor de 5 min, funciona com o Manager fechado): lembretes, confirmações, coleta, eventos
  processuais, vendedor e relatório do advogado pulam quando suspensos; o reagendamento automático
  (`iniciarReagendamentoAutomatico`) não age e o fluxo anterior segue (pergunta/alerta para a equipe).
- **Encaminhamento ao advogado**: suspenso → a decisão de encaminhar fica desligada.
- **Contexto da Anne**: instruções vigentes (prioridade mais alta primeiro) em `instrucoes_operacionais`; a hierarquia
  está em `ana-restrictions.txt`.
- **Consultas já marcadas no período bloqueado**: aviso para a equipe em cada conversa (`avisosEquipe`, tipo
  `instrucao`). Nada é cancelado, alterado ou remarcado por uma instrução.

## Hierarquia
1. Segurança, privacidade, permissões e restrições jurídicas obrigatórias.
2. Regras fundamentais e bloqueios explícitos do sistema.
3. Instruções operacionais ativas e autorizadas.
4. Regras gerais de atendimento.
5. Interpretação conversacional da Anne.

Instrução nunca: libera fim de semana/feriado, desliga regras de segurança, autoriza divulgar dados, altera mensagem
oficial, cancela consultas, promete resultado, dá orientação jurídica ou muda a carteira novo/cadastrado — o
interpretador recusa (`bloqueios`). Instruções só restringem ou orientam; para liberar algo suspenso, desative a
instrução (uma instrução contrária a outra vigente é recusada como **conflito**; a mesma restrição repetida gera aviso).

## Ambiguidade
Sem período quando ele é necessário ("durante as férias", "bloquear a agenda", "a partir de amanhã" sem término) a
instrução não é ativada até a equipe informar o período. "Até segunda" é lido como até 00:00 de segunda e isso aparece
na confirmação para ajuste. Se a leitura automática não corresponder à intenção, a equipe pode marcar "só orientação".

## Interpretação
Determinística (sem custo de IA, funciona com a IA pausada), em `instrucoes-operacionais.ts`. Não é só prompt: a regra
estruturada é validada pelo servidor; o texto aprovado também vai ao contexto da Anne como orientação.

## Testes
`src/test/instrucoes-operacionais.test.ts` (2 horas, data específica, início futuro, permanente, expiração, desativação,
simultâneas, conflito, ambígua, fuso, conversa em andamento, horário oferecido antes da restrição, reserva no período,
consultas existentes, motor operacional/híbrido, rotinas com o navegador fechado, cliente tentando mudar regras,
regras fundamentais), `src/test/instrucoes-operacionais-salvamento.test.ts` (o navegador não grava) e o cenário D61 da
bateria da Anne.
