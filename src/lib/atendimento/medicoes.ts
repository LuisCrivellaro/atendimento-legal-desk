// Medições locais de latência do Atendimento (navegador). Ficam em memória em `window.__medicoesAtendimento` para
// conferência no DevTools; com localStorage `debug-atendimento=1` também saem no console. Nunca guardam texto, nome
// ou telefone, só tempos e contagens.
export interface Medida { nome: string; ms: number; em: number; [k: string]: string | number | boolean }

type Global = { __medicoesAtendimento?: Medida[] };

export function registrarMedida(nome: string, ms: number, extra: Record<string, string | number | boolean> = {}) {
  try {
    const g = globalThis as Global;
    const lista = (g.__medicoesAtendimento ??= []);
    lista.push({ ...extra, nome, ms: Math.round(ms * 10) / 10, em: Date.now() });
    if (lista.length > 500) lista.splice(0, lista.length - 500);
    if (typeof localStorage !== 'undefined' && localStorage.getItem('debug-atendimento') === '1') console.debug('[atendimento]', nome, `${ms.toFixed(1)} ms`, extra);
  } catch { /* medição nunca interrompe a tela */ }
}

/** p50/p95/máximo por medida, para o relatório antes/depois. */
export function resumoMedidas(lista: readonly Medida[] = (globalThis as Global).__medicoesAtendimento ?? []) {
  const grupos = new Map<string, number[]>();
  for (const m of lista) { const g = grupos.get(m.nome); if (g) g.push(m.ms); else grupos.set(m.nome, [m.ms]); }
  return Object.fromEntries([...grupos].map(([nome, v]) => {
    const s = [...v].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
    return [nome, { n: s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1]! }];
  }));
}
