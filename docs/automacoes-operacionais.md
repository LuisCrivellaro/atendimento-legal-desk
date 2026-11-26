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
| Bloqueado (ou conversa "Desligada", ou pausa) | nada | nada |

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
