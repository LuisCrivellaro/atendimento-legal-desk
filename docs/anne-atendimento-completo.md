# Relatório — Anne completa (módulo Atendimento) — 25/11/2026

Branch local `anne-atendimento-completo`, criada a partir da `main` do `atendimento-legal-desk` (`7ab4e12`).
Commits locais, sem push. Nada publicado, nada enviado ao Lovable, nenhuma rotina agendada,
nenhuma mensagem real enviada, nada escrito no ProJuris.

> Por decisão do usuário nesta sessão, o trabalho foi feito no repositório ligado ao Lovable (código mais novo,
> commits do Lovable até 25/11 às 14h14), e não no clone `ManagerADV-Claude` citado no prompt mestre
> (parado em 17/11 e com alterações não salvas). Por isso a comparação do P0-0 é desnecessária: este já é o
> código do Lovable.

## 1. Testes, typecheck e build

| | Linha de base (antes) | Final |
|---|---|---|
| Testes (Vitest com zod inline, ver abaixo) | 92 arquivos, 776 testes, todos passando | **99 arquivos, 884 testes, todos passando** (após as correções da revisão) |
| `bun run test` puro (sem Node) | 61 arquivos e 469 testes passando; 31 arquivos não carregam | 62 arquivos e 474 testes passando; 37 não carregam, todos pelo mesmo erro de zod no Bun |
| `tsc --noEmit` | sem erros | sem erros |
| `bun run build` | falha no Windows (plugin do Lovable) | falha igual, antes de compilar o código |

- Esta máquina não tem Node. Com `bun run test`, 31 arquivos de teste não carregam (`z` indefinido ao importar zod no runtime do Bun): é do ambiente, não do código. Os números acima usam uma configuração local, fora do repositório, igual à do projeto mais `server.deps.inline: ['zod']`.
- O build falha em `@lovable.dev/mcp-js` por causa da barra invertida dos caminhos do Windows. As rotas novas foram acrescentadas à mão em `src/routeTree.gen.ts`, espelhando as existentes; o build do Lovable (Linux) vai regenerar o arquivo.
- Nenhum teste existente foi apagado ou enfraquecido. Ajustes em testes existentes:
  - `atendimento.test.ts`: a automação de 1 h antes passou a ser a confirmação de 40 min (decisão N1/S do prompt).
  - `respostas-prontas.test.ts`: o título deixou de dizer "12"; a fixture `mensagens-oficiais.json` recebeu o novo texto oficial de `/confirmar` e 5 textos **propostos** (coleta e encerramento). A comparação continua sendo de texto idêntico.

### 1.1 Resultado final

+7 arquivos e +102 testes em relação à linha de base. Os novos testes cobrem os 12 cenários do P0-1 (inclusive "não" com o consentimento do lembrete das 08:00 ativo, que antes cancelaria), e os casos de P0-2, P0-3, P0-4 e P1-3. Bateria da Anne com 3 cenários novos (D40a, D40b, D41).

**Teste com mock não comprova a integração real.** Nada aqui foi verificado contra UltraMsg, ProJuris, Google ou Supabase reais.

## 2. Estado por item

| Item | Estado |
|---|---|
| P0-0 Inventário | Feito. Branch criada; linha de base registrada; fluxo lido. Comparação com o `atendimento-legal-desk`: não aplicável (é este repositório). |
| P0-1 Confirmação 40 min | Implementado e testado com mock. Rota `confirmacao-consulta` **não agendada**. |
| P0-2 Sem simulação enganosa | Implementado e testado com mock. Envio real de anexo depende da UltraMsg real. |
| P0-3 Concierge de coleta | Implementado e testado com mock. Rota `lembretes-atendimento` **não agendada**. |
| P0-4 Acompanhamento | Implementado e testado com mock (encerramento, oferta de sextas, aviso de audiência/perícia na fila da revisora). "O que a IA pode dizer" no Treinamento: **não feito**. Cenário de bateria para o encerramento: **não feito** (há para a confirmação e a coleta). |
| P1-1 ZapSign | **Não feito.** Contrato segue o fluxo manual (link do ProJuris enviado pelo canal). |
| P1-2 Pós-consulta | **Não feito.** Botões de transcrição/sumarização agora desabilitados com o motivo (antes fingiam envio). |
| P1-3 Vendedor | Implementado e testado (regras puras), **desligado por padrão**. |
| P1-4 Tempos limite | **Não revisado.** UltraMsg já usa 15 s; Anthropic, Google e ProJuris não foram conferidos. |
| P2-1 Mercado Pago | **Não feito.** Ação mostra "não configurado". |
| P2-2 Etapas ProJuris | Implementado: registro local + aviso "Lançar no ProJuris". Sem escrita (D5). |
| P2-3 Nome da pasta | **Não feito.** |

## 3. Arquivos

Novos: `src/lib/atendimento/{confirmacao-consulta,confirmacao-consulta.server,avisos-equipe,agenda-equipe.functions,coleta,coleta.server,acompanhamento,acompanhamento.server,vendedor,vendedor.server}.ts`, `src/routes/api/public/atendimento/{confirmacao-consulta,lembretes-atendimento}.ts`, `src/components/office/attendance-avisos.tsx`, `docs/rotinas-agendadas.md`, este relatório e 8 arquivos de teste em `src/test/`.

Alterados (principais): `ana.server.ts`, `ana-rules.ts` (tipos), `ana-prompt.txt`, `envio.functions.ts`, `canais/ultramsg.ts`, `consulta-processo.ts` e `.server.ts`, `quick-reply-calendar.ts`, `schedule-rules.ts`, `atendimento.ts`, `respostas-prontas.ts`, `casos.ts`, `assessor.ts`, `office.functions.ts`, `mock-data.ts`, `projuris/base.server.ts` (só leitura: chama a criação de rascunhos depois da sincronização), `routes/_authenticated/atendimento.tsx`, `components/office/{attendance-actions,attendance-presentation,automations,chat-messages,pipeline-sync}.tsx`, `services/integracoes.ts`, `routeTree.gen.ts`, simulador e bateria (`tools/simulador-ana`), `AGENTS.md` do módulo, `README.md`, `roadmap.md`.

## 4. Decisões aplicadas

- **S1** Prompt: "por enquanto, só agendamento" virou os três papéis; o agendamento não mudou.
- **S2** A Anne diz o que falta pelos nomes do checklist e só acusa recebimento com recibo do servidor; avaliar o documento é da equipe.
- **S3** Uma pergunta de encerramento depois da notícia aprovada e entregue; reserva continua exigindo escolha explícita.
- **S4** Nada mudou na agenda: ProJuris oficial, Google só para o Meet.
- **D1** Aplicada como decidida (saudação por horário de São Paulo, espaço antes do "!").
- **D2** Fallback: `DURACAO_RETORNO = 30`, com teste.
- **D3** Fallback: até 3 lembretes por pendência (contrato por link; faltantes por item), depois aviso à equipe.
- **D4** Fallback: texto proposto do prompt, marcado "(proposto)" em Mensagens prontas. Atenção: a pergunta tem duas partes; "sim" sozinho é tratado como pedido de horários, e "sim, esclareceu" como encerramento.
- **D5** Fallback: sem escrita no ProJuris.

## 5. O que precisa ser feito para chegar aos clientes

1. Revisar e fazer merge desta branch na `main` e o push (o Lovable recebe a `main`).
2. Agendar as rotinas novas no agendador do Lovable (ou pg_cron, se migrar): `confirmacao-consulta` a cada 5 min e `lembretes-atendimento` a cada 30 min (`docs/rotinas-agendadas.md`).
3. Teste real com um número autorizado: confirmação de 40 min, resposta "ok" e "não", anexo enviado com recibo, lembrete de contrato.
4. Confirmar com a Dra.: quebras de linha do texto oficial de confirmação (reconstruídas do texto colado: 5 linhas), D2, D3, D4, D5 e os textos propostos da coleta.
5. Contar casos com o link de demonstração antigo (não havia acesso ao banco nesta máquina):
   `select count(*) from casos where dados->>'contratoLink' = 'https://app.zapsign.com.br/demo';`
   Nenhum dado real foi alterado.
6. Credenciais futuras: ZapSign e Mercado Pago (itens não feitos).

## 5.1 Correções da revisão de código (antes do merge)

- Link de demonstração antigo (`…zapsign.com.br/demo`) nunca entra em lembrete nem em "Lembrar assinatura"; o próximo passo pede o link real.
- "Tá certo", "ficou bom" sem "?" deixaram de contar como pergunta sobre o documento (não pausam mais a Anne).
- Primeiro lembrete de coleta só para contrato enviado ou pedido de documentos dos últimos 7 dias: ligar a rotina não dispara mensagens nem avisos em massa para casos antigos.
- Anexo com envio não confirmado continua reservado; reenviar exige marcar "Conferi a conversa no WhatsApp do cliente e o arquivo não chegou".
- Aviso de audiência lê "às 14h30"; o rótulo "Guardado (não enviado ao cliente)" só aparece em anexos guardados por este fluxo.

## 6. Riscos e limitações

- O formato de resposta dos endpoints de documento/imagem da UltraMsg não está documentado; o envio só conta como feito com `sent` verdadeiro.
- A data do aviso de audiência/perícia só sai quando está escrita no próprio andamento; sem data, o rascunho vai à revisora sem ela (e só para andamentos dos últimos 7 dias). Compromissos de `tarefa.calendario` ainda não são lidos para esse aviso.
- O vendedor lê a chave do workspace do dono no servidor; a restrição "só sênior/admin altera" vale pela tela (Automações).
- Ações de reserva da equipe gravam o recibo no servidor; outras ações da tela continuam salvando pelo fluxo antigo do navegador (risco já existente de salvamento desatualizado).
- O "aviso de andamento" do módulo Andamentos (fora do escopo) continua com o stub; com canal real ele recusa ("Integração não conectada"), não finge envio.
