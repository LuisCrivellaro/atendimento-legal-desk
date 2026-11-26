# Rotinas agendadas do Atendimento

Desde 26/11/2026 existe **um único agendamento**: o monitor central `monitorar-ana`, a cada 5 minutos.
Ele executa todas as automações da Anne no servidor (sem navegador aberto e sem ninguém conectado) e grava o
resultado de cada etapa em `ana_monitoramento` (id `monitor-operacional`), que aparece em
**Atendimento → Automações do atendimento → Monitor das automações**. Detalhes em `docs/automacoes-operacionais.md`.

## O único agendamento necessário

| Campo | Valor |
|---|---|
| Método | `POST` |
| URL | `https://cslawyers.lovable.app/api/public/atendimento/monitorar-ana` |
| Frequência | a cada 5 minutos (`*/5 * * * *`) |
| Cabeçalho | `Authorization: Bearer <LOVABLE_CRON_SECRET>` (o segredo já cadastrado no projeto; nunca na URL) |

A autenticação é conferida em `authenticateCronRequest`. O domínio antigo devolve 404: use só `cslawyers.lovable.app`.

## O que o monitor executa (ordem de prioridade, orçamento de ~45 s por ciclo)

| Etapa | Quando | O que faz |
|---|---|---|
| `agenda-projuris` | todo ciclo | Reconhece consultas marcadas direto no ProJuris, segue horários alterados; compromisso concluído/sumido antes do horário suspende as automações para conferência (nunca cancela); reserva da Anne sem gravação local vira pendência |
| `confirmacoes` | todo ciclo | Confirmação de presença (padrão 2 h antes, configurável) |
| `lembretes` | 8h–12h (São Paulo) | Lembrete do dia (modelo oficial 01, "Bom dia"); nunca a menos de 30 min da consulta |
| `registro-consultas` | todo ciclo | Consulta passada sem registro de realizada/ausência → um aviso à equipe |
| `eventos-processuais` | todo ciclo (envia só em dia útil 9h–18h) | T12.2 na véspera da perícia, T04 para audiência presencial, T11.2/T12.3 se a equipe ligar; só com modelo ativado pela Dra. |
| `andamentos-projuris` | a cada 30 min | Sincroniza até 3 processos de clientes com vínculo confirmado (prioridade: evento futuro, depois o mais antigo) |
| `pendencias-processo` | WhatsApp ativo | Notícias processuais aprovadas e pendentes |
| `recuperar-ana` | todo ciclo | Recuperação segura de respostas da Anne |
| `coleta` | a cada 30 min | Contrato (24 h) e documentos faltantes (48 h), dias úteis 9h–17h30 |
| `vendedor` | a cada 30 min | Follow-up comercial |
| `reservas-pendentes` | todo ciclo | Lança no ProJuris reservas provisórias feitas no Google Calendar |
| `relatorio-diario` | 8h–10h | Relatório do dia anterior (uma vez por dia) |

Depois das etapas, o monitor atualiza os nomes da agenda do WhatsApp e a saúde da Anne (como antes).
Cada etapa é isolada (a falha de uma não para as outras) e idempotente (reserva antes do envio), então ciclos
repetidos ou agendamentos duplicados não duplicam mensagens. Desde 26/11/2026 (missão final):
- trava atômica do ciclo (`ana_monitoramento` id `monitor-operacional-trava`): dois disparos simultâneos nunca
  executam juntos; trava de ciclo interrompido é retomada depois de 2 minutos;
- limite de tempo por etapa (20 s; 25 s para o ProJuris): integração lenta vira falha registrada e as demais seguem;
- etapa sem tempo no ciclo fica "adiada", roda primeiro no ciclo seguinte e nunca é marcada como executada;
- se o estado do monitor não for gravado, a rota responde 503 (nunca sucesso falso).

## Rotinas antigas (agora redundantes)

As rotas abaixo continuam respondendo, mas **não precisam mais de agendamento próprio**. Se estiverem cadastradas
no agendador do Lovable, podem ser removidas (manter não duplica envio, só gasta execuções):

- `/api/public/atendimento/confirmacao-consulta`
- `/api/public/atendimento/lembrete-consulta`
- `/api/public/atendimento/lembretes-atendimento`
- `/api/public/atendimento/pendencias-processo`
- `/api/public/atendimento/recuperar-ana`
- `/api/public/atendimento/relatorio-diario`

## Alternativa com pg_cron (só se o projeto migrar; não executar sem revisão)

```sql
select cron.schedule('manageradv-monitorar-ana', '*/5 * * * *', $$select rotinas.chamar('/api/public/atendimento/monitorar-ana')$$);
```

## Lembretes de coleta (P0-3)

- Contrato não assinado: 24 h depois do envio real (`contrato` enviado/visualizado com link HTTPS); faltantes: a cada 48 h desde o último pedido ou lembrete.
- Só em dia útil, das 9h às 17h30 (São Paulo), sem feriado nacional. No máximo 3 lembretes por pendência (contrato por link; faltantes por item); depois, aviso à equipe.
- Chaves `lembreteContrato` e `lembreteFaltantes` do dono; modo Desligada não faz nada; Sugerir, controle humano, pausa ou contato não liberado geram aviso com texto pronto, sem envio.
- Textos propostos editáveis em Mensagens prontas (`/lembrecontrato`, `/lembrefaltantes`); o servidor usa a versão salva.

## Confirmação de presença

- Envia no primeiro ciclo em que faltam no máximo a antecedência configurada (padrão **2 h**, de 30 min a 24 h em
  Automações → Secretaria digital) e mais de 30 minutos; com 30 minutos ou menos vira aviso à equipe.
- Só para consultas de hoje com recibo verificado (`agenteAna.reservaCalendar.inicio === consultaAgendada`), canal UltraMsg ativo e contato liberado e vinculado à conversa.
- Não sai quando a presença já foi confirmada (resposta ao lembrete ou registro), quando o lembrete saiu há menos de 90 minutos, quando a equipe já falou da consulta nas últimas 3 h, ou quando a consulta foi registrada como realizada, ausência ou cancelada.
- Reserva antes de enviar (`agenteAna.confirmacao40`, nome mantido por compatibilidade; CAS em `atualizarConversa`); nunca reenvia depois de falha.
- Processa no máximo 20 envios e cerca de 40 s por ciclo; o restante fica para o ciclo seguinte.
