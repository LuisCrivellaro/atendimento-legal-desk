import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const here = (f: string) => path.resolve(__dirname, f);
const src = path.resolve(__dirname, '../../src');

export default defineConfig(async ({ command }) => {
  // O arquivo único (vite-plugin-singlefile) só é necessário no build; o servidor local roda sem ele.
  const plugins: PluginOption[] = [
    { name: 'demo-legal-ai', enforce: 'pre', resolveId(source) { if (/legal\/ai\.server(\.ts)?$/.test(source)) return here('legal-ai-fake.ts'); } },
    react(), tailwindcss(),
  ];
  if (command === 'build') plugins.push((await import('vite-plugin-singlefile')).viteSingleFile());
  return {
    root: here('spa'),
    base: './',
    envDir: here('.'),
    plugins,
    resolve: {
      alias: [
        { find: /^@supabase\/supabase-js$/, replacement: here('supabase-fake.ts') },
        { find: /^@tanstack\/react-start\/server$/, replacement: here('start-server-shim.ts') },
        { find: /^@tanstack\/react-start$/, replacement: here('start-shim.ts') },
        { find: /^@lovable\.dev\/cloud-auth-js$/, replacement: here('lovable-auth-fake.ts') },
        // Rotas MCP e webhooks entram na árvore de rotas, mas não rodam no navegador.
        { find: /^@lovable\.dev\/mcp-js(\/.*)?$/, replacement: here('stubs/mcp-js.ts') },
        { find: /^node:crypto$/, replacement: here('stubs/node-crypto.ts') },
        { find: /^ai$/, replacement: here('ai-fake.ts') },
        { find: /^@ai-sdk\/openai$/, replacement: here('openai-fake.ts') },
        { find: /^@\//, replacement: src + '/' },
      ],
      dedupe: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query'],
    },
    define: { 'process.env': JSON.stringify({ LOVABLE_API_KEY: 'demo', SUPABASE_URL: 'http://demo.local', SUPABASE_PUBLISHABLE_KEY: 'demo', SUPABASE_SERVICE_ROLE_KEY: 'demo' }) },
    build: { outDir: here('dist'), emptyOutDir: true, chunkSizeWarningLimit: 10000 },
    server: { port: 8090, host: '127.0.0.1', fs: { allow: [path.resolve(__dirname, '../..')] } },
  };
});
