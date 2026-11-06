# Contencioso — validação da etapa 1 (06/11/2026)

## Resultado comprovado

A conexão existente foi reutilizada, com autenticação client_credentials no servidor, lista fechada de operações e a função `lerTodosAndamentos`. Nenhuma nova conexão, alteração de cadastro, envio WhatsApp ou migração foi executada.

Processo real vinculado na carteira: **VICTORIA PEREIRA DOS SANTOS**, **1001676-10.2025.5.02.0001**, identificador de origem **PRO.0000009**. O vínculo provém do identificador da pessoa na carteira, não de similaridade do nome.

Leitura oficial: `GET processo/{codigo}/andamento/consulta`, páginas 0 a 4, 50 registros por página. Resposta real: `totalRegistros: 220`, wrapper `andamentoWs`; lotes 50, 50, 50, 50 e 20.

- 220 movimentos recuperados, 220 códigos únicos.
- Histórico de 26/09/2025 a 04/11/2026; não limitado à prévia de três eventos.
- Segunda leitura completa: mesmo conjunto de 220 movimentos e mesmos dados mapeados.
- As 220 descrições mapeadas corresponderam literalmente às descrições originais neste processo.
- 15 movimentos indicam arquivos vinculados (`totalArquivos > 0`); isso não comprova disponibilidade dos arquivos ou seu conteúdo. Nenhum arquivo foi baixado.
- Base persistente preexistente: 104 processos com sincronização bem-sucedida, 7.568 movimentos atuais e 7.568 versões preservadas. O processo validado tinha 218 movimentos no snapshot anterior; a leitura atual encontrou 220. Não houve commit local nesta validação.
- Testes existentes: 33 aprovados em `projuris-base`, `projuris-processos` e `projuris-cliente`.

## Investigação complementar direta pela API — 06/11/2026, após 18:17 UTC

O Swagger público correto foi obtido em `https://docs.projurisadv.com.br/ui/swagger.json`; a URL fora de `/ui/` não é o catálogo válido. Três operações oficiais de consulta foram acrescentadas à lista fechada existente; nenhuma escrita no ProJuris ou banco foi executada.

### Completude da consulta de andamentos comprovada para a amostra

- GET sem filtros: 50 por página, lotes 50/50/50/50/20 e página 5 vazia; `totalRegistros = 220` numérico em todas as páginas.
- GET sem filtros: 100 por página, lotes 100/100/20 e página 3 vazia; mesmos 220 códigos únicos, nenhuma duplicação.
- GET com `executar-contagem=true`, `incluir-dados-complementares=true`, `incluir-partes-por-polo=true`: mesmos 220 códigos, página adicional vazia.
- POST oficial de busca avançada no mesmo processo, corpo `{}` sem filtros e contagem explícita: mesmos 220 códigos; página adicional vazia.
- POST `/v2/processo-andamento/consulta/indicador`, filtrando o número CNJ e sem desconsiderar intimações: `totalIndicadorTodos = 220`, `totalIndicadorLidos = 1`, `totalIndicadorNaoLidos = 219`. Essa contagem independente coincide com a leitura de andamentos.
- Todos os 220 registros têm `codigoRegistroVinculo` correspondente ao processo. São 198 do tipo “Movimentação TJ”, com 198 códigos de captura distintos, e 22 “Intimação”. Todos retornaram `privado=false`; não foi aplicado filtro local de privacidade na comparação.
- Não há parâmetro publicado para incluir excluídos/ocultos ou ignorar permissões. Campos dinâmicos estavam vazios nesta amostra. Indicadores de captura contam trabalhos de captura, não andamentos, portanto não foram usados como um total judicial.

### Correspondência com a Linha do tempo ainda não comprovada

Foi encontrada consulta oficial relevante: POST `/processo/andamento-classificado/consulta`, filtro `codigoProcesso`, `codigosJaObtidos`, `quantidadeAndamentos`, datas e modo de período. Seu envelope não possui `totalRegistros`; o avanço usa códigos já obtidos.

Essa consulta retornou **HTTP 500** no ProJuris em três formatos documentados: sem período, período explícito amplo sem restrição e período explícito com restrição. As tentativas limitadas do cliente existente foram respeitadas; não foram feitas novas repetições depois das falhas persistentes. Não houve resposta com dados classificáveis para comparação. Não atribuir a falha a falta de permissão: o status não foi 403.

A ajuda oficial e suas imagens mostram que “Ver tudo” abre uma janela com **Visualizar principais / Visualizar todos**, além de sugestões de classificação. A documentação não identifica qual chamada alimenta essa janela; o endpoint classificado é candidato, não associação comprovada.

**Conclusão:** os 220 correspondem ao total integral de andamentos acessíveis retornados pela consulta oficial para o processo, corroborado por busca avançada, complementos e indicador independente. Isso não comprova identidade com a coleção classificada de “Visualizar todos”, nem existência/ausência de registros inacessíveis ou ainda não capturados. A etapa 2 permanece bloqueada, sem pedir exportação como primeira opção.

**O que falta exatamente:** uma resposta bem-sucedida e completa da consulta classificada, ou a identificação da requisição que a janela “Visualizar todos” usa e confirmação de seu vínculo com os 220 registros. A Dra. pode verificar se essa janela abre para o mesmo processo; se abrir, uma captura autorizada dessa requisição ou o histórico completo permite concluir a correspondência. Nunca enviar senha, token ou arquivo HAR sem remoção de credenciais.

## Limitações identificadas

- Mapeamento operacional atual retém código, descrição, privacidade, data/hora, tipo e eventual simplificação; não preserva todo o DTO, origem e metadados de anexos para uma futura ficha completa.
- Função de total usa tamanho do lote se não houver `totalRegistros` numérico. Na validação real o total era numérico e foi respeitado; não há garantia genérica para formatos diferentes.
- Não foi comprovado cursor incremental ou snapshot estável pela API. Duas leituras iguais comprovam estabilidade desta amostra, não eliminam alterações concorrentes futuras.
- Nenhuma nova sincronização persistente individual/geral foi exercitada; não declarar testes finais concluídos.
- Restrições atuais proíbem leitura de arquivos/documentos. Qualquer ampliação requer operação oficial identificada e revisão de acesso; não inventar links.
- O módulo Contencioso não foi construído: a especificação exige comprovação de correspondência antes da expansão.

## Fontes oficiais

- Andamentos: https://projurisadv.atlassian.net/wiki/spaces/BDC/pages/107118596/API+Andamentos
- Linha do tempo: https://projurisadv.atlassian.net/wiki/spaces/BDC/pages/3526393884/Como+utilizar+a+Linha+do+tempo+dos+processos
- Catálogo: https://docs.projurisadv.com.br/
- Swagger examinado: https://docs.projurisadv.com.br/ui/swagger.json

## Próxima etapa após comprovação

Reutilizar base por proprietário, leases e versões append-only. Implementar Processos, ficha/linha do tempo e painel Andamentos, sem substituir Clientes ou registros manuais existentes. Expor dados somente conforme permissões atuais; preservar DTOs necessários, descrições originais e status parcial/falhas. Validar persistência, sincronização repetida/individual/geral, deduplicação, associação e Clientes antes de concluir.