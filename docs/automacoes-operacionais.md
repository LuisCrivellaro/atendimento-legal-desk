# Automações operacionais da Anne (finalização, 26/11/2026)

A Anne tem duas camadas independentes:

- **Conversacional**: responde ao cliente com o modelo (modo Automático). A equipe assumir a conversa desliga só esta camada.
- **Operacional**: lembrete, confirmação de presença, reagendamento, sincronização da agenda, coleta e avisos. Roda no
  servidor pelo monitor central, com textos oficiais e regras determinísticas, inclusive com a equipe na conversa (Híbrido).

| Modo da conversa | Conversacional | Operacional |
|---|---|---|
| Automático | Anne responde | ligada |
| Híbrido (equipe assumiu / Anne conversacional desligada) | equipe | ligada (só as automações autorizadas) |
| Humano | equipe | só avisos e textos prontos para a equipe |
| Bloqueado (ou conversa "Desligada", ou pausa da conversa) | nada | nada |
| IA pausada no escritório (chave do Claude recusada; ver 1.1) | espera a retomada | ligada |

A secretaria digital vem **ligada por padrão** desde 26/11/2026. Desligar: Automações → Secretaria digital → interruptor
(volta ao comportamento anterior) ou, no servidor, `ANNE_SECRETARIA_DESLIGADA=1`. Cada automação pode ser desligada
sozinha em **Permissões por funcionalidade**.

## 1. Monitor central

Um único agendamento (`monitorar-ana`, a cada 5 min; ver `docs/rotinas-agendadas.md`) executa todas as etapas,
cada uma isolada e idempotente, e grava o estado em `ana_monitoramento` (`monitor-operacional`).

Painel (Atendimento → engrenagem → **Automações do atendimento**):

- estado (funcionando, falhas em etapas, **parado**), última execução, próxima prevista, ProJuris e WhatsApp;
- etapas da última execução com contagens; motivos de bloqueio das mensagens que não saíram;
- mensagens programadas das próximas 36 h (lembrete e confirmação): prevista, enviada ou "não sai" com o motivo;
- compromissos do ProJuris sem vínculo seguro; mensagens automáticas enviadas hoje; histórico das últimas execuções.

Sem execução há mais de 15 minutos, aparece um alerta vermelho no topo da lista do Atendimento
("Automações da Anne paradas…"). Nada é enviado enquanto a rotina estiver parada. A auditoria (`audit_log`)
registra só as transições (etapa que passou a falhar e que voltou).

### 1.1 Pausa da IA (chave do Claude recusada)

Quando o Claude recusa a chave ou a conta (401/402/403/404), o servidor liga sozinho a pausa da IA do escritório
(`office_workspace.dados.anaPausa`, com `motivo` curto e `desde`). Regras (`pausa-ia.ts`, `pausa-ia.server.ts`):

- **Só as respostas escritas pelo modelo esperam.** Confirmação de presença, lembrete, cobrança de documentos,
  reagendamento, follow-up comercial, textos oficiais, "ok" à confirmação (texto fixo) e envios da equipe continuam.
- A mensagem do cliente que precisava do modelo fica **estacionada** (`iaExecucao.estado = 'aguardando'` sem
  `retryEm`) e a conversa **não** passa para a equipe por causa da chave. A equipe pode responder antes; se responder,
  a Anne não fala por cima.
- A etapa **`pausa-ia`** do monitor (primeira do ciclo) não faz nada sem pausa. Com pausa, testa a chave com uma
  chamada de 1 token, sem dado de cliente. Se o Claude aceitar, desliga a pausa (CAS), devolve à fila a última
  mensagem de cada cliente recebida durante a pausa (até 24 h; sem equipe no controle; pausa antiga sem `desde`:
  últimas 6 h) e audita (`pausaIA`). A etapa `recuperar-ana` responde essas mensagens no mesmo ciclo (2 por ciclo).
  Chave ainda recusada: a etapa aparece com falha no painel, com o motivo.
- No Atendimento, um aviso amarelo no topo da lista mostra a pausa, o motivo e o que continua. Sênior/admin têm o
  botão **Testar a chave e retomar** (`retomarIAAnne`): ele testa antes e não retoma com a chave ainda recusada.
- A tela nunca grava nem apaga a pausa (`saveOffice` ignora `anaPausa` do navegador).

## 2. Consultas marcadas direto no ProJuris

`sincronizacao-agenda.ts` (puro) + etapa `agenda-projuris`:

- Lê os compromissos de 2 h atrás até 15 dias à frente. Compromisso criado pelo Manager ADV (`codigoExterno manageradv:`) já tem recibo e é ignorado aqui.
- Vínculo só inequívoco: **telefone do cliente no título ou na descrição** do compromisso (contato liberado da conversa) ou o nome completo do cadastro com vínculo ProJuris **confirmado**, e um único cliente possível. Recibo gravado = código oficial (`pj:<codigo>`) + horários lidos da agenda.
- Mais de um cliente possível, ou cliente com outra consulta marcada: **pendência** no painel (e aviso na conversa, quando houver uma), nenhuma automação.
- Horário alterado no ProJuris: a conversa segue o novo horário (lembrete e confirmação também).
- Compromisso que sumiu da listagem: conferido pelo código. Só "concluído" ou "inexistente" cancela (consulta cancelada, lembrete e confirmação suspensos, aviso à equipe). Erro do ProJuris nunca cancela nem altera nada.

**Para a Anne reconhecer uma consulta marcada à mão no ProJuris, coloque o telefone do cliente no título ou na descrição.**

## 3. Lembrete e confirmação de presença

- Lembrete das 08h (modelo oficial 01) mantido; o monitor tenta entre 8h e 12h e nunca a menos de 30 min da consulta.
- Confirmação de presença: padrão **2 h antes**, configurável (Secretaria digital → "Confirmação de presença"). Não sai se a presença já foi confirmada, se o lembrete saiu há menos de 90 min, se a equipe já falou da consulta nas últimas 3 h, ou se a consulta foi registrada como realizada, ausência ou cancelada.
- Textos: biblioteca oficial (02 de manhã, 08.2 à tarde). "Bom dia", "Hoje" e "Amanhã" nunca são alterados: só sai o modelo compatível com o horário; sem modelo compatível, a equipe recebe aviso.

## 4. Situação da consulta

`situacao-consulta.ts`: agendada, presença confirmada, realizada, ausência (faltou), cancelada.

- Realizada e ausência só por **registro da equipe** (botões "Realizada" e "Cliente faltou" no painel da Anne na conversa), nunca porque o horário passou.
- Consulta passada há mais de 1 h sem registro: um aviso à equipe.
- Cancelada: cancelamento autorizado ou compromisso concluído/excluído no ProJuris (conferido pelo código).

## 5. Reagendamento automático

Quando o cliente responde que não poderá comparecer (ao lembrete ou à confirmação) ou a equipe registra a falta:

1. Confere modo (Automático ou Híbrido; nunca Humano/Bloqueado), permissão, recibo da consulta e se já há outro reagendamento.
2. Consulta horários **reais** livres na agenda oficial.
3. Oferece pelo texto oficial: modelo 06 quando há dois horários hoje; senão a lista aprovada do agendamento ("Tenho estes horários livres na agenda: …"), só em resposta ao cliente ou por delegação da equipe.
4. Escolha clara de uma opção → remarca (reserva o novo antes de concluir o antigo, revalidando a disponibilidade; nunca exclui). Horário fora da lista é conferido e, se livre, pede o aceite com a frase aprovada.
5. Só confirma ao cliente com o recibo da agenda (modelo 08.1 ou a confirmação aprovada com o link real do Meet).

Vai para a equipe, sem mensagem improvisada: agenda indisponível, sem horários, resposta ambígua duas vezes, pedido de
pessoa, recibo divergente, falha da remarcação, e **falta registrada sem dois horários livres hoje** (não há modelo
oficial para esse contato; registrar uma variante na biblioteca se a Dra. quiser que a Anne envie).
Em caso de sucesso, o aviso "cliente não vai conseguir" fica resolvido pela Anne (continua no histórico).

## 6. Modo de teste controlado

Secretaria digital → **Modo de teste das automações** + número autorizado (com DDD). Ligado, lembrete, confirmação e
reagendamento automáticos só saem para esse número; todos os outros contatos ficam sem automação (contagem
"modo de teste" no monitor). Nenhum teste deste trabalho enviou mensagem real: todos usam canal e agenda em memória.

## 7. Testes

- `src/test/anne-monitor-operacional.test.ts`: sincronização (telefone, nome confirmado, ambiguidade, outra consulta, horário alterado, cancelamento verificado, falha do ProJuris), consulta criada no ProJuris até a confirmação, eventos duplicados, monitor com site fechado, falha isolada (UltraMsg), orçamento do ciclo, rotina parada, resumo sem dado de cliente, programadas, independência das camadas, automação desligada, lembrete nunca depois do início.
- `src/test/anne-secretaria-cenarios.test.ts`: não poderá comparecer (Híbrido) → lista real → remarcação com recibo; agenda fora; falta registrada → modelo 06 → remarcação; falta sem dois horários hoje; Humano; modo de teste; webhooks duplicados; falha de integração.
- `src/test/anne-secretaria-rotinas.test.ts`: 2 h padrão e configurável, presença confirmada, realizada/ausência/cancelada, modo de teste, falha do UltraMsg, secretaria padrão ligada.
- `src/test/anne-secretaria-modos-motor.test.ts`: padrão ligado, antecedência, modo de teste no motor e no esquema de gravação.

## 8. Missão final (26/11/2026)

- Coleta, pergunta de encerramento e lembretes de audiência/perícia também passam pelo motor (Híbrido envia;
  Humano/Bloqueado avisam a equipe). Lembretes de coleta e a pergunta de encerramento não são da biblioteca oficial:
  só saem sozinhos com o texto exato aprovado pela Dra. em Automações → Secretaria digital.
- Compromisso concluído/sumido no ProJuris antes do horário não cancela mais a consulta: suspende as automações e
  avisa a equipe; reabrir o compromisso retoma. Reserva da Anne sem gravação local vira pendência prioritária.
- Audiências e perícias: registro por evento, redesignação/cancelamento, lembretes T04/T12.2 e confirmações
  T11.2/T12.3 prontos (saem depois que a Dra. ativar os modelos); sincronização automática de andamentos.
- Checklist trabalhista T09 por autorização da equipe; transcrição/resumo da consulta com Drive; indicador de pronto
  para a Produção; resumo do Atendimento no painel. Detalhes: `docs/ATENDIMENTO-HOMOLOGACAO-FINAL.md`.
