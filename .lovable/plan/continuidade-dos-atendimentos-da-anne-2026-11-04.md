# Continuidade dos atendimentos da Anne

## O que será corrigido
- Recuperar todo o histórico do contato, identidade confirmada, documentos, solicitações, horários e reserva persistidos; remover o limite atual de 24 mensagens na leitura do contexto.
- Não repetir apresentação institucional em atendimentos já iniciados, mesmo após dias sem contato. Reconhecer “Bom dia. É o Paulo.” sem reiniciar a oferta ou consultar a agenda sem necessidade.
- Manter ofertas existentes; buscar novos horários apenas a pedido do cliente ou para substituir opções expiradas/indisponíveis, preservando a revalidação antes de reservar.
- Tratar cobranças de retorno antes da oferta inicial: localizar o assunto no histórico e registros, criar ou atualizar uma tarefa real vinculada à conversa e avisar a equipe no sistema. Sem atualização comprovada, reconhecer a pendência sem inventar providências.
- Preservar a autorização obrigatória da Dra. para notícias processuais; histórico e tarefas não serão usados como autorização de envio.

## Verificação
- Reproduzir a sequência do Paulo, incluindo histórico anterior fora das últimas 24 mensagens e cobrança repetida sem duplicar tarefas.
- Testar identidade, ofertas preservadas, reserva revalidada, pendências, controle humano e isolamento entre clientes.
- Conferir as tarefas na tela e a persistência após recarregar, executar os testes e verificar a compilação.

## Detalhes técnicos
- Reutilizar dados privados por proprietário e atualizações com controle de concorrência; novos campos operacionais opcionais no estado da conversa, sem migrações ou alteração das aprovações.
- Compartilhar regras puras de contexto/continuidade entre produção e simulador; integrar tarefas com o Assessor e notificações existentes.
- Não publicar, alterar conversas reais ou enviar mensagens externas nesta etapa.