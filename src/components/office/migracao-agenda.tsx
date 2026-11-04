import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw, Calendar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { conferirMigracaoAgenda, executarMigracaoAgenda } from '@/lib/projuris-migracao.functions';

export function MigracaoAgendaPanel() {
  const conferir = useServerFn(conferirMigracaoAgenda); const migrar = useServerFn(executarMigracaoAgenda);
  const [dados, setDados] = useState<Awaited<ReturnType<typeof conferirMigracaoAgenda>> | null>(null);
  const [busy, setBusy] = useState(false); const [mensagem, setMensagem] = useState('');
  const [todos, setTodos] = useState(false);
  const data = (ms: number) => ms ? new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Horário a conferir';
  async function atualizar() { setBusy(true); setMensagem(''); try { setDados(await conferir()); } catch (e) { setMensagem(e instanceof Error ? e.message : 'Conferência indisponível.'); } finally { setBusy(false); } }
  const itens = dados?.itens.filter(i => todos || /consulta/i.test(i.evento.summary ?? '') || i.evento.extendedProperties?.private?.conversa) ?? [];
  return <section className="mx-auto max-w-[1500px] border-b p-4 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Migração da agenda</h2><Button variant="outline" disabled={busy} onClick={() => void atualizar()}><RefreshCw className={busy ? 'animate-spin' : ''}/>Conferir Google e ProJuris</Button></div>
    <p className="mt-3 text-sm text-muted-foreground">Google Calendar ativo · Originais preservados · Troca de agenda não aprovada</p>
    {mensagem && <p role="status" className="my-3 text-sm">{mensagem}</p>}
    {dados && <><p className="my-4 text-sm">{dados.total} eventos futuros · {dados.itens.filter(i => i.estado === 'pronto').length} aptos à conferência · {dados.itens.filter(i => i.estado === 'conflito').length} conflitos · {dados.itens.filter(i => i.estado === 'pendente').length} pendentes · {dados.itens.filter(i => i.estado === 'cancelado').length} cancelados</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)}/>Mostrar todos os eventos</label>
      <div className="mt-4 max-h-[650px] overflow-auto divide-y">{itens.map(i => <article className="py-4" key={i.evento.id ?? i.origem}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-medium">{i.evento.summary ?? 'Evento sem título'}</h3><p className="text-sm">{data(i.inicio)}{i.fim > i.inicio ? ` · ${(i.fim-i.inicio)/60000} minutos` : ''}</p><p className="text-sm text-muted-foreground">Cliente: {i.cliente || 'A conferir'} · Responsável: {i.evento.organizer?.self ? 'Dra. Carolina' : 'A conferir'}</p><p className="mt-2 text-sm">{i.motivo}</p>{i.conflitos.map(c => <p key={c.codigo} className="text-sm text-destructive">ProJuris: {c.titulo || 'Compromisso sem título'}</p>)}</div>
          {i.estado === 'pronto' && <Button variant="outline" disabled={busy} onClick={async () => { if (!i.evento.id || !i.evento.etag || !window.confirm(`Migrar ${i.evento.summary} em ${data(i.inicio)} para a agenda da Dra. Carolina? O original não será alterado.`)) return; setBusy(true); try { const r = await migrar({ data: { id: i.evento.id, etag: i.evento.etag, confirmado: true } }); setMensagem(r.verificado ? 'Compromisso migrado e conferido no ProJuris. Google preservado.' : 'Registro exige conferência humana. Google preservado.'); setDados(await conferir()); } catch(e) { setMensagem(e instanceof Error ? e.message : 'Migração não confirmada.'); } finally { setBusy(false); } }}><Calendar/>Migrar consulta<ArrowRight/></Button>}
        </div>{i.evento.description && <details className="mt-2 text-sm"><summary>Descrição original</summary><p className="whitespace-pre-wrap break-words py-2">{i.evento.description}</p></details>}
      </article>)}</div></>}
  </section>;
}