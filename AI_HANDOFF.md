# AI handoff — Atendimento (Anne) — 26/11/2026

Leia primeiro: `AGENTS.md`, `src/lib/atendimento/AGENTS.md`, `docs/ATENDIMENTO-HOMOLOGACAO-FINAL.md`,
`docs/automacoes-operacionais.md`, `docs/rotinas-agendadas.md`.

## Estado

- Código local em `main` (Lovable sincroniza o que for enviado): commits `650dc7b`, `1a345f1`, `593ca3d`, `0b46032`,
  `160eb8f` e a documentação. **Nada publicado nem ativo em produção**; push é feito pelo usuário (GitHub Desktop →
  Push origin; a linha de comando não tem credencial).
- Testes: 1192/1192 (Vitest via Bun com a config de scratch que inlina o zod); `bun x tsc --noEmit -p .` limpo.
- Build no Windows falha só no plugin `@lovable.dev/mcp-js` (caminho com `\`); sem esse plugin o build Cloudflare conclui.
- Outra sessão ("Anne agent paused — API key issue") estava editando, sem commitar, `ana.server.ts`,
  `envio.functions.ts`, `secretaria/motor.ts` (`pausaGlobal` → `iaPausada`), `rotinas.ts`, `monitor-operacional.server.ts`
  (etapa `pausa-ia`), `coleta.server.ts`, `confirmacao-consulta*`, `office.ts`, docs e AGENTS. Não misturar commits.

## Próximos passos exatos

1. Usuário: Push origin + Publish no Lovable; conferir o agendamento único `monitorar-ana` (5 min) e remover os antigos.
2. Dra.: aprovar os 3 textos de coleta/encerramento; ativar T04/T11.2/T12.2/T12.3 quando aprovar; decidir antecedências.
3. Homologação com o número de teste (modo de teste das automações), roteiro na seção 5 do relatório final.
4. Pendências técnicas: cópia retroativa de anexos para o Drive; captura automática da confirmação de recebimento
   (T11.2/T12.3); fixture independente dos textos originais (precisa do documento da advocacia); medir desempenho do
   WhatsApp de novo; bateria com o modelo real quando a chave voltar.

## Regras novas (resumo)

- Monitor: trava `monitor-operacional-trava`, limite por etapa, adiadas primeiro, estado gravado ou 503.
- Agenda: concluído/inexistente no ProJuris antes do horário suspende (`consultaSuspensa`), nunca cancela; reserva
  órfã da Anne vira pendência.
- Textos fora da biblioteca só com aprovação exata (`secretaria.aprovacoesTexto`).
- Eventos processuais: `agenteAna.eventosProcessuais`; redesignação/cancelamento invalidam; lembretes só com modelo ativo.
- Sincronização automática de andamentos: até 3 processos/30 min, prioridade por evento futuro.
