# Auditoria da Anne antes da secretária digital (26/11/2026)

Leitura do código em `main` (até `f9d6cb1`), sem alterar produção. Referências no formato `arquivo:linha`.

## Como a Anne funciona hoje

| Peça | Onde | Observação |
|---|---|---|
| Entrada do WhatsApp | `src/routes/api/public/atendimento/whatsapp.ts` | Segredo na URL, instância conferida, deduplicação pelo id da mensagem, mídia guardada, `processarAna` chamado **dentro** do webhook. |
| Eco do celular do escritório | `whatsapp.ts` `registrarRespostaManual` | `message_create` com `fromMe` grava a mensagem como "Equipe" e liga `agenteAna.humano` + `controleHumanoEm` (pausa só aquela conversa). Mensagens do sistema são reconhecidas pelo texto (`mensagemDoSistema`) e por `agenteAna.envioAna`. |
| Camada conversacional | `src/lib/atendimento/ana.server.ts` `processarAna` | Claim CAS por mensagem (`iaExecucao`), chamada ao modelo com JSON validado por `anaSchema`, regras determinísticas em volta (agenda, nome, cancelamento, remarcação, confirmação 40 min, lembrete, coleta, encerramento), releitura antes do envio. |
| Modelo | `ana.functions.ts` + `ana-prompt.txt` + `ana-restrictions.txt` | Saída só em JSON com schema; o prompt já diz que histórico e contexto são dados, não instruções. |
| Envio | `envio.functions.ts` `enviarComRegras` | Destino sempre lido no servidor; só `acao === 'sistema:ana'` passa pela conferência de modo, pausa global e `autorizaEnvioAna`. |
| Controle humano | `ana-execution.ts` `autorizaEnvioAna`, `ana-control.functions.ts` | Um booleano (`humano`), uma pausa (`pausa`), a revisão `controleHumanoEm` e o modo antigo `modoIA` (`Desligada`/`Sugerir`/`Automática`); pausa global em `OfficeState.anaPausa`. |
| Rotinas do servidor | `confirmacao-consulta*.ts`, `lembrete-consulta*.ts`, `coleta*.ts`, `acompanhamento*.ts`, `vendedor*.ts`, `consulta-processo.server.ts`, `relatorio-diario.server.ts`, `ana-recovery.server.ts` | Chamadas por rotas `/api/public/*` com `LOVABLE_CRON_SECRET`; várias ainda **não agendadas** (`docs/rotinas-agendadas.md`). |
| Avisos à equipe | `avisos-equipe.ts` | JSON do caso, ids determinísticos, texto pronto nunca enviado sozinho. |
| Configuração | `OfficeState.automations` (`src/lib/office.ts`), diálogo `components/office/automations.tsx` | Interruptores salvos inteiros pelo navegador; não há matriz de permissões nem feature flag. |
| Simulador e bateria | `tools/simulador-ana` | Cópia de `processarAna` mantida à mão. |

## Falhas, conflitos e riscos encontrados

1. **Intervenção humana desliga tudo.** `processarAna` retorna cedo com `agenteAna.humano` (`ana.server.ts:69`). Com a equipe no controle, o "ok" à confirmação de 40 min, o SIM/NÃO do lembrete e a resposta à pergunta de encerramento não são tratados; a automação foi enviada, mas a resposta se perde.
2. **Cada rotina decide de um jeito.**
   - Lembrete das 08:00 ignora `modoIA` e a pausa global, não tem interruptor próprio e a escrita CAS não reconfere `humano`/`pausa` (`lembrete-consulta.server.ts:29,38`).
   - Coleta avisa a equipe em `Sugerir`; vendedor e lembrete pulam em silêncio.
   - Entrega de notícia processual aprovada e aviso de retorno ignoram `humano`/`pausa`/`modoIA` (`consulta-processo.server.ts:121-184`).
   - Pergunta de encerramento não confere `agente_ativo` nem a pausa global (`acompanhamento.server.ts:25-46`).
3. **`Sugerir` tem dois significados.** A confirmação de 40 min envia em `Sugerir` (`confirmacao-consulta.ts:161`), a coleta trata `Sugerir` como "não enviar" (`coleta.server.ts:74-77`).
4. **Um único `envioAna` para tudo.** Lembrete, coleta, vendedor e encerramento sobrescrevem o mesmo campo usado pela resposta da Anne (`envio.functions.ts:175`). Se o eco do WhatsApp chegar depois da sobrescrita, a mensagem da Anne pode ser lida como mensagem manual da equipe e a conversa vira "humano" com uma mensagem duplicada atribuída à equipe.
5. **Notícia processual sem reserva de eco.** `enviarAvisoProcesso` não grava `envioAna` antes do envio (`consulta-processo.server.ts:28-34`); o comentário de `registrarRespostaManual` promete reconferir depois de alguns segundos, mas o código confere uma vez só (`whatsapp.ts:79-99`).
6. **Conferência no envio só para `sistema:ana`.** O funil internacional envia com `motivo 'ana-funil-internacional'` (`ana.server.ts:97`), que não bate com `sistema:ana` e pula a reconferência de modo e pausa.
7. **IA no caminho do webhook.** O webhook espera `processarAna` (até 25 s de modelo) antes de responder ao UltraMsg. A deduplicação por id evita resposta dupla em reentrega, mas a latência do modelo atrasa o recebimento.
8. **Relatório diário fora da camada de envio.** `relatorio-diario.server.ts:18` chama o UltraMsg direto, sem conferir canal ou agente.
9. **Follow-up do vendedor pode repetir a cada 24 h** (inferido: o texto do próprio follow-up casa com a regra de oferta em `vendedor.ts:34-37`). O vendedor está desligado por padrão; conferir antes de ligar.
10. **Origem da mensagem por heurística de nome na tela.** `chat-messages.tsx:113-116` mostra como "ANA" qualquer autor que comece com "ana" (uma pessoa da equipe chamada Ana Paula apareceria como Anne).
11. **Falha vira "humano" sem distinção.** Erros de reserva/cancelamento gravam `humano: true` com `erro`. Uma migração ingênua para "híbrido" deixaria a confirmação de 40 min sair para quem pediu cancelamento e teve a falha. A nova derivação trata `humano + erro` como Humano.
12. **Sem matriz de permissões nem feature flag.** Não há como ativar uma automação por vez, nem desligar tudo do servidor.
13. **Alucinação: boas camadas, uma lacuna.** Já existem schema JSON, listas de horários montadas pelo código, recibos obrigatórios, `limparForaEscopoAna`, filtro ético e "contexto é dado". Faltava conferir de forma determinística os fatos do texto livre de saída (horários, datas, valores, números de processo, CPF) contra fontes verificadas da própria conversa.
14. **Memória sem confiabilidade.** O modelo recebe histórico e dados coletados sem separar o que é verificado, declarado pelo cliente, inferido ou desatualizado.
15. **Duplicação.** O simulador mantém uma cópia de `processarAna`; mudanças precisam ser replicadas à mão.

## O que foi reaproveitado (não reconstruído)

- `processarAna` continua sendo a camada conversacional, intacta no modo Automático.
- Claim por mensagem (`podeExecutarAna`), CAS (`atualizarConversa`), revisão `controleHumanoEm`, `enviarComRegras` e o reconhecimento de eco por `envioAna`.
- Textos e intérpretes existentes: `respostaConfirmacao40`, `respostaLembreteAna`, `registrarRespostaConfirmacao40`, `escolherHorarioAna`, `pedidoHorarioEspecifico`, `opcaoHorarioAna`.
- Avisos à equipe (`registrarAviso`), auditoria (`registrar_audit_log`), agenda oficial (`ocupadosAgenda`, `remarcarAgenda`, `selecionarOpcoesAna`).
- Configuração na raiz da área de trabalho (sem migração), com a mesma proteção do `saveOffice` para campos do servidor.

A arquitetura nova está em [anne-secretaria-digital.md](anne-secretaria-digital.md).
