import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCheck, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conversa } from '@/lib/mock-data';
import { atualizarTarefaRetorno } from '@/lib/atendimento/retorno.functions';
export function ReturnTasks({ c }: { c: Conversa }) {
 const call = useServerFn(atualizarTarefaRetorno); const qc = useQueryClient();
 const [busy, setBusy] = useState(false); const [responses, setResponses] = useState<Record<string, string>>({});
 const tasks = c.tarefasRetorno ?? []; if (!tasks.length) return null;
 const save = async (tarefaId: string, respostaId?: string) => {setBusy(true);try {await call({data:{conversaId:c.id,tarefaId,...(respostaId?{respostaId}:{})}});await Promise.all([qc.invalidateQueries({queryKey:['casos']}),qc.invalidateQueries({queryKey:['dashboard']})]);toast.success(respostaId?'Retorno atendido.':'Tarefa reconhecida.');}catch(e){toast.error(e instanceof Error?e.message:'Não foi possível atualizar a tarefa.');}finally{setBusy(false);}};
 return <section aria-label="Tarefas de retorno" className="border-b pb-4"><h3 className="mb-2 text-sm font-semibold">Retornos pendentes</h3>{tasks.map(t=><div key={t.id} className="space-y-2 border-t py-3 text-sm"><p className="font-medium">{t.status==='atendida'?'Atendido':'Aguardando equipe'}</p><p className="whitespace-pre-wrap break-words">{t.assunto}</p><p className="text-xs text-muted-foreground">{new Date(t.cobradaEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>{t.status==='pendente'&&<>{!t.reconhecidaEm&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>save(t.id)}><Eye/>Ciente</Button>}<select aria-label={`Resposta enviada para ${t.id}`} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25" value={responses[t.id]??''} onChange={e=>setResponses({...responses,[t.id]:e.target.value})}><option value="">Resposta enviada pela equipe</option>{c.mensagens.filter(m=>m.de==='escritorio'&&!m.respostaAnaDe&&!m.apagadaParaTodos&&['enviada','entregue','lida'].includes(m.status??'')&&Date.parse(m.dataHora??'')>=Date.parse(t.criadaEm)).map(m=><option key={m.id} value={m.id}>{m.texto.slice(0,90)}</option>)}</select><Button size="sm" variant="outline" disabled={busy||!responses[t.id]} onClick={()=>save(t.id,responses[t.id])}><CheckCheck/>Concluir retorno</Button></>}</div>)}</section>;
}
