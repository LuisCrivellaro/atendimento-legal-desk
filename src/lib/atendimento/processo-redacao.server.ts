import { claudeComoSample } from '../ana-claude/claude.server';
import identidade from './ana-prompt.txt?raw';
import redacao from './ana-redacao-processo.txt?raw';
import type { EntradaRedacao } from './consulta-processo';

export async function redigirNoticiaProcesso(fatos: EntradaRedacao): Promise<string> {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) throw new Error('Redação indisponível.');
  const modelo = process.env['ANA_MODELO'];
  const sample = claudeComoSample({ apiKey: key, ...(modelo ? { modelo } : {}) });
  const r = await sample([{ role: 'user', content: `${identidade}\n\n${redacao}` }, { role: 'user', content: JSON.stringify({ fatos }) }], { signal: AbortSignal.timeout(30000) });
  return r.text;
}