# Atendimento do Manager ADV — homologação final (26/11/2026)

Escopo: os três subpilares do Atendimento (atendimento inicial, concierge de coleta, concierge de acompanhamento) e
as interfaces com ProJuris, WhatsApp (UltraMsg), Google Agenda/Meet/Drive, Claude, Assessor, Produção, Auditoria e
Andamentos. **Fora do escopo por decisão definitiva:** ZapSign, Mercado Pago, integrações financeiras e novos
fornecedores. Contrato, assinatura e pagamento continuam manuais e nunca são simulados.

> Estados usados: **Implementado e testado** (código + testes com mocks), **Validado com integração real**,
> **Aguardando publicação** (código só local, precisa de Push + Publish), **Aguardando aprovação** (depende da Dra.),
> **Aguardando configuração**, **Bloqueado**, **Fora do escopo**. Nada desta entrega foi validado com integração
> real nem está ativo em produção: todo o código novo está **aguardando publicação**.

## 1. Linha de base e verificação

| Item | Linha de base (início) | Final |
|---|---|---|
| Testes (Vitest via Bun, config de scratch com zod inline) | 1135 testes em 112 arquivos, todos passando | **1192 testes em 117 arquivos, todos passando** (inclui as mudanças em andamento da sessão "Anne agent paused") |
| Verificação de tipos (`bun x tsc --noEmit -p .`) | sem erros | **sem erros** |
| Lint (`eslint`) | erros de formatação (prettier) pré-existentes no repositório todo | arquivos novos/alterados desta missão: **0 problemas fora de formatação** |
| Build (`bun run build`, Windows) | falha: plugin `@lovable.dev/mcp-js` recusa caminho com `\` (ambiente) | igual; **build sem esse plugin (alvo Cloudflare/nitro) conclui com sucesso** |
| Build Linux/Cloudflare | não executado: sem Node, WSL sem distribuição | não executado localmente; o build oficial acontece no Lovable ao publicar |

- Bun 1.4.4. O carregamento de alguns testes com zod no Bun exige a config de scratch (zod inline); com ela **todos os
  117 arquivos carregaram**. Dependências de produção não foram alteradas para contornar o problema local.
- Avaliação com o modelo real (bateria/simulador com Claude): **não executada** — não há credencial autorizada nesta
  sessão e a chave da Anne está em investigação na sessão "Anne agent paused — API key issue". As regras críticas são
  cobertas por testes determinísticos independentes do modelo.
- Nenhuma mensagem real foi enviada, nenhuma reserva/compromisso real criado, nenhum arquivo enviado ao Drive real.

## 2. Matriz de requisitos

| Requisito | Antes | Agora | Arquivos | Testes | Para ativar |
|---|---|---|---|---|---|
| Monitor central único (5 min) | Monitor existia; execução sequencial sem trava, sem limite por etapa; etapa adiada recebia data de execução | Trava atômica (dois disparos nunca juntos; trava presa retomada em 2 min); limite de 20–25 s por etapa; adiadas rodam primeiro no ciclo seguinte e mantêm a data real; gravação do estado conferida; auditoria só na transição | `monitor-operacional.server.ts`, `monitor-estado.ts`, rota `monitorar-ana.ts` | `anne-monitor-operacional.test.ts` | Push + Publish; conferir o agendamento único (seção 4) |
| Atendimento híbrido em todas as automações | Coleta e pergunta de encerramento paravam quando a equipe assumia; não usavam o motor | Coleta, encerramento, lembretes de audiência/perícia e reagendamento passam pelo motor: Híbrido envia; Humano/Bloqueado viram aviso; prioridade humana adia; modo de teste respeitado | `coleta.server.ts`, `acompanhamento.server.ts`, `eventos-processuais.server.ts`, `secretaria/config.ts` (nova permissão `acompanhamento_aprovado`) | `coleta.test.ts`, `anne-hibrido-automacoes.test.ts`, `eventos-processuais.test.ts` | Push + Publish |
| Textos fora da biblioteca oficial | Lembretes de coleta e pergunta de encerramento (textos propostos) saíam como se fossem oficiais | Só saem sozinhos com o **texto exato aprovado pela Dra.** (Automações → Secretaria digital); texto alterado exige nova aprovação; sem aprovação, aviso com texto pronto | `secretaria/config.ts`, `config-schema.ts`, `secretaria.functions.ts`, `anne-secretaria-config.tsx` | `coleta.test.ts`, `anne-hibrido-automacoes.test.ts` | **Aguardando aprovação** da Dra. para os 3 textos |
| Consultas marcadas direto no ProJuris | Vínculo por telefone/nome; compromisso concluído virava "cancelada" | Concluído/inexistente antes do horário **suspende** automações e pede conferência (reabrir retoma sozinho); depois do início nada muda; reserva da Anne sem gravação local vira pendência (nunca vínculo silencioso); cancelamentos autorizados gravam "cancelada" | `sincronizacao-agenda.ts`, `situacao-consulta.ts`, `monitor-operacional.server.ts`, `appointment.functions.ts`, `ana.server.ts` | `anne-monitor-operacional.test.ts` | Push + Publish; equipe colocar o telefone do cliente no compromisso |
| Lembrete 08h / confirmação 2 h / reagendamento / situação | Implementados na entrega anterior | Mantidos; reagendamento usa a versão salva da biblioteca (T06/T08.1); bloqueio quando a agenda está em conferência | `secretaria/reagendamento.ts`, `operacional.ts`, `secretaria.server.ts` | `anne-secretaria-*.test.ts`, `confirmacao-consulta*.test.ts` | Push + Publish |
| Anti-alucinação de links | Links da resposta do modelo não eram conferidos | Link (Meet, contrato etc.) só passa se vier de recibo real, mensagem registrada ou biblioteca oficial; senão a resposta é retida | `secretaria/seguranca.ts`, `ana.server.ts` | `anne-secretaria-automacoes.test.ts` | Push + Publish |
| Documentos pessoais (T05) | Botão Trato feito envia o T05 (navegador) | Sem mudança (fluxo validado mantido) | `trato-feito.ts` | existentes | — |
| Checklist trabalhista (T09) | Manual (texto para copiar) | Botão no painel da Anne: equipe **confirma que o caso é trabalhista** e autoriza; servidor envia o texto exato com recibo, nunca repete, inclui os itens estruturados no checklist (sem duplicar, sem alterar checklist aprovado) | `checklist-trabalhista*.ts`, `anne-secretaria.tsx` | `checklist-trabalhista.test.ts` | Push + Publish |
| Lembretes de coleta (24 h / 48 h / 3x) | Funcionavam fora do motor | Motor + aprovação de texto + checklist relido antes do envio | `coleta.server.ts` | `coleta.test.ts` | Aprovação dos textos |
| Transcrição e resumo da consulta | Só campo de exemplo; botão desligado | Equipe anexa o arquivo do equipamento externo (txt/md/pdf/docx/odt ≤10 MB): armazenamento privado, cópia em "1- Start" no Drive com deduplicação, recibo na consulta, texto disponível para a Produção; falha do Drive não perde o arquivo | `registro-consulta*.ts`, `anne-secretaria.tsx` | `registro-consulta.test.ts` | Push + Publish |
| Gravação/transcrição automática do Meet ou Plaud | Inexistente | **Bloqueado**: sem API/licença comprovada nesta infraestrutura; fluxo manual acima é o caminho seguro | — | — | Decisão/licença futura |
| Pronto para Produção | Banner por fase | Indicador com requisitos (cliente identificado, contrato assinado, checklist completo/aprovado, pasta do Drive, transcrição/resumo quando a consulta foi realizada); Produção continua manual | `trato-feito.ts`, `anne-secretaria.tsx` | `registro-consulta.test.ts` | Push + Publish |
| Audiências e perícias | Rascunho T11.1/T12.1 para a revisora; cancelamento virava "nova audiência"; sem lembretes | Registro por evento; redesignação invalida rascunho/aprovação/lembretes; cancelamento cancela o evento; campos lidos do texto aprovado; T12.2 na véspera em dia útil (véspera não útil → pendência antecipada), T04 presencial na antecedência configurada, T11.2/T12.3 se a equipe ligar a confirmação | `eventos-processuais*.ts`, `acompanhamento.server.ts`, `consulta-processo.server.ts` | `eventos-processuais.test.ts` | **Aguardando aprovação**: Dra. ativar T04, T11.2, T12.2, T12.3 na biblioteca e decidir antecedências |
| Sincronização automática de andamentos | Só manual (botão) | No monitor a cada 30 min, até 3 processos de clientes com vínculo confirmado, prioridade para evento futuro e o mais antigo; reusa paginação, versões append-only, lease e `retry_em` | `eventos-processuais.server.ts` | (função de seleção coberta indiretamente; leitura real não executada) | Push + Publish |
| Painel de Automações | Monitor, programadas, pendências da agenda | + audiências/perícias futuras, aprovações pendentes, documentos pendentes, modelos aguardando a Dra.; etapas adiadas | `painel-atendimento*.ts(x)`, `monitor-estado.ts` | `eventos-processuais.test.ts` | Push + Publish |
| Filtro comercial | Implementado (entrega anterior) | Sem mudança | `filtro-comercial.ts` | existentes | — |
| Atendente vendedor | Opcional, desligado | Sem mudança (desligado por padrão) | `vendedor.server.ts` | existentes | — |
| Performance do WhatsApp | Otimização feita em entrega anterior (docs/atendimento-whatsapp-desempenho.md) | Não reavaliada nesta missão; **sem medições novas** | — | — | — |
| ZapSign / Mercado Pago | — | **Fora do escopo** | — | — | — |

## 3. O que depende da Dra. (aprovações, não implementação)

1. Aprovar (ou ajustar e aprovar) os três textos fora da biblioteca: lembrete do contrato, lembrete de faltantes,
   pergunta de encerramento — Automações → Secretaria digital.
2. Ativar na biblioteca, quando aprovados: T04, T11.2, T12.2, T12.3 (a infraestrutura já envia sozinha depois disso).
3. Decidir antecedências: lembrete de audiência presencial (padrão véspera), confirmação de recebimento (padrão
   desligada) e o texto de `[antecedência]` do T11.2.
4. Decisões pendentes já registradas: T07.2 vs T07.3 (consulta paga), 08.1 sem link do Meet, "Fique tranquila" no T06,
   variante oficial para contato após falta sem dois horários hoje, duração de retorno (30 min hoje; transcript previa 15–20).

## 4. Publicação e ativação (roteiro mínimo)

1. GitHub Desktop → **Push origin** (commits locais desta missão e da anterior).
2. Lovable → **Publish / Update**.
3. Agendamento único no Lovable: `POST https://cslawyers.lovable.app/api/public/atendimento/monitorar-ana`, a cada
   5 minutos, cabeçalho `Authorization: Bearer <LOVABLE_CRON_SECRET>`. Remover agendamentos antigos das rotas
   `confirmacao-consulta`, `lembrete-consulta`, `lembretes-atendimento`, `pendencias-processo`, `recuperar-ana`,
   `relatorio-diario` (manter não duplica envios).
4. Verificar: em Atendimento → Automações, "Última execução" deve mudar a cada 5 min; sem o alerta vermelho de
   rotina parada.
5. Conferir no Lovable os segredos `REVISORA_WHATSAPP` (número da Dra. para aprovar notícias) e as credenciais do
   ProJuris/Google/UltraMsg/Claude (cadastrados segundo o responsável; não verificados daqui).
6. Homologação controlada: ligar **Modo de teste das automações** com o número autorizado e seguir a seção 5.

## 5. Homologação ponta a ponta (com o número de teste; nada feito ainda)

| Passo | Ação mínima | Esperado |
|---|---|---|
| Mensagem recebida e resposta | Enviar "Olá" do número de teste | Resposta da Anne no Manager e no WhatsApp |
| Envio humano / híbrido | Equipe responde na conversa | Modo vira Híbrido; automações continuam; a Anne não responde ao conversacional |
| Agenda real e reserva | Pedir consulta; escolher horário | Compromisso no ProJuris com `manageradv:`; confirmação oficial |
| Confirmação 2 h / lembrete 08h | Consulta de teste no dia | Mensagens oficiais uma vez |
| Reagendamento | Responder "não vou conseguir" | Horários reais; escolha remarca com recibo |
| Documento | Enviar PDF | Guardado (recibo), checklist atualizado, nenhuma "aprovação" automática |
| T09 | Botão no painel (caso de teste trabalhista) | Texto oficial e itens no checklist |
| Transcrição | Anexar .txt de teste | Arquivo guardado e no Drive (pasta do caso de teste) |
| Notícia processual | Perguntar "como está meu processo?" (cliente de teste vinculado) | Rascunho para a revisora; nada sai antes do "ok" |

## 6. Limitações conhecidas (registradas, não escondidas)

- Compromisso manual no ProJuris não traz vínculo estruturado com a pessoa na consulta usada; o reconhecimento usa o
  telefone no título/descrição ou o nome de vínculo confirmado, com candidato único. Reservas da Anne usam o código
  estruturado (`manageradv:consulta:<conversa>:<início>`).
- Anexos recebidos antes da criação da pasta do Drive não são copiados retroativamente (continuam guardados no Manager).
- Confirmação de recebimento do T11.2/T12.3 pelo cliente é registrada pela equipe (não há captura automática da resposta).
- Não existe cópia independente dos 19 textos originais além dos snapshots gerados na importação; a comparação com o
  documento original da advocacia depende de a Dra. fornecer o arquivo de origem.
- T05 continua sendo enviado pelo navegador (botão Trato feito), fluxo já validado; não foi movido para o servidor.

## 7. Commits desta missão (locais)

`650dc7b` P0 monitor/agenda/híbrido · `1a345f1` T09, links, biblioteca salva, aprovação de textos · `593ca3d` audiências,
perícias e andamentos · `0b46032` transcrição/resumo e Produção · `160eb8f` painel · documentação (este arquivo).
