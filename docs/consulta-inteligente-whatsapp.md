# Consulta inteligente de processos — 06/11/2026

## Entrega
- Reutiliza o fluxo de consulta e aprovação existente, sem nova integração, migração ou alteração das aprovações jurídicas.
- Identifica por telefone principal, conferindo o índice completo do ProJuris; vínculo por telefone salvo não dispensa revalidação. CPF mantém confirmação humana.
- Consulta a base owner-scoped primeiro; cadastro, vínculo, situação e sigilo são conferidos no provedor. Históricos antigos/falhos são sincronizados com leases e versões append-only existentes e relidos antes do rascunho.
- Vários processos geram lista pública resumida para revisão. Após aprovação e envio confirmado, a escolha por opção/número/assunto é validada novamente. Processo removido ou alheio nunca desloca a escolha para outro.
- Última movimentação vem de paginação integral, não apenas primeira/última página. Data do movimento e data da sincronização permanecem distintas.
- Perguntas factuais sobre audiência, prazo, decisão ou documento pendente procuram somente registros públicos relacionados; ausência de registro é encaminhada, sem inventar campos, datas ou providências.
- Listas e atualizações continuam exigindo aprovação individual da Dra. A interpretação jurídica permanece humana; simplificação oficial disponível pode compor o texto revisado.

## Verificação
- Suíte completa: 710 testes em 83 arquivos aprovados; compilação automática sem erros.
- Onze cenários do anexo cobertos com portas controladas, incluindo identidade, seleção, novidades, falha, ausência de registro e processo alheio. Testes adicionais cobrem páginas intermediárias, paginação sem total e alteração das opções.
- Leitura real somente de andamentos do processo de referência: 220 registros, 220 públicos com datas válidas; nenhum envio, pedido de revisão ou dado fictício gravado em produção.
- Publicação e fluxo completo de consulta → revisão → entrega no WhatsApp ainda não executados. Exigem autorização de publicação e mensagem real de cliente; testes controlados não equivalem a entrega externa.

## Limites preservados
- Processos ativos, vinculados como cliente e dentro da carteira existente; casos fora da coorte/carteira exigem equipe, não importação silenciosa.
- Privado/segredo não é divulgado. Consulta classificada continua com limitação já documentada; não há promessa de equivalência visual integral com ProJuris.
- Não há novos endpoints de documentos, audiências ou tarefas. Perguntas usam apenas descrições já registradas e revisão.