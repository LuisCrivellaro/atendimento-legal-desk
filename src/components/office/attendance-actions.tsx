import { useEffect, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { n8n } from '@/services/integracoes';
import { executar } from '@/lib/executar';
import { statusDoEnvio, validOffer, validReturn, chosenSlot, newMessage, formatarHorarioCliente, mensagemHorariosCliente, validContractLink, registrarContratoEnviado, mensagemPermitida, type FreeSlot } from '@/lib/atendimento';
import { horarioPermitido, DURACAO_RETORNO } from '@/lib/atendimento/schedule-rules';
import { horariosLivresEquipe, reservarHorarioEquipe } from '@/lib/atendimento/agenda-equipe.functions';
import { linkContratoDemonstracao } from '@/lib/atendimento/coleta';
import type { Conversa } from '@/lib/mock-data';
export type AttendanceAction='horarios'|'docs'|'faltantes'|'contrato'|'cobranca'|'retorno'|'provas'|'video'|'confirmar'|'lembrete'|'registrarContrato';
export const actionLabels:Record<AttendanceAction,string>={horarios:'Enviar horários',docs:'Solicitar documentos base',faltantes:'Pedir faltantes',contrato:'Enviar contrato (link do ProJuris)',cobranca:'Gerar cobrança',retorno:'Agendar retorno',provas:'Lista de provas',video:'Iniciar videochamada',confirmar:'Confirmar consulta',lembrete:'Lembrar assinatura',registrarContrato:'Registrar contrato enviado'};

/** Link do Meet só do recibo real da consulta atual, e só HTTPS devolvido pelo Google. */
/** Acrescenta itens novos ao checklist sem duplicar nem desmarcar os existentes. */
export function comItensChecklist(docs:Conversa['documentos'],itens:string[]){const fold=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();const novos=[...new Map(itens.filter(n=>!docs.some(d=>fold(d.nome)===fold(n))).map(n=>[fold(n),n])).values()];return [...docs,...novos.map(nome=>({nome,recebido:false}))];}
export function linkMeetDaReserva(c:Pick<Conversa,'agenteAna'|'consultaAgendada'>){const r=c.agenteAna?.reservaCalendar;return r&&r.inicio===c.consultaAgendada&&r.meetUrl&&/^https:\/\//.test(r.meetUrl)?r.meetUrl:undefined;}
/** Motivo de uma ação estar indisponível (botão desabilitado sempre diz por quê). */
export function motivoIndisponivel(c:Conversa,action:AttendanceAction):string|undefined{
 if(action==='cobranca')return 'Mercado Pago não configurado: a cobrança não é gerada pelo sistema.';
 if(action==='video'&&!linkMeetDaReserva(c))return 'Sem link do Meet no recibo da consulta: o Google não devolveu link para esta reserva.';
 if(action==='confirmar'&&!chosenSlot(c.horariosOfertados??[],c.mensagens.at(-1)?.texto??''))return 'O cliente ainda não escolheu um dos horários oferecidos.';
 if(action==='lembrete'&&!c.contratoLink)return 'Registre o link do contrato antes.';
 if(action==='lembrete'&&linkContratoDemonstracao(c.contratoLink))return 'O link gravado é de demonstração (fluxo antigo): registre o link real do contrato antes.';
 return undefined;
}

export function AttendanceActions({c,action,setAction,save}:{c:Conversa;action:AttendanceAction|null;setAction:(a:AttendanceAction|null)=>void;save:(next:Conversa)=>Promise<void>}){
 const [link,setLink]=useState('');const [text,setText]=useState('');const [slots,setSlots]=useState<FreeSlot[]>([]);const [carregando,setCarregando]=useState(false);const [aviso,setAviso]=useState('');const [selected,setSelected]=useState<string[]>([]);const [docs,setDocs]=useState<string[]>([]);const [itensProvas,setItensProvas]=useState('');const [busy,setBusy]=useState(false);
 const horariosFn=useServerFn(horariosLivresEquipe);const reservarFn=useServerFn(reservarHorarioEquipe);const qc=useQueryClient();
 const carteira=(c.tipoClienteAgenda??c.agenteAna?.tipoCliente)==='cadastrado'?'cadastrado' as const:'novo' as const;
 const meet=linkMeetDaReserva(c);const indisponivel=action?motivoIndisponivel(c,action):undefined;
 useEffect(()=>{if(!action)return;setLink(action==='contrato'?'':c.contratoLink??'');setItensProvas('');setSlots([]);setSelected([]);setAviso('');const names=c.documentos.filter(d=>action!=='faltantes'||!d.recebido).map(d=>d.nome);setDocs(names);const name=c.nome.split(' ')[0];const texts:Partial<Record<AttendanceAction,string>>={docs:`Olá, ${name}! Envie os documentos indicados abaixo.`,faltantes:`Olá, ${name}! Ainda precisamos dos documentos pendentes indicados abaixo.`,contrato:`${name}, segue o contrato para sua conferência e assinatura: {link}`,provas:`${name}, envie as provas e documentos listados no checklist do seu caso.`,video:`${name}, segue o link para nossa videochamada: {link}. A chamada será gravada e transcrita.`,confirmar:`${name}, sua consulta está confirmada. A chamada será gravada e transcrita.`,lembrete:`${name}, o contrato ainda aguarda assinatura: ${c.contratoLink??''}`,retorno:`${name}, seu retorno com a Dra. Carolina está agendado:`,horarios:`Olá, ${name}! Temos os horários abaixo disponíveis. Qual fica melhor para você?`};setText(texts[action]??'');
  if(action==='horarios'||action==='retorno'){setCarregando(true);void executar('Consultar horários livres',async()=>{const r=await horariosFn({data:{casoId:c.id,tipo:action==='retorno'?'cadastrado':carteira}});const livres=r.slots.map(iso=>({iso,label:formatarHorarioCliente(iso),ocupado:false}));setSlots(livres);setAviso(r.aviso??'');setSelected(action==='horarios'?livres.slice(0,3).map(s=>s.iso):[]);}).finally(()=>setCarregando(false));}},[action,c.id]);
 const chosen=slots.filter(s=>selected.includes(s.iso));const confirmTime=chosenSlot(c.horariosOfertados??[],c.mensagens.at(-1)?.texto??'');
 const comLink=(t:string,l:string)=>t.includes('{link}')?t.replace('{link}',l):`${t}\n${l}`;
 const novosItensProvas=itensProvas.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,40);
 const valid=!indisponivel&&(action==='registrarContrato'?validContractLink(link):Boolean(action&&text.trim()&&mensagemPermitida(text)&&(action!=='horarios'||validOffer(chosen,carteira==='cadastrado'))&&(action!=='retorno'||selected.length===1&&validReturn(selected[0]??'',DURACAO_RETORNO))&&(action!=='contrato'||validContractLink(link))&&(action!=='confirmar'||confirmTime&&horarioPermitido(confirmTime,carteira))));
 const previa=action==='contrato'?comLink(text,link.trim()||'{link}'):action==='video'&&meet?comLink(text,meet):text;
 const send=async()=>{if(!action||!valid)return;const kind=action;setBusy(true);await executar(actionLabels[kind],async()=>{
  if(kind==='registrarContrato'){await save(registrarContratoEnviado(c,link));setAction(null);return;}
  // Reserva real feita no servidor (recibo + aviso ao cliente); a tela só recarrega.
  if(kind==='retorno'||kind==='confirmar'){const inicio=kind==='retorno'?selected[0]??'':confirmTime??'';const r=await reservarFn({data:{casoId:c.id,inicio,finalidade:kind==='retorno'?'retorno':'consulta',texto:text}});await qc.invalidateQueries({queryKey:['casos']});if(r.avisoEnviado)toast.success(`Reservado na agenda do ProJuris para ${formatarHorarioCliente(r.inicio)}; cliente avisado.`);else toast.warning(`Reservado para ${formatarHorarioCliente(r.inicio)}, mas o aviso ao cliente não foi confirmado. Revise e envie manualmente.`);setAction(null);return;}
  let message=text;const now=new Date().toISOString();let patch:Partial<Conversa>={};switch(kind){
  case 'horarios':{const labels=chosen.map(s=>s.iso);patch={horariosOfertados:labels};message+='\n'+mensagemHorariosCliente(chosen);break;}
  case 'contrato':message=comLink(text,link.trim());break;
  case 'video':if(!meet)throw new Error('Sem link do Meet no recibo da consulta.');patch={videoLink:meet};message=comLink(text,meet);if(!/gravada.*transcrita/i.test(message))message+='\nA chamada será gravada e transcrita.';break;
  case 'docs':patch={ultimoPedidoDocumentos:now};message+='\n'+docs.map(d=>`• ${d}`).join('\n');break;
  case 'faltantes':patch={ultimoPedidoDocumentos:now};message+='\n'+docs.map(d=>`• ${d}`).join('\n');break;
  case 'provas':if(novosItensProvas.length)message+='\n'+novosItensProvas.map(n=>`• ${n}`).join('\n');break;
  case 'lembrete':break;
  }if(!mensagemPermitida(message))throw new Error('Registre o link do contrato antes de enviar.');const enviado=kind==='horarios'?await n8n.enviarHorarios({conversaId:c.id,texto:message,horarios:chosen.map(s=>s.iso)}):await n8n.enviarMensagem({conversaId:c.id,texto:message});
  let next:Conversa={...c,...patch,mensagens:[...c.mensagens,newMessage(message,{status:statusDoEnvio(enviado),canal:enviado.canal,idExterno:'idExterno' in enviado?enviado.idExterno:undefined})],timeline:[...c.timeline,{data:now,evento:actionLabels[kind]}]};
  // Contrato só vira "enviado" com envio real pelo canal; simulado continua pendente.
  if(kind==='contrato'){if(enviado.simulado)toast.warning('Canal desligado: a mensagem não saiu e o contrato continua pendente.');else next=registrarContratoEnviado(next,link.trim(),now);}
  // Lista de provas: depois do envio real os itens entram no checklist e a Anne passa a acompanhá-los.
  if(kind==='provas'&&novosItensProvas.length){if(enviado.simulado)toast.warning('Canal desligado: a lista não saiu e o checklist não foi alterado.');else next={...next,documentos:comItensChecklist(next.documentos,novosItensProvas),ultimoPedidoDocumentos:now};}
  await save(next);setAction(null);});setBusy(false);};
 return <Dialog open={!!action} onOpenChange={v=>{if(!v&&!busy)setAction(null);}}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{action? actionLabels[action]:''}</DialogTitle></DialogHeader>
  {indisponivel&&<p role="status" className="rounded-lg border border-pending-border bg-pending px-3 py-2 text-xs text-pending-foreground">{action==='cobranca'?'Não configurado · ':''}{indisponivel}</p>}
  {(action==='horarios'||action==='retorno')&&<><div className="grid gap-2 sm:grid-cols-3">{slots.map(s=><Button key={s.iso} variant={selected.includes(s.iso)?'secondary':'outline'} className="h-auto whitespace-normal p-2 text-xs" disabled={busy} onClick={()=>setSelected(p=>action==='retorno'?[s.iso]:p.includes(s.iso)?p.filter(x=>x!==s.iso):[...p,s.iso])}>{formatarHorarioCliente(s.iso)}</Button>)}</div>{carregando&&<p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Consultando a agenda do ProJuris…</p>}{!carregando&&aviso&&<p role="status" className="text-[13px] text-pending-foreground">{aviso}</p>}{action==='retorno'?<><Select value={String(DURACAO_RETORNO)} onValueChange={()=>undefined}><SelectTrigger aria-label="Duração do retorno"><SelectValue/></SelectTrigger><SelectContent><SelectItem value={String(DURACAO_RETORNO)}>{DURACAO_RETORNO} minutos</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Retorno de cliente da casa: sextas, 13h30 às 17h30. A reserva é feita na agenda do ProJuris ao confirmar.</p></>:<p className="text-xs text-muted-foreground">2 a 3 opções · horários livres da agenda do ProJuris · reuniões de 30 minutos</p>}</>}
  {['docs','faltantes'].includes(action??'')&&<div className="space-y-2">{c.documentos.filter(d=>action!=='faltantes'||!d.recebido).map(d=><label key={d.nome} className="flex items-center gap-2 text-sm"><Checkbox checked={docs.includes(d.nome)} onCheckedChange={v=>setDocs(p=>v?[...p,d.nome]:p.filter(n=>n!==d.nome))}/>{d.nome}</label>)}</div>}
  {action==='provas'&&<label className="block text-sm font-medium">Itens da lista de provas (um por linha)<Textarea aria-label="Itens da lista de provas" value={itensProvas} onChange={e=>setItensProvas(e.target.value)} className="mt-1.5 min-h-20 font-normal"/><span className="mt-1 block text-xs text-muted-foreground">Depois do envio real, os itens entram no checklist e a Anne passa a acompanhá-los.</span></label>}
  {action==='contrato'&&<p className="text-[13px] text-muted-foreground">ZapSign não configurado: gere o contrato e a declaração no ProJuris, cole aqui o link de assinatura e envie. O contrato só fica "enviado" depois do envio real pelo WhatsApp.</p>}
  {action==='confirmar'&&confirmTime&&<p className="text-[13px]">Horário escolhido pelo cliente: <b>{formatarHorarioCliente(confirmTime)}</b>. Ao confirmar, a reserva é feita na agenda do ProJuris e o horário e o link do Meet (se gerado) entram no fim da mensagem.</p>}
  {(action==='registrarContrato'||action==='contrato')&&<label className="block text-sm font-medium">Link do contrato<Input aria-label="Link do contrato" type="url" placeholder="https://" value={link} onChange={e=>setLink(e.target.value)} disabled={busy} className="mt-1.5 font-normal"/></label>}
  {action!=='registrarContrato'&&action!=='cobranca'&&<><label className="block text-sm font-medium">Mensagem<Textarea aria-label="Mensagem da ação" value={text} onChange={e=>setText(e.target.value)} className="mt-1.5 min-h-28 font-normal"/></label><section className="rounded-lg border bg-surface-subtle p-3"><h3 className="mb-1.5 text-2xs font-semibold text-muted-foreground">Prévia</h3><p className="whitespace-pre-wrap text-sm">{previa}</p>{chosen.map(s=><p key={s.iso} className="text-sm">{formatarHorarioCliente(s.iso)}</p>)}{(action==='retorno'||action==='confirmar')&&<p className="text-xs text-muted-foreground">+ data e horário reservados e, se o Google devolver, o link do Meet.</p>}</section></>}
  <DialogFooter><Button disabled={!valid||busy} title={indisponivel} onClick={send}>{busy?<Loader2 className="animate-spin"/>:<Send/>}{action==='registrarContrato'?'Salvar contrato':action==='retorno'||action==='confirmar'?'Reservar e avisar o cliente':'Confirmar e enviar'}</Button></DialogFooter></DialogContent></Dialog>;
}
