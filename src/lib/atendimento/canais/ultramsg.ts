// UltraMsg (WhatsApp): fase futura. Entra depois apenas como mais um adaptador,
// implementando a mesma interface AdaptadorCanal de tipos.ts. Não implementado.
import type { AdaptadorCanal } from './tipos';

export const ultramsgAdapter: AdaptadorCanal = {
  nome: 'ultramsg',
  enviarTexto: () => Promise.resolve({ ok: false, erro: 'UltraMsg disponível em fase futura.' }),
};
