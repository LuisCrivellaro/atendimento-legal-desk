import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { listarCasos, salvarCaso } from '@/lib/casos';
import { toast } from 'sonner';
import { Search, Paperclip, Mic, Image as ImageIcon, Send, Video, Sparkles, Pencil, FolderOpen, FileText, CheckCircle2, Circle, Play, Upload, Loader2, Zap, ArrowRight, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { etapaLabel, type Conversa, type Etapa, type Mensagem } from '@/lib/mock-data';
import { n8n } from '@/services/n8n';
import { AnaliseDocumento } from '@/components/analise-documento';
import { executar } from '@/lib/executar';
import { replyQueue, needsReply, matchesConversation, nextStep, newMessage, unread, waitingMinutes, waitTone, shortcuts, programmed, defaultAutomations, type AIMode } from '@/lib/atendimento';
import { atendimentoAI } from '@/lib/atendimento.functions';
import { useOffice } from '@/hooks/use-office';
import { Route as AuthRoute } from './route';
import { supabase } from '@/integrations/supabase/client';
import { AttendanceActions, actionLabels, type AttendanceAction } from '@/components/office/attendance-actions';
import { Automations } from '@/components/office/automations';
import { PipelineSync } from '@/components/office/pipeline-sync';
import { saveFile, fileBase64 } from '@/lib/office-store';
import { analisarDocumento } from '@/lib/documentos.functions';
export const Route=createFileRoute('/_authenticated/atendimento')({head:()=>({meta:[{title:'Atendimento — Manager ADV'},{name:'description',content:'Fila de respostas, consultas, documentos e atendimento CS Lawyers.'},{property:'og:title',content:'Atendimento — Manager ADV'},{property:'og:description',content:'Fila de respostas, consultas, documentos e atendimento CS Lawyers.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:Atendimento});
const etapaCor:Record<Etapa,string>={inicial:'bg-pending text-pending-foreground',documentos:'bg-secondary text-secondary-foreground',ativo:'bg-success text-success-foreground'};
const iniciais=(n:string)=>n.split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('');
function Atendimento(){const {data,isLoading,error}=useQuery({queryKey:['casos'],queryFn:listarCasos,refetchInterval:15000});if(isLoading)return <p className="p-8"><Loader2 className="inline animate-spin"/> Carregando casos…</p>;if(error)return <p className="p-8 text-destructive">Não foi possível carregar os casos.</p>;return <AtendimentoTela inicial={data??[]}/>;}
function AtendimentoTela({inicial}:{inicial:Conversa[]}){
 const [list,setList]=useState(inicial);const listRef=useRef(inicial);const [selId,setSelId]=useState('');const [filter,setFilter]=useState('aguardando');const [search,setSearch]=useState('');const qc=useQueryClient();
 useEffect(()=>{setList(inicial);listRef.current=inicial;},[inicial]);const selected=list.find(c=>c.id===selId);const queue=replyQueue(list);
 const save=async(next:Conversa)=>{const previous=listRef.current.find(c=>c.id===next.id);if(!previous)return;await salvarCaso(previous,next);listRef.current=listRef.current.map(c=>c.id===next.id?next:c);setList(listRef.current);qc.setQueryData(['casos'],listRef.current);await Promise.all([qc.invalidateQueries({queryKey:['clients-directory']}),qc.invalidateQueries({queryKey:['dashboard']}),qc.invalidateQueries({queryKey:['material-approvals']})]);};
 const open=(c:Conversa)=>{setSelId(c.id);if(unread(c))void executar('Marcar conversa como lida',()=>save({...c,lidoAte:new Date().toISOString()}));};
 const visible=(filter==='aguardando'?queue:list).filter(c=>(['aguardando','todos'].includes(filter)||c.etapa===filter)&&matchesConversation(c,search));
 return <div className="grid min-h-[calc(100svh-4rem)] grid-cols-1 lg:h-[calc(100svh-4rem)] lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px] lg:overflow-hidden"><aside className="flex max-h-[40vh] min-h-0 flex-col border-r bg-card lg:max-h-none"><div className="space-y-3 border-b p-3"><h1 className="text-xl font-semibold">Conversas</h1><div className="relative"><Search className="absolute left-2 top-3 size-4 text-muted-foreground"/><Input aria-label="Buscar conversa" className="pl-8" placeholder="Nome, telefone ou CPF" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="flex flex-wrap gap-1">{[['aguardando','Aguardando resposta'],['todos','Todos'],['inicial','Inicial'],['documentos','Documentos'],['ativo','Ativos']].map(([key,label])=><Button key={key} size="sm" variant={filter===key?'secondary':'ghost'} className="h-auto px-2 py-1 text-xs" onClick={()=>setFilter(key??'todos')}>{label} ({key==='aguardando'?queue.length:key==='todos'?list.length:list.filter(c=>c.etapa===key).length})</Button>)}</div></div><ScrollArea className="min-h-0 flex-1">{visible.map(c=>{const minutes=waitingMinutes(c);const tone=waitTone(minutes);return <Button key={c.id} variant="ghost" className={cn('h-auto w-full justify-start gap-2 rounded-none border-b px-3 py-3 text-left',c.id===selId&&'bg-accent')} onClick={()=>open(c)}><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">{iniciais(c.nome)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.nome}</span><span className="block truncate text-xs text-muted-foreground">{c.mensagens.at(-1)?.texto||c.mensagens.at(-1)?.arquivo||'Sem mensagens'}</span><span className="flex flex-wrap gap-2 text-[10px]"><span className={etapaCor[c.etapa]}>{etapaLabel[c.etapa]}</span>{needsReply(c)&&<span className={tone==='primary'?'text-primary':tone==='pending'?'text-pending-foreground':tone==='destructive'?'text-destructive':'text-muted-foreground'}>{minutes===null?'Espera sem data':`${Math.floor(minutes/60)} h ${Math.floor(minutes%60)} min`}</span>}{unread(c)>0&&<span className="text-primary">{unread(c)} não lidas</span>}{c.iaRetida&&<span className="text-pending-foreground">Revisar IA</span>}</span></span></Button>;})}{!visible.length&&<p className="p-4 text-sm text-muted-foreground">Nenhuma conversa neste filtro.</p>}</ScrollArea></aside>{selected?<><Chat key={selected.id} c={selected} save={save} next={()=>{const next=queue.find(c=>c.id!==selected.id);if(next)open(next);else setSelId('');}}/><PainelProJuris c={selected} update={fn=>void executar('Salvar caso',()=>save(fn(selected)))}/></>:<section className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 lg:col-span-1 xl:col-span-2"><h2 className="text-2xl">{queue.length} conversas aguardam resposta</h2>{queue[0]&&<Button onClick={()=>{const c=queue[0];if(c)open(c);}}>Atender {queue[0].nome}<ArrowRight/></Button>}</section>}</div>;
}
function Chat({c,save,next}:{c:Conversa;save:(c:Conversa)=>Promise<void>;next:()=>void}){
 const o=useOffice();const {user}=AuthRoute.useRouteContext();const [text,setText]=useState('');const [action,setAction]=useState<AttendanceAction|null>(null);const [suggestion,setSuggestion]=useState(c.iaRetida??'');const [alerts,setAlerts]=useState<string[]>(c.iaRetida?['Tema proibido']:[]);const [busy,setBusy]=useState(false);const [summary,setSummary]=useState('');const [showQuick,setShowQuick]=useState(false);const [quickIndex,setQuickIndex]=useState(0);const [showMore,setShowMore]=useState(false);const [checklistWarning,setChecklistWarning]=useState(false);const [statusConfirm,setStatusConfirm]=useState(false);const file=useRef<HTMLInputElement>(null);const ai=useServerFn(atendimentoAI);const analyze=useServerFn(analisarDocumento);const lastAI=useRef('');const a=o.state?.automations??defaultAutomations;const mode=c.modoIA??a.modoIA;
 const {data:roles=[]}=useQuery({queryKey:['attendance-roles',user.id],queryFn:async()=>{const r=await supabase.from('user_roles').select('role').eq('user_id',user.id);if(r.error)throw r.error;return r.data.map(r=>r.role);}});const canEdit=roles.some(r=>r==='admin'||r==='advogada_senior');
 const latest=useRef(c);useEffect(()=>{latest.current=c;},[c]);
 const send=async(t:string,automatic=false)=>{if(!t.trim())return;setBusy(true);await executar('Enviar mensagem',async()=>{await n8n.enviarMensagem({conversaId:c.id,texto:t});const current=latest.current;await save({...current,iaRetida:undefined,mensagens:[...current.mensagens,newMessage(t,{autor:automatic?'IA (automático)':undefined})]});setText('');setSuggestion('');setAlerts([]);});setBusy(false);};
 const suggest=async(auto=false)=>{setBusy(true);await executar('Sugerir resposta com IA',async()=>{const r=await ai({data:{casoId:c.id,kind:'resposta'}});setSuggestion(r.texto);setAlerts(r.alertas);if(auto&&r.alertas.length){await save({...latest.current,iaRetida:r.texto});}else if(auto){await send(r.texto,true);}});setBusy(false);};
 useEffect(()=>{const m=c.mensagens.at(-1);if(!o.state||mode==='Desligada'||!m?.dataHora||m.de!=='cliente'||!needsReply(c)||lastAI.current===m.id)return;lastAI.current=m.id;void suggest(mode==='Automática');},[c.mensagens.at(-1)?.id,mode,!!o.state]);
 const step=nextStep(c);const quick=shortcuts.filter(([key])=>key.includes(text.startsWith('/')?text.slice(1).toLowerCase():''));
 const chooseQuick=(key:string,content:string)=>{if(key in actionLabels)setAction(key as AttendanceAction);else setText(content.replaceAll('{nome}',c.nome.split(' ')[0]??c.nome));setShowQuick(false);};
 const signed=async()=>{const now=new Date().toISOString();let current={...latest.current,contrato:'assinado' as const,etapa:'documentos' as const,etapaPipeline:Math.max(c.etapaPipeline,2)};await save(current);const done:string[]=[];if(a.criarPasta){await n8n.criarPastaCliente({clienteId:c.id});done.push('Pasta no Drive');}if(a.pedirDocumentos){const missing=current.documentos.filter(d=>!d.recebido).map(d=>d.nome);await n8n.solicitarDocumentos({conversaId:c.id,documentos:missing});const msg=`Olá, ${c.nome.split(' ')[0]}! Recebemos a assinatura. Envie os documentos pendentes:\n${missing.join('\n')}`;await n8n.enviarMensagem({conversaId:c.id,texto:msg});current={...current,ultimoPedidoDocumentos:now,mensagens:[...current.mensagens,newMessage(msg)]};done.push('Pedido de documentos');}await save({...current,timeline:[...current.timeline,{data:now,evento:`Contrato assinado · ${done.join(' · ')||'Sem automações ligadas'}`}]});toast.info(`Automações: ${done.join(', ')||'nenhuma'} (demonstração)`);setStatusConfirm(false);};
 const upload=async(f:File)=>{setBusy(true);await executar('Guardar anexo',async()=>{if(f.size>10*1024*1024)throw new Error('Envie um arquivo com até 10 MB.');if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(f.type))throw new Error('Envie PDF, JPG, PNG ou WEBP.');const saved=await saveFile(user.id,c.id,f);await n8n.enviarAnexo({conversaId:c.id,nome:f.name});const message=newMessage('',{arquivo:f.name,tipo:f.type.startsWith('image/')?'imagem':'documento',path:saved.path,salvoStart:true});await o.patch(c.id,{arquivos:[...(o.state?.casos[c.id]?.arquivos??[]),{id:message.id,nome:f.name,path:saved.path,hash:saved.hash,mime:f.type,bytes:f.size,revisado:false,contrato:false}]});let current={...latest.current,mensagens:[...latest.current.mensagens,message]};await save(current);if(a.identificarDocumentos){if(o.approvals[c.id]?.checklist){setChecklistWarning(true);return;}const r=await analyze({data:{filename:f.name,mimeType:f.type,base64:await fileBase64(f),checklist:c.documentos.map(d=>d.nome)}});if(!r.ok)throw new Error(r.erro);current={...current,mensagens:current.mensagens.map(m=>m.id===message.id?{...m,tipoIdentificado:r.resultado.tipoDocumento,confirmarTipo:r.resultado.confianca!=='alta'}:m),documentos:current.documentos.map(d=>r.resultado.confianca==='alta'&&d.nome===r.resultado.itemChecklist?{...d,recebido:true}:d)};await save(current);}});setBusy(false);};
 const primary:AttendanceAction[]=c.etapa==='inicial'?['horarios','contrato','cobranca']:c.etapa==='documentos'?['docs','faltantes','provas']:['retorno','provas','cobranca'];
 return <section className="flex min-h-[65vh] min-w-0 flex-col bg-chat-bg lg:min-h-0"><header className="flex flex-wrap items-center gap-2 border-b bg-card p-3"><div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{c.nome}</h2><p className="text-xs text-muted-foreground">{c.telefone} · {c.atendimento}</p></div><Button size="sm" variant="outline" onClick={next}>Próxima<ArrowRight/></Button><Automations o={o} canEdit={canEdit}/><Select value={mode} onValueChange={v=>executar('Salvar modo da IA',()=>save({...c,modoIA:v as AIMode}))}><SelectTrigger aria-label="Modo da IA" className="w-36"><SelectValue/></SelectTrigger><SelectContent>{['Desligada','Sugerir','Automática'].map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></header><PipelineSync caseId={c.id} stage={c.etapaPipeline} syncs={c.syncs} onSync={async(i,s)=>{const syncs=[...c.syncs];syncs[i]=s;await save({...c,syncs});}}/><section className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary px-3 py-2"><div className="min-w-0"><p className="text-xs font-semibold">Próximo passo · {step.title}</p><p className="text-xs text-muted-foreground">{step.reason}</p></div>{step.action==='producao'?<Button asChild size="sm" variant="outline"><Link to="/producao" search={{caseId:c.id}}>Produção</Link></Button>:step.action&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(step.action==='ia')void suggest();else if(step.action==='revisar'){setText(c.iaRetida??'');setSuggestion(c.iaRetida??'');}else setAction(step.action as AttendanceAction);}}>{step.title}</Button>}</section><ScrollArea className="min-h-0 flex-1"><div className="space-y-3 p-3"><section className="border-b pb-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Resumo da IA</h3><Button size="sm" variant="ghost" disabled={busy} onClick={()=>executar('Resumir conversa',async()=>{const r=await ai({data:{casoId:c.id,kind:'resumo'}});setSummary(r.texto);})}><Sparkles/>Atualizar</Button></div><p className="text-xs text-muted-foreground">{summary||`${c.nome} · ${etapaLabel[c.etapa]} · ${c.documentos.filter(d=>!d.recebido).length} documentos pendentes · ${waitingMinutes(c)===null?'Espera sem data registrada':`aguarda desde ${c.mensagens.at(-1)?.dataHora}`}`}</p></section>{c.mensagens.map(m=><div key={m.id} className={cn('flex',m.de==='escritorio'?'justify-end':'justify-start')}><div className={cn('max-w-[85%] break-words rounded-md px-3 py-2 text-sm',m.de==='escritorio'?'bg-bubble-out':'bg-bubble-in')}><p className="whitespace-pre-wrap">{m.texto}</p>{m.arquivo&&<p className="flex items-center gap-2"><FileText className="size-4"/>{m.arquivo}</p>}{m.tipoIdentificado&&<p className="mt-1 text-xs text-primary">{m.tipoIdentificado}</p>}{m.confirmarTipo&&<p className="mt-1 text-xs text-pending-foreground">[CONFIRMAR TIPO DE DOCUMENTO]</p>}{m.salvoStart&&<p className="text-[10px] text-muted-foreground">Salvo na pasta Start</p>}<p className="mt-1 text-right text-[10px] text-muted-foreground">{m.autor} {m.dataHora?new Date(m.dataHora).toLocaleString('pt-BR'):m.hora}</p></div></div>)}<section className="border-t pt-3"><h3 className="text-xs font-semibold">Automações programadas</h3>{programmed(c,a).map(j=><p key={j.key} className="mt-1 text-xs text-muted-foreground">{j.title} · {new Date(j.when).toLocaleString('pt-BR')} · demonstração</p>)}{!programmed(c,a).length&&<p className="text-xs text-muted-foreground">Nenhum lembrete programado.</p>}</section></div></ScrollArea>{suggestion&&<section className="m-3 border-l-4 border-primary bg-secondary p-3"><h3 className="mb-2 text-xs font-semibold">Sugestão da IA</h3><Textarea aria-label="Sugestão da IA" value={suggestion} onChange={e=>setSuggestion(e.target.value)}/>{alerts.length>0&&<p className="mt-2 bg-pending p-2 text-xs text-pending-foreground">[ATENÇÃO] {alerts.join(', ')}</p>}<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>send(suggestion)}>{alerts.length?'Enviar mesmo assim':'Enviar'}</Button><Button size="sm" variant="outline" onClick={()=>{setText(suggestion);setSuggestion('');}}>Editar antes de enviar</Button><Button size="icon" variant="ghost" aria-label="Descartar sugestão" onClick={()=>setSuggestion('')}><X/></Button></div></section>}<div className="border-t bg-card p-3"><div className="mb-2 flex flex-wrap gap-2">{(showMore?Object.keys(actionLabels) as AttendanceAction[]:primary).map(k=><Button key={k} size="sm" variant="secondary" disabled={busy||(k==='retorno'&&c.etapa!=='ativo')} title={k==='retorno'&&c.etapa!=='ativo'?'Disponível para cliente ativo':undefined} onClick={()=>setAction(k)}>{actionLabels[k]}</Button>)}<Button size="sm" variant="ghost" onClick={()=>setShowMore(v=>!v)}>Mais ações</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>suggest()}><Sparkles/>Sugerir com IA</Button>{c.contrato&&c.contrato!=='assinado'&&<Button size="sm" variant="outline" onClick={()=>setStatusConfirm(true)}>Atualizar status</Button>}</div>{showQuick&&<div className="mb-2 max-h-40 overflow-y-auto border">{quick.map(([key,content],i)=><Button key={key} variant={i===quickIndex?'secondary':'ghost'} className="h-8 w-full justify-start rounded-none" onClick={()=>chooseQuick(key,content)}>/{key}</Button>)}</div>}<div className="flex items-end gap-1"><input ref={file} type="file" aria-label="Anexo do atendimento" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/><Button size="icon" variant="ghost" title="Anexar arquivo" aria-label="Anexar arquivo" disabled={busy} onClick={()=>file.current?.click()}><Paperclip/></Button><Button size="icon" variant="ghost" title="Enviar imagem" aria-label="Enviar imagem" disabled={busy} onClick={()=>file.current?.click()}><ImageIcon/></Button><span title="Em breve"><Button size="icon" variant="ghost" disabled aria-label="Áudio — Em breve"><Mic/></Button></span><Button size="icon" variant="ghost" title="Respostas rápidas" aria-label="Respostas rápidas" onClick={()=>{setShowQuick(v=>!v);setQuickIndex(0);}}><Zap/></Button><Textarea aria-label="Mensagem" value={text} onChange={e=>{setText(e.target.value);setShowQuick(e.target.value.startsWith('/'));setQuickIndex(0);}} onKeyDown={e=>{if(showQuick&&e.key==='ArrowDown'){e.preventDefault();setQuickIndex(i=>(i+1)%Math.max(1,quick.length));}else if(showQuick&&e.key==='ArrowUp'){e.preventDefault();setQuickIndex(i=>(i+quick.length-1)%Math.max(1,quick.length));}else if(e.key==='Escape')setShowQuick(false);else if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const item=quick[quickIndex];if(showQuick&&item)chooseQuick(item[0],item[1]);else void send(text);}} placeholder="Digite uma mensagem" className="min-h-10 flex-1"/><Button size="icon" aria-label="Enviar mensagem" disabled={busy||!text.trim()} onClick={()=>send(text)}>{busy?<Loader2 className="animate-spin"/>:<Send/>}</Button></div></div><AttendanceActions c={c} action={action} setAction={setAction} save={save}/><Dialog open={statusConfirm} onOpenChange={setStatusConfirm}><DialogContent><DialogHeader><DialogTitle>Atualizar status do contrato</DialogTitle></DialogHeader><p className="text-sm">Confirme o status conferido. Alterações nos dados do caso podem exigir nova aprovação jurídica.</p><DialogFooter><Button onClick={()=>executar('Atualizar contrato',async()=>{if(c.contrato==='enviado'){await save({...c,contrato:'visualizado'});setStatusConfirm(false);}else await signed();})}>{c.contrato==='enviado'?'Marcar visualizado':'Confirmar assinado'}</Button></DialogFooter></DialogContent></Dialog><Dialog open={checklistWarning} onOpenChange={setChecklistWarning}><DialogContent><DialogHeader><DialogTitle>Checklist já aprovado</DialogTitle></DialogHeader><p>A alteração dos documentos invalida a aprovação jurídica. O original foi guardado; confira o arquivo na Produção antes de alterar o checklist.</p><Button onClick={()=>setChecklistWarning(false)}>Entendi</Button></DialogContent></Dialog></section>;
}
function PainelProJuris({ c, update }: { c: Conversa; update: (fn: (c: Conversa) => Conversa) => void }) {
  const recebidos = c.documentos.filter((d) => d.recebido).length;
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l bg-card">
      <div className="border-b p-3"><h2 className="section-title text-lg">ProJuris</h2></div>
      <Tabs defaultValue="cliente" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-4">
          <TabsTrigger value="cliente">Cliente</TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="consulta">Consulta</TabsTrigger>
          <TabsTrigger value="tempo">Histórico</TabsTrigger>
        </TabsList>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="cliente" className="space-y-4 p-3">
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Nome</dt><dd className="font-medium">{c.nome}</dd>
              <dt className="text-muted-foreground">CPF</dt><dd>{c.cpf}</dd>
              <dt className="text-muted-foreground">Telefone</dt><dd>{c.telefone}</dd>
              <dt className="text-muted-foreground">Atendimento</dt><dd>{c.atendimento}</dd>
              <dt className="text-muted-foreground">Contrato</dt><dd><StatusContrato s={c.contrato} /></dd>
            </dl>
            <a href="#" onClick={(e) => { e.preventDefault(); toast.info("Abriria a pasta no Google Drive (demonstração)"); }} className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-accent">
              <FolderOpen className="size-4 text-primary" /><span className="truncate">{c.nome} – {c.atendimento} › Start</span>
            </a>
            <div>
              <h3 className="mb-2 text-base font-semibold">Processos ({c.processos.length})</h3>
              {c.processos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum processo vinculado ainda.</p>}
              {c.processos.map((p) => (
                <div key={p.cnj} className="mb-2 rounded-lg border-l-4 border-primary bg-secondary p-2.5 text-sm">
                  <p className="font-mono text-xs font-semibold">{p.cnj}</p>
                  <p className="text-xs text-muted-foreground">{p.vara}</p>
                  <p className="mt-1">{p.status}</p>
                  <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px]", p.homologado ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}>{p.homologado ? "Homologado" : "Não homologado"}</span>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="docs" className="p-3">
            <p className="mb-2 text-sm text-muted-foreground">{recebidos} de {c.documentos.length} recebidos</p>
            <div className="mb-3 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(recebidos / c.documentos.length) * 100}%` }} /></div>
            <ul className="space-y-1.5">
              {c.documentos.map((d) => (
                <li key={d.nome} className="flex items-center gap-2 text-sm">
                  {d.recebido ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-destructive" />}
                  <span className={cn(!d.recebido && "rounded bg-pending px-1 text-pending-foreground")}>{d.nome}</span>
                </li>
              ))}
            </ul>
            <AnaliseDocumento key={c.id} c={c} update={update} />
          </TabsContent>
          <TabsContent value="consulta" className="space-y-3 p-3">
            {c.consulta ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border p-2">
                  <Button size="icon" variant="secondary"><Play /></Button>
                  <div className="h-1.5 flex-1 rounded bg-muted"><div className="h-1.5 w-1/3 rounded bg-primary" /></div>
                  <span className="text-xs text-muted-foreground">{c.consulta.duracao}</span>
                </div>
                <div><h3 className="section-title mb-1 text-sm">Sumarização</h3><p className="text-sm">{c.consulta.resumo}</p></div>
                <div><h3 className="section-title mb-1 text-sm">Transcrição</h3><p className="whitespace-pre-wrap font-doc text-sm">{c.consulta.transcricao}</p></div>
              </>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">Consulta ainda não registrada. Se foi feita fora da plataforma, envie os arquivos:</p>
                <Button variant="outline" className="w-full" onClick={() => toast.success("Transcrição enviada (demonstração)")}><Upload />Enviar transcrição</Button>
                <Button variant="outline" className="w-full" onClick={() => toast.success("Sumarização enviada (demonstração)")}><Upload />Enviar sumarização</Button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="tempo" className="p-3">
            <ol className="relative ml-2 border-l-2 border-primary/40">
              {c.timeline.map((t) => (
                <li key={t.data + t.evento} className="mb-3 ml-4">
                  <span className="absolute -left-[7px] mt-1 size-3 rounded-full bg-primary" />
                  <p className="text-xs text-muted-foreground">{t.data}</p><p className="text-sm">{t.evento}</p>
                </li>
              ))}
            </ol>

          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}

function StatusContrato({ s }: { s?: Conversa["contrato"] }) {
  if (!s) return <span className="text-muted-foreground">Não gerado</span>;
  const steps = ["gerado", "enviado", "visualizado", "assinado"] as const;
  const idx = steps.indexOf(s);
  return (
    <div className="flex gap-1">
      {steps.map((x, i) => <span key={x} className={cn("rounded px-1 text-[10px]", i <= idx ? (x === "assinado" ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground") : "bg-muted text-muted-foreground")}>{x}</span>)}
    </div>
  );
}
