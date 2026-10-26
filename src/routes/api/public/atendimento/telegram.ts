// ============= Full file contents =============

// Telegram aposentado: o escritório testará o atendimento por outros canais.
// O endpoint responde 410 (Gone) para qualquer chamada, sem processar nada,
// preservando o WhatsApp (UltraMsg) como canal de atendimento ativo.
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/atendimento/telegram')({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({ ok: false, aposentado: 'O canal Telegram foi aposentado neste projeto; o atendimento ativo é o WhatsApp (UltraMsg).' }),
          { status: 410, headers: { 'content-type': 'application/json' } },
        ),
      GET: async () =>
        new Response(
          JSON.stringify({ ok: false, aposentado: 'O canal Telegram foi aposentado neste projeto; o atendimento ativo é o WhatsApp (UltraMsg).' }),
          { status: 410, headers: { 'content-type': 'application/json' } },
        ),
    },
  },
});
