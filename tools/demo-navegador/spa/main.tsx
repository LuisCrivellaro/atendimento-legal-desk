import '@/styles.css';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { routeTree } from '@/routeTree.gen';
import { resetDemo } from '../supabase-fake';

// O "shell" HTML do TanStack Start só existe no servidor; aqui o app monta direto na página.
(routeTree as any).options.shellComponent = undefined;

const queryClient = new QueryClient();
const router = createRouter({ routeTree, context: { queryClient }, history: createMemoryHistory({ initialEntries: ['/'] }), scrollRestoration: true, defaultPreloadStaleTime: 0 });

createRoot(document.getElementById('app')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);

function DemoBar() {
  const [open, setOpen] = useState(true);
  const [ask, setAsk] = useState(false);
  const s: React.CSSProperties = { position: 'fixed', right: 'calc(12px + env(safe-area-inset-right, 0px))', bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', zIndex: 60, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, background: '#0f2e2c', color: '#e8f6f4', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.18)' };
  const btn: React.CSSProperties = { borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 };
  const primary: React.CSSProperties = { ...btn, background: '#14b8a6', color: '#06201e', border: 0, fontWeight: 600 };
  const ghost: React.CSSProperties = { ...btn, background: 'transparent', color: '#e8f6f4', border: '1px solid #3b5c59' };
  if (!open) return <button style={{ ...s, padding: '6px 10px', border: 0, cursor: 'pointer' }} onClick={() => setOpen(true)}>Demonstração</button>;
  return (
    <div style={{ ...s, padding: '10px 12px', maxWidth: 300, lineHeight: 1.45 }}>
      {ask ? <>Apagar tudo o que você alterou e voltar aos dados iniciais?</> : <><b>Versão de demonstração</b>: dados fictícios, IA e integrações simuladas, nada é enviado para fora. Para entrar, use qualquer e-mail e uma senha de 6 caracteres ou mais.</>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {ask
          ? <><button style={primary} onClick={() => { resetDemo(); location.reload(); }}>Sim, restaurar</button><button style={ghost} onClick={() => setAsk(false)}>Cancelar</button></>
          : <><button style={primary} onClick={() => setAsk(true)}>Restaurar dados</button><button style={ghost} onClick={() => setOpen(false)}>Ocultar</button></>}
      </div>
    </div>
  );
}
createRoot(document.getElementById('demo-bar')!).render(<DemoBar />);
