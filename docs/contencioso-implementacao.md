# Contencioso — 06/11/2026

## Entrega
- Menu Contencioso: Processos e Andamentos processuais, com ficha e linha do tempo paginada completa da API acessível.
- Pesquisa, cliente, tribunal, situação, processo, período, ordenação e paginação; acesso direto ao processo e cadastro vinculado.
- Integração e persistência existentes reutilizadas, sem tabelas novas, alteração de permissões ou aprovações.
- Importação/atualização cadastral, sincronização individual e geral por processo, leases, retries de leitura, snapshots completos e versões append-only.
- Painel com totais, última sincronização, pendências e falhas; registros já confirmados permanecem se a leitura seguinte falhar.

## Dados reais verificados
- 111 clientes elegíveis; 131 processos persistidos, 7.931 andamentos disponíveis, zero históricos pendentes.
- Processo 1001676-10.2025.5.02.0001: 220 andamentos persistidos; nova sincronização retornou zero versões novas.
- Importação cadastral e sincronização geral exercitadas na conta da Dra.; uma limitação temporária do provedor foi resolvida por nova leitura individual, sem perda de histórico; zero falhas ao final.
- Persistência conferida após recarga e por consulta direta ao banco.
- Suíte completa: 687 testes em 81 arquivos aprovados. Regressão ProJuris/Contencioso posterior: 39 testes aprovados, incluindo os 34 anteriores desses módulos.
- Clientes carregou com dados reais; celular sem transbordamento horizontal; nenhuma mensagem enviada, compromisso alterado ou publicação executada.

## Limitações
- A consulta oficial classificada retornou erro 500. Não há prova de equivalência com a janela Visualizar todos.
- Campos ausentes (classe, vara etc.) são sinalizados, nunca inferidos.
- A consulta normalizada não disponibiliza documentos vinculados; não adicionamos download de arquivos nem endpoints não autorizados.
- Sincronização geral é manual, processando a carteira inteira em chamadas individuais persistentes. Fechar a aba interrompe os próximos itens, sem desfazer os concluídos; rotina autônoma não foi ativada.