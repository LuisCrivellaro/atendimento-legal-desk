# Nomes da agenda no WhatsApp — 09/11/2026

## Implementação e comprovação
UltraMsg existente consultada por GET oficial `/contacts`, HTTP 200. Resposta real contém `isMyContact`, `name` e `pushname` separadamente; 4.614 registros com marcação de contato salvo e nome não vazio. A lista inclui duplicatas idênticas, consolidadas pelo número normalizado. Não foram divulgados nomes/telefones no relatório.

84 nomes de contatos salvos foram sincronizados apenas para números já presentes nas conversas da Dra. Não foram criados clientes, processos ou conversas. Os dados ficam em `office_workspace.agendaWhatsApp`, sem reescrever nomes legais, mensagens, contratos ou aprovações. CAS preserva alterações concorrentes; salvamento antigo do Treinamento não elimina a agenda.

## Prioridade
Identificação interna explicitamente marcada, quando existir; nome da agenda; rótulo ProJuris previamente confirmado quando não houver nome de agenda; perfil WhatsApp; nome existente da conversa; telefone. Não havia editor de alias de conversa na arquitetura inspecionada, portanto nenhum editor novo foi acrescentado. Rótulos ProJuris continuam nos cadastros e nunca substituem o nome da agenda no WhatsApp.

Perfil nunca é tratado como nome da agenda. Agenda conhecida é preservada se a resposta posterior fornecer apenas perfil; renomeação recebida como contato salvo substitui o nome anterior da agenda. Nomes divergentes no mesmo número são considerados ambíguos, não escolhidos arbitrariamente. DDI/DDD são mantidos para evitar colisões de países ou áreas.

## Atualizações
Canal e Agente → Atualizar nomes, restrito à advogada sênior/admin e validado no servidor. Lista, cabeçalho, avatar, ficha e busca usam o mesmo resolvedor.

A rotina de monitoramento já cadastrada a cada cinco minutos verifica a agenda quando passaram 15 minutos da sincronização anterior. Atua somente no proprietário autorizado da entrada WhatsApp. O código da rotina depende de publicação para funcionar na versão pública; não foi publicado neste pedido.

## Verificação
753 testes aprovados em 87 arquivos; compilação limpa. Com a conta autenticada: atualização real confirmou 84 nomes, recarga manteve o horário sincronizado, pesquisa encontrou a conversa e cabeçalho usou o mesmo nome. Tela de 855×626 sem transbordamento horizontal. Nenhum envio efetuado.

## Limitação
Só é possível refletir a agenda que a sessão conectada da UltraMsg disponibiliza; não há acesso direto aos contatos do dispositivo nem garantia de propagação instantânea. A distinção foi confirmada pelos campos da resposta real, mas a latência após uma nova renomeação no celular não foi medida. Se a agenda do celular mudar e UltraMsg não refletir a mudança, o sistema preserva os nomes anteriores, sem inventar uma sincronização.

Fonte oficial: https://docs.ultramsg.com/api/get/contacts