import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { FUNCIONALIDADES, limitarNivel, type ConfigSecretaria, type Funcionalidade, type NivelPermissao } from '@/lib/atendimento/secretaria/config';
import { CHAVES_TEMPLATE, DESCRICAO_TEMPLATE, TEMPLATES_PADRAO, camposTemplate } from '@/lib/atendimento/secretaria/templates';
import { lerConfigSecretariaAnne, salvarConfigSecretariaAnne } from '@/lib/atendimento/secretaria/secretaria.functions';
import { executar } from '@/lib/executar';

const NIVEIS: { valor: NivelPermissao; rotulo: string }[] = [
  { valor: 'automatico', rotulo: 'Automático' },
  { valor: 'aprovacao', rotulo: 'Com aprovação' },
  { valor: 'desligado', rotulo: 'Desligado' },
];
const RETORNO = [{ valor: 'nunca', rotulo: 'Nunca (só a equipe devolve)' }, { valor: '12', rotulo: '12 h sem mensagem da equipe' }, { valor: '24', rotulo: '24 h sem mensagem da equipe' }, { valor: '48', rotulo: '48 h sem mensagem da equipe' }];

/**
 * Configuração da secretaria digital (dentro de "Automações do atendimento"): feature flag, permissões por
 * funcionalidade, prioridade humana, volta ao Automático, horário das automações e modelos fixos.
 * Só sênior/admin edita; a gravação é do servidor e nunca passa pelo modelo.
 */
export function AnneSecretariaConfig() {
  const ler = useServerFn(lerConfigSecretariaAnne);
  const salvar = useServerFn(salvarConfigSecretariaAnne);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['secretaria-config'], queryFn: () => ler(), staleTime: 30000, retry: false });
  const [c, setC] = useState<ConfigSecretaria | undefined>(undefined);
  useEffect(() => { if (data) setC(data.config); }, [data]);
  if (isLoading) return <p className="pt-4 text-xs text-muted-foreground">Carregando a secretaria digital…</p>;
  if (error || !data || !c) return <p className="pt-4 text-xs text-destructive">Configuração da secretaria indisponível.</p>;
  const editar = data.podeEditar;
  const mudar = (fn: (x: ConfigSecretaria) => ConfigSecretaria) => setC(x => (x ? fn(x) : x));
  const gravar = () => void executar('Salvar secretaria digital', async () => {
    const r = await salvar({ data: { ativa: c.ativa, permissoes: c.permissoes, janelaPrioridadeHumanaMin: c.janelaPrioridadeHumanaMin, retornoAutomaticoHoras: c.retornoAutomaticoHoras, janelaAutomacoes: c.janelaAutomacoes, templates: Object.fromEntries(Object.entries(c.templates).filter(([k, v]) => (CHAVES_TEMPLATE as string[]).includes(k) && !!v?.trim())) as Record<string, string> } });
    await qc.invalidateQueries({ queryKey: ['secretaria-config'] });
    return r;
  });
  return (
    <section aria-label="Secretaria digital" className="space-y-3 border-t pt-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">Secretaria digital (Anne em duas camadas)</h3>
          <p className="text-xs text-muted-foreground">Com a equipe na conversa, a Anne continua só com as automações autorizadas (modo Híbrido). Desligada, tudo segue como antes.</p>
          {data.chaveMestraDesligada && <p className="text-xs font-medium text-destructive">Desligada pelo servidor (ANNE_SECRETARIA_DESLIGADA).</p>}
        </div>
        <span title={!editar ? 'Só sênior/admin altera' : undefined}><Switch checked={c.ativa} disabled={!editar} onCheckedChange={v => mudar(x => ({ ...x, ativa: v }))} aria-label="Ligar secretaria digital" /></span>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Permissões por funcionalidade</p>
        {(Object.keys(FUNCIONALIDADES) as Funcionalidade[]).map(f => (
          <label key={f} className="flex items-center justify-between gap-3 border-b py-1.5">
            <span className="min-w-0">
              <span className="block">{FUNCIONALIDADES[f].titulo}</span>
              <span className="block text-xs text-muted-foreground">{FUNCIONALIDADES[f].descricao}</span>
            </span>
            <Select value={c.permissoes[f]} disabled={!editar} onValueChange={v => mudar(x => ({ ...x, permissoes: { ...x.permissoes, [f]: limitarNivel(f, v as NivelPermissao) } }))}>
              <SelectTrigger className="h-8 w-40 shrink-0 text-xs" aria-label={`Permissão: ${FUNCIONALIDADES[f].titulo}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {NIVEIS.map(n => <SelectItem key={n.valor} value={n.valor} disabled={limitarNivel(f, n.valor) !== n.valor}>{n.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Prioridade humana (minutos)</span>
          <Input type="number" min={0} max={1440} value={c.janelaPrioridadeHumanaMin} disabled={!editar} onChange={e => mudar(x => ({ ...x, janelaPrioridadeHumanaMin: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) }))} />
          <span className="block text-xs text-muted-foreground">Automações não urgentes esperam a equipe; as urgentes viram aviso.</span>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Volta ao Automático</span>
          <Select value={c.retornoAutomaticoHoras === null ? 'nunca' : String(c.retornoAutomaticoHoras)} disabled={!editar} onValueChange={v => mudar(x => ({ ...x, retornoAutomaticoHoras: v === 'nunca' ? null : Number(v) }))}>
            <SelectTrigger className="h-9 text-xs" aria-label="Volta ao Automático"><SelectValue /></SelectTrigger>
            <SelectContent>{RETORNO.map(r => <SelectItem key={r.valor} value={r.valor}>{r.rotulo}</SelectItem>)}</SelectContent>
          </Select>
          <span className="block text-xs text-muted-foreground">Nunca vale para Humano/Bloqueado escolhidos pela equipe.</span>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Horário das automações (início e fim)</span>
          <span className="flex gap-2">
            <Input type="time" value={c.janelaAutomacoes.inicio} disabled={!editar} onChange={e => mudar(x => ({ ...x, janelaAutomacoes: { ...x.janelaAutomacoes, inicio: e.target.value } }))} aria-label="Início das automações" />
            <Input type="time" value={c.janelaAutomacoes.fim} disabled={!editar} onChange={e => mudar(x => ({ ...x, janelaAutomacoes: { ...x.janelaAutomacoes, fim: e.target.value } }))} aria-label="Fim das automações" />
          </span>
        </label>
        <label className="flex items-center justify-between gap-3 self-end py-2">
          <span className="text-xs">Só em dias úteis</span>
          <Switch checked={c.janelaAutomacoes.diasUteis} disabled={!editar} onCheckedChange={v => mudar(x => ({ ...x, janelaAutomacoes: { ...x.janelaAutomacoes, diasUteis: v } }))} aria-label="Só em dias úteis" />
        </label>
      </div>

      <details>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Modelos de mensagem</summary>
        <div className="space-y-2 pt-2">
          {CHAVES_TEMPLATE.map(k => (
            <label key={k} className="block space-y-1">
              <span className="block text-xs">{DESCRICAO_TEMPLATE[k]}{camposTemplate(k).length ? ` · campos: ${camposTemplate(k).map(x => `{${x}}`).join(', ')}` : ''}</span>
              <Textarea rows={2} className="text-xs" placeholder={TEMPLATES_PADRAO[k]} value={c.templates[k] ?? ''} disabled={!editar} onChange={e => mudar(x => ({ ...x, templates: { ...x.templates, [k]: e.target.value } }))} />
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Vazio usa o texto padrão. Texto com campo diferente dos listados é ignorado.</p>
        </div>
      </details>

      {editar && <Button size="sm" onClick={gravar}>Salvar secretaria digital</Button>}
      {c.atualizadoEm && <p className="text-xs text-muted-foreground">Última alteração por {c.atualizadoPor ?? 'equipe'}.</p>}
    </section>
  );
}
