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

## Critério ainda não comprovado — bloqueia etapa 2

Não foi possível confrontar os 220 movimentos com a visualização autenticada do mesmo processo em **ProJuris → Contencioso → Processos → Linha do tempo → Ver tudo**. Não há sessão dessa interface disponível ao agente. A conexão API não concede uma sessão do site.

A documentação oficial descreve a linha do tempo como seleção de eventos importantes por IA; não garante equivalência entre essa visualização e todo o endpoint de andamentos. É necessário comparar os conjuntos, datas, tipos e descrições, e esclarecer possíveis filtros ou categorias adicionais.

Solicitar à Dra. exportação completa ou evidência da visualização do mesmo processo, incluindo filtros e carregamento integral, sem pedir credenciais. Apenas totais ou uma captura da prévia não comprovam correspondência.

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

## Próxima etapa após comprovação

Reutilizar base por proprietário, leases e versões append-only. Implementar Processos, ficha/linha do tempo e painel Andamentos, sem substituir Clientes ou registros manuais existentes. Expor dados somente conforme permissões atuais; preservar DTOs necessários, descrições originais e status parcial/falhas. Validar persistência, sincronização repetida/individual/geral, deduplicação, associação e Clientes antes de concluir.