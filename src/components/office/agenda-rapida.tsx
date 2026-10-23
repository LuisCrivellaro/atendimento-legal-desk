import { useState } from 'react';
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { n8n } from '@/services/integracoes';
import { formatarHorarioCliente, type FreeSlot } from '@/lib/atendimento';
import type { Conversa } from '@/lib/mock-data';

/** Consulta rápida da agenda para o atendente humano. Só lê horários; nada é reservado. */
export function AgendaRapida({ c, onInsert, onOffer, disabled }: { c: Conversa; onInsert: (texto: string) => void; onOffer: () => void; disabled?: boolean }) {
  const cadastrado = (c.tipoClienteAgenda ?? c.agenteAna?.tipoCliente) === 'cadastrado';
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<FreeSlot[] | null>(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const carregar = async () => {
    setLoading(true); setErro('');
    try { const r = await n8n.obterHorariosLivres({ sextas: cadastrado }); setSlots(r.slots); }
    catch { setErro('Não foi possível consultar a agenda.'); }
    finally { setLoading(false); }
  };
  const livres = (slots ?? []).filter(s => !s.ocupado);
  return <Popover open={open} onOpenChange={v => { setOpen(v); if (v) void carregar(); }}>
    <PopoverTrigger asChild><Button size="icon" variant="ghost" className="size-9 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Consultar horários da agenda" title="Consultar horários da agenda" disabled={disabled}><CalendarClock /></Button></PopoverTrigger>
    <PopoverContent align="start" side="top" className="w-80 max-w-[92vw] p-0">
      <div className="flex items-center justify-between border-b px-3 py-2"><div><p className="text-sm font-semibold">Horários da agenda</p><p className="text-2xs text-muted-foreground">{cadastrado ? 'Cliente cadastrado · sexta 13h30–17h30' : 'Novo cliente · segunda a quinta'} · 30 min</p></div><Button size="icon" variant="ghost" className="size-7" aria-label="Atualizar horários" onClick={() => void carregar()} disabled={loading}><RefreshCw className="size-3.5" /></Button></div>
      <div className="max-h-72 overflow-y-auto p-2">
        {loading && <Loader2 className="mx-auto my-4 animate-spin" />}
        {erro && <p role="alert" className="p-2 text-sm text-destructive">{erro}</p>}
        {!loading && slots && !slots.length && <p className="p-2 text-sm text-muted-foreground">Nenhum horário encontrado.</p>}
        {!loading && slots?.map(s => <button key={s.iso} type="button" disabled={s.ocupado} onClick={() => { onInsert(formatarHorarioCliente(s.iso)); setOpen(false); }} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-secondary disabled:cursor-not-allowed disabled:text-muted-foreground disabled:line-through disabled:hover:bg-transparent"><span>{formatarHorarioCliente(s.iso)}</span><span className="text-2xs">{s.ocupado ? 'ocupado' : 'livre'}</span></button>)}
      </div>
      <div className="flex gap-2 border-t p-2"><Button size="sm" variant="outline" className="flex-1 text-xs" disabled={!livres.length} onClick={() => { onInsert(livres.slice(0, 3).map(s => `• ${formatarHorarioCliente(s.iso)}`).join('\n')); setOpen(false); }}>Inserir 3 livres</Button><Button size="sm" className="flex-1 text-xs" onClick={() => { setOpen(false); onOffer(); }}>Enviar proposta</Button></div>
      <p className="px-3 pb-2 text-2xs text-muted-foreground">Clique num horário para colar na mensagem. Nada é reservado por aqui.</p>
    </PopoverContent>
  </Popover>;
}
