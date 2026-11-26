# Anne secretária digital: duas camadas, quatro modos, motor de permissões

Entrega de 26/11/2026. Tudo fica atrás de uma feature flag que, desde a finalização das automações operacionais
(26/11/2026, [automacoes-operacionais.md](automacoes-operacionais.md)), vem **ligada por padrão**: a equipe assumir a
conversa desliga só a camada conversacional. Desligada explicitamente (`ativa: false` ou `ANNE_SECRETARIA_DESLIGADA=1`),
o atendimento funciona exatamente como antes (mesmo código, mesmos campos). Auditoria que motivou o desenho:
[anne-secretaria-auditoria.md](anne-secretaria-auditoria.md).

## Visão geral

```
WhatsApp (webhook) ──► processarAna ──┬─ flag desligada ou modo Automático ─► camada conversacional (fluxo atual)
                                      │                                        + memória estruturada, conferência de fatos,
                                      │                                          bloqueio de prompt injection (flag ligada)
                                      └─ flag ligada e modo ≠ Automático ───► camada operacional (secretaria/operacional.ts)
                                                                               respostas dentro de automações ativas
Monitor central (confirmação de presença 2 h, lembrete 08h, reagendamento) ──► motor (secretaria/motor.ts) ──► envio com reserva da automação
Equipe no Atendimento ──► seletor de modo, painel de automações, delegação de reagendamento, configuração (sênior/admin)
Camada de envio (envio.functions.ts) ──► conferência final da reserva da automação imediatamente antes do UltraMsg
```

Não há novo agente nem novo modelo: a camada operacional é código determinístico; o modelo continua só na camada
conversacional (modo Automático), com o mesmo provedor e o mesmo prompt.

## Módulos (`src/lib/atendimento/secretaria/`)

| Arquivo | Papel |
|---|---|
| `config.ts` | Feature flag (`ativa`, padrão `true` desde 26/11/2026; só `false` explícito desliga), antecedência da confirmação de presença (padrão 120 min), modo de teste com número autorizado, matriz de permissões por funcionalidade, janela de prioridade humana, regra opcional de volta ao Automático, horário das automações, textos dos modelos. Leitura tolerante (campo inválido volta ao padrão) e níveis máximos que a configuração não afrouxa (andamento processual nunca é automático). Chave mestra do servidor: `ANNE_SECRETARIA_DESLIGADA=1`. |
| `modos.ts` | Modos Automático, Híbrido, Humano e Bloqueado; migração dos estados antigos; modo efetivo; gravação com campos antigos equivalentes. |
| `motor.ts` | Motor determinístico: recebe fatos verificados e devolve `executar`, `bloquear`, `adiar`, `encaminhar`, `aprovacao` ou `ignorar`, com o motivo (texto para a equipe). |
| `automacoes.ts` | Ciclo de vida (id determinístico, estado, validade, histórico) e associação segura de respostas. |
| `reagendamento.ts` | Reagendamento em etapas, sem modelo, com sucesso só com recibo. |
| `operacional.ts` | Executor da camada operacional com portas (banco com CAS, canal, agenda) e as funções de conferência antes do envio. |
| `origem.ts` | Origem confiável de cada mensagem (cliente, equipe, Anne, automação, sistema) e intervenção humana recente. |
| `seguranca.ts` | Conferência de fatos, detecção de prompt injection e de pedidos fora do escopo. |
| `memoria.ts` | Memória estruturada com confiabilidade (verificado, declarado, inferido, desatualizado). |
| `templates.ts` | Modelos fixos das mensagens operacionais; campo ausente impede o envio. |
| `andamentos.ts` | Classificação de notícias processuais (bloquear ou aprovação, com destaque do que é sensível). |
| `programadas.ts` | Revalidação de mensagens programadas (vencida, não necessária, condição inválida). |
| `rotinas.ts` | Ponte entre as rotinas existentes e o motor. |
| `secretaria.server.ts` | Adaptador do servidor: contexto (configuração, canal, contato liberado) e portas reais. |
| `secretaria.functions.ts` | Funções autenticadas: modo, controle de automações, delegação de reagendamento, leitura/gravação da configuração. |

Estado por conversa: `agenteAna.secretaria` no JSON do caso (`modo`, `automacoes`, `acoes`, `envio`), sem migração.
Configuração: `office_workspace.dados.secretaria` do dono, gravada só pelo servidor (o `saveOffice` do navegador
preserva o valor do banco).

## Modos por conversa

| Modo | Conversa livre | Automações autorizadas | Respostas dentro de automação | Sugestões internas |
|---|---|---|---|---|
| Automático | Anne conduz (fluxo atual) | Sim | Fluxo atual | Sim |
| Híbrido | Equipe conduz | Sim | Sim, só quando a resposta pertence sem dúvida à automação | Sim |
| Humano | Equipe | Não (vira aviso com texto pronto) | Não (fica com a equipe) | Sim, sob demanda |
| Bloqueado | Equipe | Não | Não | Não |

- **Migração sem gravar nada** (`derivarModoLegado`): pausa ou `Desligada` → Bloqueado; `Sugerir` → Humano; equipe no
  controle com falha registrada → Humano; equipe no controle → Híbrido; resto → Automático. Nenhuma conversa desligada
  ou pausada é reativada.
- **Modo efetivo** = o mais restritivo entre o modo gravado e o derivado dos campos antigos. Por isso a equipe escrevendo
  (o fluxo existente grava `humano: true`) muda Automático para Híbrido sem tocar no webhook; falhas e pausas continuam
  valendo; Humano e Bloqueado escolhidos pela equipe nunca são sobrescritos; nada volta sozinho para Automático.
- **Gravação** (`aplicarModo`): grava o modo e os campos antigos equivalentes (Automático = `Automática`; Híbrido =
  `Automática` + `humano`; Humano = `Sugerir` + `humano`; Bloqueado = `Desligada` + `humano` + `pausa`). Desligar a flag
  deixa cada conversa num estado antigo coerente e seguro. Toda troca renova `controleHumanoEm`, o que cancela qualquer
  resposta conversacional da Anne em andamento.
- **Volta ao Automático**: só por ação explícita da equipe (com confirmação quando sai de Humano/Bloqueado) ou pela regra
  configurável `retornoAutomaticoHoras` (desligada por padrão), que só vale para Híbrido vindo da equipe assumindo, sem
  falha, pausa, urgência ou aviso prioritário pendente.

## Motor de decisões

Ordem das regras (a primeira que impede vence; a ordem é testada):

1. flag desligada → `ignorar` (vale o fluxo anterior);
2. resposta a mensagem que não é do cliente → `ignorar` (nunca responde às próprias automações nem à equipe);
3. ação já executada ou reservada → `ignorar`;
4. sugestão interna: só Bloqueado ou a administração impedem;
5. IA pausada (chave do Claude recusada) → `bloquear` só a resposta conversacional (automações seguem); agente
   desligado, canal inativo → `bloquear` (operacional avisa a equipe);
6. modo: Bloqueado bloqueia tudo; conversa livre só no Automático; Humano bloqueia automações (aviso com texto pronto);
7. matriz de permissões: `desligado` bloqueia;
8. contato não liberado/vinculado → `bloquear`;
9. prompt injection, pedido jurídico/resultado/honorários, limite de respostas (anti-loop), identidade ou dados não
   verificados, pendência de agenda → `encaminhar`/`bloquear` com aviso;
10. resposta dentro de automação: automação válida, única e cuja mensagem é a última do escritório;
11. conteúdo sensível ou permissão `aprovacao` → `aprovacao` (texto pronto para a equipe);
12. prioridade humana: automação proativa espera o fim da janela (`adiar`); a urgente vira aviso prioritário;
13. fora do horário das automações não urgentes → `adiar` para a próxima janela;
14. `executar`.

Matriz padrão (conservadora; reproduz o que já estava validado): conversa, resposta dentro de automação, sugestões,
confirmação de presença, lembrete 08:00, reagendamento, solicitação de documentos e lembretes de coleta = automático;
cancelamento = com aprovação; andamento processual = com aprovação (máximo); follow-up comercial e mensagens
programadas = desligado.

## Automações com ciclo de vida

- Id determinístico (`confirmacao_consulta:<início>`, `lembrete_consulta:<início>`, `reagendamento:<evento>:<momento>`),
  estado (`agendada`, `aguardando_resposta`, `pausada`, `concluida`, `cancelada`, `expirada`, `encaminhada`, `falhou`),
  validade (`expiraEm`) e histórico curto. Estado final nunca reabre; o mesmo id nunca é recriado.
- Associação da resposta (`associarResposta`): a automação aguarda resposta e está válida; a mensagem dela é a última do
  escritório no canal; o intérprete determinístico do tipo reconhece a resposta; existe uma única automação aguardando.
  Mensagem que não parece resposta fica com a equipe; parece resposta mas há dois fluxos → aviso "várias automações".
- Confirmação de consulta no Híbrido: "ok" → registra presença (`registrarRespostaConfirmacao40`), responde com o modelo
  fixo, encerra a automação e **não** reassume a conversa. "não/atrasar/remarcar" → registra, avisa a equipe com
  prioridade, responde que passou para a equipe e que nada foi cancelado.
- Lembrete das 08:00 no Híbrido: SIM confirma; NÃO nunca cancela (o consentimento antigo é limpo) e vai para a equipe.
- Reagendamento delegado pela equipe (botão "Anne remarca a consulta", só no Híbrido, com consulta com recibo e sem
  outra automação ativa): consulta a agenda oficial, oferece até 3 horários livres verificados, reconhece número ou
  dia/horário, consulta horário pedido fora da lista, pede confirmação explícita, confere de novo antes de mexer na
  agenda (modo, automação, ninguém da equipe escreveu, sem operação em curso), remarca reservando o novo antes de
  concluir o antigo (`remarcarAgenda`) e só comunica sucesso com o recibo do horário escolhido. Horário ocupado no
  momento da reserva → avisa e reoferece (até 3 consultas à agenda); qualquer outra falha → equipe, sem confirmar nada.
  Agenda fora do ar antes de qualquer mensagem → nada é enviado ao cliente, só a equipe é avisada.
- Andamentos processuais: continuam no fluxo revisado (aprovação da revisora obrigatória). `classificarAndamento` impede
  que movimentação privada, sigilosa, sem vínculo confirmado ou desatualizada chegue sequer à aprovação e destaca o que é
  sensível (sentença, valores, prazos, liminar...). Não há envio automático de andamento.
- Mensagens programadas: `revalidarProgramada` só libera quando continua necessária (consulta ainda marcada com recibo,
  documento ainda faltando, cliente ainda sem responder) e dentro da validade; o tipo está desligado por padrão e ainda
  não há rotina que as execute.

## Convivência com a equipe

- Origem: `origemMensagem` usa só campos gravados pelo servidor (`de`, `automacaoKey`, `respostaAnaDe`, autor exato da
  rotina); uma pessoa da equipe chamada "Ana Paula" continua sendo equipe.
- Prioridade humana configurável (padrão 30 min) adia automações não urgentes; urgente bloqueada vira aviso prioritário.
- Cada envio da camada operacional e das rotinas grava uma **reserva** (`agenteAna.secretaria.envio` + `envioAna` para o
  eco) com a revisão `controleHumanoEm`. A camada de envio confere a reserva imediatamente antes do UltraMsg
  (`conferirReservaEnvio`): reserva desta automação e deste texto, recente (2 min), equipe não escreveu nem mudou o modo,
  nenhuma mensagem nova chegou, modo ainda permite e com o agente ligado (a pausa da IA não barra automações).
- Idempotência: claim por mensagem (`iaExecucao`), ids determinísticos de automação e aviso, CAS em todas as escritas,
  efeito de domínio aplicado uma única vez mesmo quando o CAS repete. Envio sem recibo nunca é repetido (estado
  `incerta`/`falhou` + aviso "não reenviar sem conferir").

## Memória e alucinação (camada conversacional com a flag ligada)

- `memoria_estruturada` entra no contexto do modelo (até 1.400 caracteres), só com dados desta conversa e com a
  confiabilidade de cada item, junto da regra de uso (`regras_memoria`). Sem CPF, telefone ou conteúdo processual.
- Antes do envio, `dadosNaoVerificados` confere horários, datas, valores, percentuais, números de processo e CPF do texto
  final contra as fontes da conversa (agenda com recibo e ofertas reais, mensagens registradas, regras da agenda). Se
  algo não tiver fonte, a resposta fica retida como rascunho (`iaRetida`), com aviso e registro sem os dados por extenso.
  Isso também barra dado de outro cliente.
- Mensagem com instruções dirigidas à IA (`possivelInjecao`) não chega ao modelo: a conversa passa para Híbrido e a equipe
  é avisada. O prompt já tratava histórico e contexto como dados; os arquivos de prompt não foram alterados.

## Interface

- Atendimento (com a flag ligada): seletor do modo no cabeçalho, no lugar do antigo "Modo da IA" (indicador com cor e
  motivo no título); itens antigos "Assumir/Pausar/Reativar Anne" e o botão "Retomar Anne" saem (o seletor cobre);
  painel recolhível "Anne" com automações ativas (pausar, retomar, cancelar), botão "Anne remarca a consulta" e as
  últimas decisões com o motivo de cada bloqueio; rótulo interno Anne / Automação / Equipe nas mensagens.
- "Automações do atendimento": monitor das automações no topo; seção "Secretaria digital" com a flag, a matriz de
  permissões, prioridade humana, volta ao Automático, horário das automações, antecedência da confirmação de presença e
  modo de teste. Os modelos de texto provisórios saíram: textos ao cliente vêm só da biblioteca oficial e de frases já
  aprovadas. Só sênior/admin edita (servidor confere).
- Painel "Anne" da conversa: situação da consulta e botões "Realizada" / "Cliente faltou" (a falta inicia o reagendamento).
- Com a flag desligada explicitamente, a tela é a mesma de antes.

## Como testar com segurança

1. Publicar (push pelo GitHub Desktop e Publish/Update no Lovable).
2. Em "Automações do atendimento", com perfil sênior/admin, ligar **Modo de teste das automações** com o número
   autorizado e salvar: só esse número recebe automações. Para desligar tudo de imediato: desligar a secretaria ali ou
   definir `ANNE_SECRETARIA_DESLIGADA=1` no servidor.
3. Com o número de teste: marcar uma consulta para hoje, assumir a conversa (vira Híbrido), esperar a confirmação de
   presença (2 h antes), responder "ok" e depois "não vou conseguir" em outra consulta; conferir respostas e histórico.
4. Desligar o modo de teste para valer para todos os clientes.

## Testes (dados fictícios, canal e agenda em memória)

`src/test/anne-secretaria-modos-motor.test.ts`, `anne-secretaria-automacoes.test.ts`, `anne-secretaria-cenarios.test.ts`,
`anne-secretaria-rotinas.test.ts` — 68 testes, cobrindo: atendimento automático normal; intervenção humana durante a
resposta; transição para Híbrido; confirmação em atendimento humano; reagendamento com horário indisponível; cancelamento
(nunca automático no Híbrido; aprovação na matriz); andamento verificado e andamento que exige aprovação; mensagem
ambígua; múltiplas automações; mensagens e webhooks duplicados; conflito de concorrência (CAS); falhas de integração e de
conexão (sem reenvio); prompt injection; dados de outros clientes; informação ausente ou conflitante; modos Humano e
Bloqueado; mensagens programadas vencidas; recuperação; conflitos entre mensagens humanas e automáticas nas rotinas;
flag desligada preservando o comportamento anterior.

## Limitações e dependências

- Não verificado em produção nem no navegador real; nenhuma mensagem real foi enviada.
- A IA continua dentro do webhook no modo Automático (risco 7 da auditoria). Tirá-la do caminho exige fila e rotina
  agendada, o que muda a infraestrutura; ficou fora desta entrega.
- O simulador/bateria (`tools/simulador-ana`) é uma cópia de `processarAna` e não inclui a camada operacional; os cenários
  da secretaria estão nos testes acima.
- Coleta, vendedor, pergunta de encerramento e notícias processuais continuam com as regras atuais (inconsistências 2–6 da
  auditoria seguem registradas); só confirmação e lembrete passaram pelo motor.
- Mensagens programadas e solicitação de documentos no Híbrido: módulos e testes prontos, sem rotina que as execute.
- A configuração fica no JSON da área de trabalho: o servidor só grava para sênior/admin, mas uma escrita direta do dono
  na tabela (fora do app) não é impedida no banco. Se quiser essa garantia, criar um gatilho que preserve
  `dados->'secretaria'` para quem não é sênior/admin (exige migração; não aplicada).
- Sugestão interna no modo Humano reaproveita a sugestão já existente do Atendimento; não há chamada automática ao modelo.
