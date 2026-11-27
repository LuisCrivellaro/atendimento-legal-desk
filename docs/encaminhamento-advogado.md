# Encaminhamento de clientes ativos ao advogado (Fernando)

Pedido de 26/11/2026. Cliente ativo da CS Lawyers que escreve com dúvida, solicitação, questão jurídica ou pedido
para falar com a Dra. Carolina recebe a mensagem fixa e entra na fila do advogado responsável (Fernando).

## Como funciona
- **Quem**: só cliente ativo confirmado (cadastro único no ProJuris com processo ativo, contrato assinado ou etapa
  ativa), modo Automática e encaminhamento ligado. Novos leads, ex-clientes, vínculo em conferência e
  `em_atendimento` seguem o fluxo anterior. A Anne não pergunta se é nova demanda (classificação interna).
- **Fica com a Anne**: agendamento, remarcação, cancelamento, confirmação de presença, lembrete, reagendamento,
  notícia do processo (fluxo revisado), coleta de documentos, mídia e cobrança de retorno sem pendência aberta.
- **Decisão**: antes da IA só o que é claramente do advogado (saudação, pedido para falar com a Dra./advogado,
  cobrança com pendência aberta); com a IA pausada, todo o resto que não é agenda/processo (nada fica parado);
  depois da classificação, tudo que não for processo ou agendamento.
- **Mensagem fixa** (`mensagemEncaminhamento`, código, nunca IA): só o primeiro nome verificado muda; sem nome,
  "Olá,". Uma reserva de envio por vez: se outra mensagem do cliente chega antes, o aviso sai por ela (uma só).
  Equipe assumiu antes do envio: não sai, a pendência fica. Falha do canal: "incerto", sem reenvio automático.
- **Pendência** (`conversa.encaminhamentos`, JSON do caso, sem migração; a integração com o ProJuris não pode criar
  tarefas — `src/lib/projuris/AGENTS.md`): nome, telefone, data/hora, mensagem de origem, mensagens seguintes,
  processo relacionado (um ativo → ele; vários → só com indicação clara; segredo sem número), link da conversa,
  responsável e situação. Gravação do navegador nunca apaga a fila (`salvarCaso` mantém a do banco).
- **Situação derivada das mensagens reais**: resposta efetiva da equipe depois da última mensagem do cliente =
  Respondido (saudação, "vou verificar" ou "Boa tarde, Marina!" não bastam → Em atendimento); nova mensagem do
  cliente depois da resposta volta a Aguardando (mesma pendência, sem nova mensagem fixa). Concluído só pela equipe.
  Respondida há mais de 7 dias sem novidade, o próximo contato abre outra pendência.
- **Com pendência aberta** a Anne só registra: não repete a mensagem, não responde questão jurídica, não promete
  prazo e não pausa a conversa (automações de confirmação, lembrete e reagendamento continuam).

## Relatório no WhatsApp do Fernando
- Etapa `relatorio-advogado` do monitor de 5 min (servidor, sem navegador). Horários padrão 09:00 e 16:00
  (America/Sao_Paulo), janela de 2 h.
- Só de segunda a sexta, fora de feriado nacional, dentro do expediente (09:00–17:30): fim de semana e feriado
  nacional (mesma regra da agenda, `feriadoNacional`) não enviam, nem atrasado no dia útil seguinte; a janela das
  16h fecha às 17:30. A configuração recusa horário fora do expediente. Feriados municipais/locais não são
  conhecidos pelo sistema (mesma limitação da agenda).
- Uma mensagem consolidada por horário, da pendência mais antiga para a mais recente, inclusive de dias anteriores;
  respondidas e concluídas ficam fora; sem pendências: "Olá, Fernando! No momento, não há clientes aguardando
  retorno. ✅". O envio não muda a situação das pendências.
- Reserva em `ana_monitoramento` (`relatorio-advogado:<número>:<dia>T<hora>`): recusa definitiva do UltraMsg →
  nova tentativa (até 3, a cada 5 min, dentro da janela); falha sem resposta do provedor → "incerto", sem reenvio.
  Cada tentativa vai para o audit log (`relatorioAdvogado`).
- Destinatário exclusivo: só o número da configuração (celular brasileiro completo); número de contato de cliente é
  bloqueado; número inválido desliga o envio.

## Configuração
Automações do atendimento → Secretaria digital → "Encaminhamento de clientes ativos ao advogado" (sênior/admin):
ligar/desligar, nome do responsável, WhatsApp (padrão 5511991737442), relatório ligado e horários.

## Tela
Atendimento: aba com o nome do advogado (fila, mais antiga primeiro) e painel na conversa com situação, solicitação,
processo e botões Em atendimento / Respondido / Concluir (dono da conversa; CAS e auditoria). O link do relatório
abre `/atendimento?conversa=<id>`.

## Limitações
- Marcar situação pela tela exige ser o dono da conversa (regra de acesso do Atendimento); a resposta efetiva da
  equipe pelo WhatsApp já tira o cliente da lista para qualquer pessoa.
- No modo Sugerir/Desligada o encaminhamento não age (segue o fluxo anterior).
- Falha ambígua do UltraMsg no relatório não é reenviada (conferir o WhatsApp do Fernando e o audit log).
- Não validado com mensagens reais: testes e simulador apenas.
