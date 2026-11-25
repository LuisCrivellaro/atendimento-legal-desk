# Rotinas agendadas do Atendimento

Este repositório não tem o script `supabase/scripts/agendar-rotinas-pg-cron.sql` do clone ManagerADV-Claude.
As rotinas aqui são chamadas pelo agendador gerenciado do Lovable, com o segredo `LOVABLE_CRON_SECRET`
(`Authorization: Bearer <segredo>`), conferido em `authenticateCronRequest`.

Nada nesta lista foi agendado automaticamente. Quem agenda é a equipe, depois de revisar.

| Rota (POST) | Frequência prevista | O que faz | Estado |
|---|---|---|---|
| `/api/public/atendimento/lembrete-consulta` | diária, 08:00 (São Paulo) | Lembrete do dia (SIM/NÃO) | já existia |
| `/api/public/atendimento/relatorio-diario` | diária, 08:00 (São Paulo) | Relatório do dia anterior | já existia |
| `/api/public/atendimento/monitorar-ana` | a cada 5 min | Saúde da Anne e pendências do ProJuris | já existia |
| `/api/public/atendimento/confirmacao-consulta` | **a cada 5 min** | Confirmação 40 min antes da consulta (texto oficial) | **nova, não agendada** |
| `/api/public/atendimento/lembretes-atendimento` | **a cada 30 min** | Lembretes de coleta (contrato 24 h, faltantes 48 h, até 3 por pendência) e follow-up do vendedor | **nova, não agendada** |

Equivalente para pg_cron, caso o projeto migre para o script do ManagerADV-Claude (não executar sem revisão):

```sql
select cron.schedule('manageradv-confirmacao-consulta', '*/5 * * * *', $$select rotinas.chamar('/api/public/atendimento/confirmacao-consulta')$$);
select cron.schedule('manageradv-lembretes-atendimento', '*/30 * * * *', $$select rotinas.chamar('/api/public/atendimento/lembretes-atendimento')$$);
```

## Lembretes de coleta (P0-3)

- Contrato não assinado: 24 h depois do envio real (`contrato` enviado/visualizado com link HTTPS); faltantes: a cada 48 h desde o último pedido ou lembrete.
- Só em dia útil, das 9h às 17h30 (São Paulo), sem feriado nacional. No máximo 3 lembretes por pendência (contrato por link; faltantes por item); depois, aviso à equipe.
- Chaves `lembreteContrato` e `lembreteFaltantes` do dono; modo Desligada não faz nada; Sugerir, controle humano, pausa ou contato não liberado geram aviso com texto pronto, sem envio.
- Textos propostos editáveis em Mensagens prontas (`/lembrecontrato`, `/lembrefaltantes`); o servidor usa a versão salva.

## Confirmação 40 min antes (P0-1)

- Envia no primeiro ciclo em que faltam entre 40 (inclusive) e 50 minutos para a consulta; nunca com menos de 40.
- Só para consultas de hoje com recibo verificado (`agenteAna.reservaCalendar.inicio === consultaAgendada`), canal UltraMsg ativo e contato liberado e vinculado à conversa.
- Reserva antes de enviar (`agenteAna.confirmacao40`, CAS em `atualizarConversa`); nunca reenvia depois de falha.
- Janela perdida, controle humano, Anne pausada, modo Desligada, conversa sem vínculo ou sem recibo: nada é enviado; a equipe recebe um aviso (Atendimento e Assessor).
- Processa no máximo 20 envios e cerca de 40 s por ciclo; o restante fica para o ciclo seguinte.
