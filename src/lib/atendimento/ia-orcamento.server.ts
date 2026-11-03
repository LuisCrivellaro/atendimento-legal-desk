/** Limite diário real de chamadas ao Claude, contado atomicamente no banco. */
export function limiteDiarioIA(env: Record<string, string | undefined> = process.env) {
  const n = Number(env['ANA_LIMITE_CHAMADAS_DIA']);
  return Number.isInteger(n) && n > 0 ? n : 1500;
}
export function orcamentoIA() {
  const admin = () => import('@/integrations/supabase/client.server').then(m => m.supabaseAdmin);
  return {
    async reservar() {
      const supabaseAdmin = await admin();
      const r = await supabaseAdmin.rpc('ana_reservar_chamada_ia', { p_limite: limiteDiarioIA() });
      if (r.error) throw Object.assign(new Error('Controle de consumo indisponível.'), { code: 'server_unavailable', retryable: true });
      return r.data === true;
    },
    async registrar(entrada: number, saida: number) { await (await admin()).rpc('ana_registrar_tokens', { p_entrada: entrada, p_saida: saida }); },
  };
}
