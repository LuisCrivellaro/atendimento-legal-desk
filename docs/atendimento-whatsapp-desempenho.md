# Atendimento (WhatsApp): incidente de 26/11/2026 e otimização

Commits locais na `main` (não enviados; o push é feito pelo GitHub Desktop):

| Commit | Conteúdo |
|---|---|
| `9aa9f54` | Incidente: webhook aponta para `cslawyers.lovable.app`; o painel de saúde detecta recebimento quebrado |
| `f4c47aa` | Sincronização incremental em tempo real (sem recarregar todas as conversas) |
| `475f93d` | Envio otimista em fila, idempotente, sem travar o campo de texto |
| `f9d6cb1` | Webhook com leituras em paralelo, recibos de entrega/leitura e áudio para ouvir |
| `83775f4` | Lista memorizada, busca em mensagens, arrastar/colar arquivos, atalhos e medições |

## 1. Incidente: mensagens novas não chegavam (só havia conversas de 25/11)

> **Atualização (26/11/2026, à tarde): o domínio inverteu.** O app publicado voltou para
> `atendimento-legal-desk.lovable.app` (login e rotas respondendo; `/api/public/atendimento/whatsapp` → 401) e
> `cslawyers.lovable.app` passou a responder 404. O escritório escolheu **`atendimento-legal-desk.lovable.app` como
> endereço oficial**: `url-publica.ts` voltou a usá-lo como padrão e qualquer host diferente do app publicado aparece
> como recebimento quebrado no painel. O webhook do UltraMsg precisa apontar para `atendimento-legal-desk.lovable.app`
> e o segredo `PUBLIC_APP_URL` deve ser configurado com esse endereço. O texto abaixo descreve o diagnóstico da manhã.

**Diagnóstico (conferido em 26/11, de manhã):**

- `https://atendimento-legal-desk.lovable.app/api/public/atendimento/whatsapp` responde **404** (página do Lovable, domínio não existe mais).
- `https://cslawyers.lovable.app/api/public/atendimento/whatsapp` responde **401** sem o segredo, ou seja, a rota está no ar e protegida.
- O código usava o domínio antigo como padrão em dois lugares:
  - no registro do webhook (`registrarWebhookUltramsg`), com `??`, então um `PUBLIC_APP_URL` vazio gerava um endereço relativo;
  - na conferência do painel de saúde, que comparava contra o domínio antigo. Por isso o painel podia dizer "correto" com o recebimento quebrado.
- Causa mais provável: o webhook do UltraMsg ficou apontando para o domínio antigo. Não há credenciais do UltraMsg nesta máquina para ler a configuração atual. A confirmação está no botão **Verificar WhatsApp**, descrito abaixo.

**Correção no código (`9aa9f54`):**

- Padrão `https://cslawyers.lovable.app`. `PUBLIC_APP_URL` continua com prioridade; vazio, sem `https` ou com caminho é ignorado.
- O registro só declara sucesso depois de **ler de volta** a configuração do UltraMsg e conferir host, caminho e segredo.
- **Verificar WhatsApp** (Canal e Agente) mostra para qual host o UltraMsg envia, sem expor o segredo.
- O monitor de 5 min **sonda a rota** registrada sem o segredo: 401 significa viva, 404 significa domínio inexistente. Também acusa o evento "mensagem recebida" desligado.

**Passos que dependem do usuário (mudam a configuração do UltraMsg; só com autorização):**

1. Correção imediata, sem deploy: no painel do UltraMsg, em *Instance → Settings → Webhook URL*, trocar **só o host** para `cslawyers.lovable.app`, mantendo `/api/public/atendimento/whatsapp?s=...`. Conferir também se a instância está `authenticated`.
2. Depois do push e da publicação no Lovable: em **/integracoes → Canal e Agente**, usar **Registrar recebimento do WhatsApp** (sênior/admin). Isso grava o endereço correto e **liga os recibos de entrega/leitura** (`webhook_message_ack`), que são novos.
3. Recuperar as mensagens de 25 e 26/11: **Importar conversas** (só leitura no UltraMsg, pausa a Anne nas conversas importadas, não envia nada).
4. Conferir se o agendador gerenciado do Lovable (monitor, recuperação, lembrete e relatório) chama as rotas pelo domínio novo.

## 2. Causas reais da lentidão (auditoria)

| # | Onde | O que acontecia |
|---|---|---|
| 1 | `atendimento.tsx` | A lista inteira (todas as conversas, com **todas as mensagens** e todo o checklist) era baixada de novo **a cada 5 s**, a cada evento do Realtime (cada gravação do webhook, do anexo e da Anne), depois de **cada salvamento** (enviar, marcar como lida, mudar o modo da IA) e a cada troca de conversa ou volta de foco (`staleTime` 0). |
| 2 | `use-office.ts` | A chave da consulta de aprovações continha **todos os casos e mensagens**: o React Query serializava tudo a cada render (cada tecla digitada no chat) e refazia **uma RPC `material_status` por caso** a cada mudança e a cada 15 s. |
| 3 | layout (`route.tsx`) | O painel do escritório rodava a cada 15 s em todas as páginas e era recarregado depois de cada envio. Ele lia todas as conversas com todas as mensagens e fazia **uma RPC por caso (N+1)**. |
| 4 | envio | Fluxo: assumir a conversa (CAS), conferir o caso, a configuração e o destino, o UltraMsg e a auditoria. Depois, no navegador: salvar (ler e gravar) e recarregar tudo. O botão ficava travado esse tempo todo. A mensagem só era gravada pelo navegador depois do envio, então o eco `message_create` podia chegar antes e virar uma "resposta pelo celular" duplicada. |
| 5 | `chat-messages.tsx` | Sem `memo` e sem janela: cada tecla redesenhava todas as mensagens da conversa. |
| 6 | webhook | Configuração, dona da entrada e contatos eram lidos em sequência antes de gravar a mensagem. |
| 7 | contadores | O menu lateral contava as conversas aguardando do **escritório inteiro** (sênior/admin); a aba "Aguardando" conta só as **do usuário**. O Assessor dizia "mensagens" contando conversas. |

## 3. O que mudou

**Recebimento e sincronização.**

- `useCasosRealtime`, no layout, aplica no cache só a conversa que mudou: cada evento busca uma linha e o checklist dela.
- Rajadas da mesma conversa são agrupadas (120 ms), e só vale a resposta mais nova de cada conversa.
- Rede de segurança:
  - varredura do que mudou (`updated_at`, com folga de 15 min) a cada 60 s com o Realtime ativo, ou a cada 20 s sem ele;
  - recarga completa só ao reconectar o canal ou ao voltar a rede.
- Nenhuma consulta de `['casos']` faz polling.

**Envio** (`enviarMensagemEquipe`, `fila-envio.ts`, `envio-equipe.ts`).

- A mensagem aparece na hora com o relógio "enviando", e o campo de texto fica livre. A fila manda em ordem dentro de cada conversa, sem bloquear as outras, e continua se a equipe trocar de conversa.
- Uma chamada só ao servidor:
  1. reserva a mensagem com o id gerado no navegador (assume a conversa e pausa a Anne, como antes);
  2. envia por `enviarComRegras`, sem mudar as regras;
  3. grava o recibo.
- Nova tentativa com o mesmo id devolve a mensagem já enviada, sem duplicar. Reserva recente conta como "em andamento".
- Falha depois do provedor (tempo esgotado ou rede) fica **incerta** e só reenvia com a conferência "não chegou".
- Falha não conta como resposta: a conversa continua em "Aguardando".

**Recibos.**

- O eco do próprio número guarda o id do WhatsApp na mensagem do sistema, seja da equipe ou da Anne.
- `message_ack` avança enviada → entregue → lida. Nunca volta atrás e nunca promove mensagem simulada.

**Tela.**

- Linhas da lista memorizadas.
- Busca adiada, que também procura no texto das mensagens (3 ou mais letras, mostrando o trecho). Mensagens apagadas nunca aparecem na busca.
- Conversa memorizada, com janela de 80 mensagens e "mostrar anteriores" ao subir, preservando a posição.
- Arrastar ou colar arquivo usa o fluxo do clipe: guarda o original, mostra a prévia e pede confirmação.
- Atalhos: `Ctrl+K` (busca), `Alt+↓/↑` (próxima ou anterior conversa) e `Esc` (fecha a conversa; na busca, limpa o termo).
- O áudio recebido fica guardado no caso e toca ao clicar.
- Marcar como lida é imediato e grava em segundo plano.

**Servidor e banco.**

- Painel do layout a cada 60 s, com só as 30 mensagens mais recentes de cada conversa. O contador continua idêntico, como mostram os testes.
- Salvar uma conversa relê a aprovação **só daquele caso** e só quando muda um campo da revisão material.
- Logs estruturados, sem texto nem telefone:
  - `envio_equipe`: reserva, provedor e conclusão, em ms;
  - `webhook_whatsapp`: tempo até gravar e depois de gravar.

**Contadores** (cada um com a sua definição):

- **Menu lateral → Atendimento** e **aba Aguardando**: conversas *do usuário* cuja última mensagem é do cliente (`replyQueue`). Quando o Atendimento já foi aberto, o menu usa a mesma lista em tempo real.
- **Assessor**: conversas aguardando no *escritório inteiro* (sênior/admin), agora escrito "conversas aguardando resposta".
- **Bolinha de não lidas**: mensagens do cliente depois de `lidoAte`. É um indicador diferente do "aguardando".

## 4. Medições antes/depois

**Como foi medido.** Teste `src/test/atendimento-desempenho.test.tsx`, com dados sintéticos: 300 conversas, 299 com 60 mensagens e uma com 3.000, 21 mil mensagens no total. Rodou no Vitest + jsdom sob Bun nesta máquina, em três execuções (as faixas abaixo). O jsdom é mais lento que o Chrome em renderização; o que vale é a **proporção**. Não foram medidos produção, rede real nem o UltraMsg.

| Medida | Antes | Depois |
|---|---|---|
| Dados baixados por mensagem recebida | lista inteira: **5.476 KB** | uma conversa: **16 KB** |
| Dados com a tela parada (por minuto) | lista a cada 5 s + painel a cada 15 s: **≈ 87.600 KB** | painel a cada 60 s com mensagens recentes: **≈ 2.383 KB** (+ varredura do que mudou, normalmente vazia) |
| CPU para aplicar uma mensagem recebida | reprocessar e ordenar a lista: **9,9–11,4 ms** | aplicar uma conversa: **0–0,1 ms** |
| CPU extra por render do chat (cada tecla) | serializar a chave de aprovações: **6,0–6,6 ms** | **0** (chave por ids; conversa memorizada) |
| Abrir conversa de 3.000 mensagens (jsdom) | **1.689–1.876 ms**, 3.000 balões | **202–274 ms**, 80 balões |
| Mensagem enviada na tela (lógica + render, jsdom) | só depois do UltraMsg + salvar + recarregar tudo | **22,6–35,3 ms**, sem rede |
| Busca em 300 conversas e 21 mil mensagens | só nome, telefone e CPF | 1,9–3 ms quando acha; 41,9–48,8 ms sem resultado (busca adiada, não trava a digitação) |

**Chamadas por ação, contadas no código:**

| Ação | Antes | Depois |
|---|---|---|
| Enviar texto | server fn de envio, salvar (2 chamadas), recarregar a lista (≥ 2), painel (4 + N RPC), aprovações (N RPC) e auditoria (+1) | **1 server fn** |
| Abrir conversa não lida | salvar (2), recarregar a lista (≥ 2), painel (4 + N), aprovações (N); ao remontar o chat, mais uma recarga da lista | salvar em segundo plano (2) + releitura da aprovação de **1 caso** |
| Mensagem recebida (cada gravação) | recarregar a lista inteira | buscar **1 conversa** |

**Metas pedidas e situação** (sem declarar meta atingida sem evidência):

| Meta | Situação |
|---|---|
| Mensagem enviada na tela em até 100 ms | Lógica + render medidos em 22–35 ms no jsdom, sem rede. **Falta medir no navegador real** com `window.__medicoesAtendimento` (`envio.exibicaoLocal`). |
| Conversa em cache aberta em até 200 ms | Sem rede (cache). Render de uma conversa de 3.000 mensagens: 202–274 ms no jsdom; no Chrome tende a ser menor. **Falta medir no navegador.** |
| Tela atualizada até 500 ms depois do webhook | Depende do Supabase Realtime e da gravação no banco; o código aplica a conversa em cerca de 0,1 ms de CPU depois de buscá-la. Os logs `webhook_whatsapp` (fase `gravada`) e a medida `tempoReal.buscarEAplicar` permitem medir. **Não medido em produção.** |
| Zero duplicidades nos testes | Testes de repetição do provedor, nova tentativa de envio, eco e gravações simultâneas com CAS: nenhuma duplicata. |
| Nenhuma perda nos cenários testados | Mensagens simultâneas, reserva órfã e falha de rede no envio: nenhuma perda nos testes. A reconexão recarrega tudo (`online` e reinscrição do canal). |

**Como medir em produção:**

- No navegador, em DevTools, `window.__medicoesAtendimento` (ou `localStorage.setItem('debug-atendimento','1')` para ver no console). As medidas são `envio.exibicaoLocal`, `envio.ateRecibo`, `tempoReal.buscarEAplicar`, `tempoReal.varredura` e `salvar.conversa`.
- No servidor, nos logs do Lovable, as linhas JSON `envio_equipe` e `webhook_whatsapp`.

## 5. Preservado

O código da Anne não foi alterado: regras, prompts, modos, pausa e retomada, controle humano, recuperação, lembretes, confirmação de 40 min, coleta, acompanhamento, vendedor e agenda. Também continuam iguais:

- as regras de destino e envio (`enviarComRegras`, lista de produção, conta master, bloqueios);
- o envio de anexo com recibo e o apagar mensagem;
- etiquetas, etapas, timeline e cadastros;
- os gates jurídicos.

Duas mudanças de comportamento:

- O eco de mensagem do sistema agora **grava** o id do WhatsApp na mensagem (antes não gravava nada). Ele continua sem pausar a Anne e sem duplicar.
- O áudio recebido agora é guardado no caso, só para a equipe ouvir. Continua fora de Documentos, do Drive e da Anne.

## 6. Limitações que o código não resolve

- **UltraMsg:** a documentação oficial (conferida em 26/11/2026) não descreve:
  - o formato dos webhooks (`message_ack`, ids, `referenceId`) nem retentativas;
  - citação/resposta a uma mensagem específica (`msgId`) nem envio de voz.
  Por isso:
  - os recibos aceitam `ack` em texto ou número e dependem do eco para conhecer o id;
  - **responder citando uma mensagem** e **gravar e enviar áudio** não foram implementados (prometeriam algo não documentado);
  - se a instância estiver desconectada, nada chega, independentemente do código.
- **Armazenamento:** cada conversa é uma linha com todas as mensagens em JSON. Cada gravação reescreve a conversa inteira. O CAS de `atualizarConversa` tenta 5 vezes: rajadas acima disso numa mesma conversa podem devolver erro ao webhook. Separar as mensagens numa tabela própria exigiria migração (fora do escopo; nada no banco foi alterado).
- **Revisão material:** `material_revision` inclui campos operacionais como `lidoAte`. Marcar como lida altera a revisão e pode exigir nova aprovação da minuta. Esse comportamento já existia no banco; mudá-lo pede decisão jurídica e migração.
- **Anne no webhook:** a resposta da Anne (Claude) roda dentro da requisição do webhook. A tela não espera por isso, porque a mensagem já foi gravada e chega pelo Realtime, mas a resposta HTTP ao UltraMsg demora o tempo da IA.
- **Echo da Anne antes da gravação:** se o eco chega antes de a mensagem da Anne ser gravada, aquela mensagem fica sem recibos de entrega/leitura (continua "enviada").
- **Painel do escritório:** ainda faz uma RPC de aprovação por caso, agora a cada 60 s. Juntar em uma chamada exigiria uma função nova no banco.
- **Build:** `bun run build` falha no Windows no plugin `@lovable.dev/mcp-js` (separador de caminho), não no código. O lint do projeto inclui Prettier, e o código existente não segue esse formato, então o lint completo já falhava antes.
