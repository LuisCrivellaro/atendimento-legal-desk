/** P0 25/11/2026: com canal real ativo (ou desconhecido), nenhuma ação simulada pode prosseguir. */
export const MSG_INTEGRACAO_NAO_CONECTADA = 'Integração não conectada: nada foi enviado ao cliente';
export function simulacaoPermitida(canalAtivo: string | null | undefined): boolean {
  return canalAtivo === 'desligado';
}
