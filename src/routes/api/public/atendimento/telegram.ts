import { createFileRoute } from '@tanstack/react-router';

// Canal descontinuado: não recebe, processa ou envia dados. Histórico preservado.
export const Route = createFileRoute('/api/public/atendimento/telegram')({
  server: { handlers: { POST: () => new Response('Canal descontinuado', { status: 410 }) } },
});
