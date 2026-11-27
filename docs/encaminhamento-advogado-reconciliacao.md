# Correção: relatório do Fernando "sem pendências" com clientes aguardando (27/11/2026)

## Causa raiz
- A fila do advogado só recebia pendências criadas pela Anne ao processar **mensagens novas**, depois da publicação e
  em modo Automático. Pedidos anteriores à funcionalidade, mensagens recebidas com a conversa em atendimento humano
  (Híbrido/Humano — a Anne não processa) e contatos cuja identificação falhou nunca entravam na fila.
- O relatório lia **só** conversas que já tinham pendência registrada e não verificava nada antes de enviar: lista
  vazia virava "Olá, Fernando! No momento, não há clientes aguardando retorno. ✅".

## Correção
- **Reconciliação de todas as conversas** (`reconciliacao-advogado.ts` puro, `reconciliacao-advogado.server.ts`):
  lê a conversa inteira (não só a última mensagem nem só as não lidas), cruza com a réplica local do ProJuris
  (cliente e processos ativos pelo telefone principal) e com os dados do Manager (etapa, contrato, histórico) e acha
  o pedido do cliente ainda sem resposta humana efetiva. Só conversas reais do WhatsApp (casos de demonstração ficam
  fora). Paginada por id, incremental (cursor e resumo persistidos em `ana_monitoramento`, id
  `reconciliacao-advogado`, só contagens e ids), etapa `reconciliar-advogado` do monitor de 5 min (passagem nova a
  cada 30 min) — funciona com o Manager fechado.
- **Classificação**: pendente (cliente ativo), ambígua (sem vínculo ativo confirmado mas com pedido ao advogado,
  cobrança, pedido indireto ou retorno prometido não cumprido; cadastro indisponível) → entra na fila marcada
  "conferir"; antiga (mais de 30 dias sem retorno) → só na auditoria para conferência; resolvida; fora do escopo
  (agenda, confirmação, escolha de horário, coleta, propaganda, lead em captação).
- **Resolvida só** com resposta humana efetiva da equipe depois do pedido ou confirmação explícita da equipe
  (Respondido/Concluído). Nunca por mensagem automática, visualização, saudação ou "vou verificar" da equipe,
  agradecimento do cliente, atendimento humano, arquivamento ou relatório enviado. Nova dúvida depois de uma resposta
  abre nova pendência.
- **Recuperação sem mensagem ao cliente**: pendência criada com a data original do pedido, aviso `sem_aviso`, id
  determinístico (rodar de novo não duplica; concluída nunca é recriada), na mesma fila (`conversa.encaminhamentos`).
- **Relatório só depois da verificação**: cada horário (09h/16h) exige uma reconciliação iniciada no próprio horário
  e concluída. Sem ela, espera o próximo ciclo; faltando 15 min para fechar a janela, sai a lista conhecida com o aviso
  "⚠️ Não foi possível validar a lista completa…". "Não há clientes aguardando" só com verificação completa, sem
  falhas e sem conversa não verificada; conversas não verificadas geram aviso na mensagem.
- **Pedidos indiretos** entendidos ("A doutora conseguiu ver meu caso?", "Estou esperando um retorno", "Alguma
  novidade?", "Conseguiu verificar?", "Ainda estou aguardando", "A Carolina pode me ligar?", "Mandei mensagem ontem",
  "Vocês conseguiram analisar?", "Preciso tirar uma dúvida", "Quando o advogado vai me responder?").

## Auditoria e prévia (sênior/admin)
Automações → Secretaria digital → Encaminhamento → "Auditoria da fila do advogado": última verificação (conversas
analisadas, pendentes, para conferir, resolvidas, antigas, não verificadas, recuperadas), listas para conferência
com link da conversa, **prévia do relatório corrigido**, "Verificar todas as conversas (não envia nada)" e "Enviar
relatório corrigido" (só de segunda a sexta, 09:00–17:30, fora de feriado nacional, com verificação de menos de
20 minutos, confirmação e auditoria).

## Limitações
- Tarefas do ProJuris não são lidas: a lista fechada de operações autorizadas não inclui tarefas
  (`src/lib/projuris/AGENTS.md`); o cruzamento usa a réplica local (clientes e processos) e as conversas.
- "Resposta efetiva" é reconhecida pelo conteúdo (não só saudação/espera); a relação exata com a dúvida não é
  interpretada — na dúvida, o caso fica pendente/para conferir.
- Réplica local do ProJuris indisponível: os casos sem vínculo confirmado pelo Manager vão para conferência e o
  relatório avisa as conversas não verificadas.
- Os números reais (conversas analisadas, recuperadas etc.) só existem depois de publicar: a auditoria roda no
  servidor publicado (este computador não tem acesso ao banco de produção).
