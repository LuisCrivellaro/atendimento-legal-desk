import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { processarAna } from '@/lib/atendimento/ana.server';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';
import { SAUDACAO_RETORNO_ANA } from '@/lib/atendimento/ana-retomada';
const mocks=vi.hoisted(()=>({gerar:vi.fn(),cancelar:vi.fn(),remarcar:vi.fn(),reservar:vi.fn(),ocupados:vi.fn(),enviar:vi.fn()}));
vi.mock('@/lib/atendimento/ana-relacionamento.server',()=>({reconhecerRelacionamentoAna:async()=>({identidade:{tipo:'nao_encontrado'},rel:{situacao:'novo_lead',consultaInicial:true,quantidadeProcessos:0},nome:''})}));
vi.mock('@/lib/atendimento/ana.functions',()=>({gerarRespostaAna:mocks.gerar}));
vi.mock('@/lib/atendimento/google-calendar.server',()=>({cancelarGoogleCalendar:mocks.cancelar,remarcarGoogleCalendar:mocks.remarcar,reservarGoogleCalendar:mocks.reservar,ocupadosGoogleCalendar:mocks.ocupados}));
vi.mock('@/lib/atendimento/projuris-agenda.server',()=>({cancelarAgenda:(_d:unknown,_o:unknown,...a:unknown[])=>(mocks.cancelar as (...x:unknown[])=>unknown)(...a),remarcarAgenda:(_d:unknown,_o:unknown,...a:unknown[])=>(mocks.remarcar as (...x:unknown[])=>unknown)(...a),reservarAgenda:(_d:unknown,_o:unknown,...a:unknown[])=>(mocks.reservar as (...x:unknown[])=>unknown)(...a),ocupadosAgenda:(_d:unknown,_o:unknown,...a:unknown[])=>(mocks.ocupados as (...x:unknown[])=>unknown)(...a)}));
vi.mock('@/lib/atendimento/envio.functions',()=>({enviarMensagemSistema:mocks.enviar}));
afterEach(()=>vi.useRealTimers());
function setup(canal:'telegram'|'ultramsg',marcada=true){
 vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T08:00:00Z'));
 const fixture=conversas[0];if(!fixture)throw new Error('Fixture missing');
 const telefone='5511999600306',contato=canal==='telegram'?'839854097':telefone;
 const reserva={id:'evento-cliente',inicio:'2026-10-28T12:00:00.000Z',fim:'2026-10-28T12:30:00.000Z'};
 let saved:Conversa={...fixture,modoIA:'Automática',tipoClienteAgenda:'novo',consultaAgendada:marcada?reserva.inicio:undefined,mensagens:[],timeline:[],agenteAna:{apresentado:true,agendaReal:true,horariosTeste:[],dados:{nome:'Maria Silva',email:'',cpf:'',assunto:''},reservaCalendar:marcada?reserva:undefined}};
 const audit=vi.fn().mockResolvedValue({error:null});
 const db={from(table:string){let patch:{dados:Conversa}|undefined;let updating=false;
  const result=()=>{if(table==='casos'){if(patch)saved=patch.dados;return {error:null,data:updating?[{id:fixture.id}]:{owner_id:'owner',dados:saved,updated_at:'revision'}};}return {error:null,data:table==='checklist_itens'?[]:table==='office_workspace'?{dados:defaultState}:table==='atendimento_canal_config'?{agente_ativo:true,canal_ativo:canal,modo_teste:true}:{contato_externo:contato,telefone_ficticio:telefone,status:'liberado'}};};
  const query={select:()=>query,eq:()=>query,update:(value:{dados:Conversa})=>{patch=value;updating=true;return query;},single:async()=>result(),maybeSingle:async()=>result(),then:(resolve:(value:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};return query;},rpc:audit};
 mocks.gerar.mockResolvedValue({acao:'enviar',mensagem:'Vou conferir.',intencao:'agendamento',encaminhar_humano:false,motivo_aprovacao:'',urgente:false,dados_coletados:{nome:'',cpf:'',email:'',assunto:''},proximo_passo:''});
 mocks.ocupados.mockResolvedValue([]);mocks.cancelar.mockResolvedValue('cancelado');mocks.enviar.mockResolvedValue({simulado:false,idExterno:'envio'});
 let n=0;
 return {get saved(){return saved;},reserva,audit,patch(fn:(c:Conversa)=>Conversa){saved=fn(saved);},async message(texto:string){const messageId=`${canal}:${contato}:${++n}`;saved={...saved,mensagens:[...saved.mensagens,{id:messageId,de:'cliente',canal,texto,hora:'08:00',dataHora:new Date().toISOString()}]};await processarAna(db as unknown as SupabaseClient<Database>,fixture.id,messageId,new Request('http://localhost:8080'));}};
}
describe.each(['telegram','ultramsg'] as const)('consentimento de agenda pelo %s',canal=>{
 it('pedido e sim cancelam apenas o recibo desta conversa e limpam consulta com auditoria',async()=>{const h=setup(canal);await h.message('quero cancelar');expect(mocks.cancelar).not.toHaveBeenCalled();expect(h.saved.agenteAna?.confirmacaoCancelamento?.eventoId).toBe(h.reserva.id);await h.message('sim');expect(mocks.cancelar).toHaveBeenCalledWith(h.saved.id,h.reserva,true);expect(h.saved.consultaAgendada).toBeUndefined();expect(h.saved.agenteAna?.reservaCalendar).toBeUndefined();expect(h.saved.agenteAna?.confirmacaoCancelamento).toBeUndefined();expect(h.saved.timeline).toHaveLength(1);expect(h.audit).toHaveBeenCalledWith('registrar_audit_log',expect.objectContaining({p_acao:'cancelarCalendar',p_status:'sucesso'}));});
 it('não vou manter preserva o evento e retira autorização de cancelamento',async()=>{const h=setup(canal);await h.message('quero cancelar');await h.message('não, vou manter');expect(mocks.cancelar).not.toHaveBeenCalled();expect(h.saved.consultaAgendada).toBe(h.reserva.inicio);expect(h.saved.agenteAna?.confirmacaoCancelamento).toBeUndefined();await h.message('sim');expect(mocks.cancelar).not.toHaveBeenCalled();});
 it('falha Google preserva consulta e registra encaminhamento humano',async()=>{const h=setup(canal);await h.message('quero cancelar');mocks.cancelar.mockRejectedValueOnce(new Error('Agenda indisponível'));await h.message('sim');expect(h.saved.consultaAgendada).toBe(h.reserva.inicio);expect(h.saved.agenteAna?.reservaCalendar).toEqual(h.reserva);expect(h.saved.agenteAna?.humano).toBe(true);expect(h.saved.agenteAna?.operacaoConsulta).toBeUndefined();expect(h.audit).toHaveBeenCalledWith('registrar_audit_log',expect.objectContaining({p_acao:'cancelarCalendar',p_status:'erro'}));});
 it('sem consulta não chama Google',async()=>{const h=setup(canal,false);await h.message('quero cancelar');expect(mocks.cancelar).not.toHaveBeenCalled();expect(mocks.ocupados).not.toHaveBeenCalled();expect(h.saved.agenteAna?.confirmacaoCancelamento).toBeUndefined();});
 it('consentimento vencido não apaga evento',async()=>{const h=setup(canal);await h.message('quero cancelar');vi.setSystemTime(new Date('2026-10-27T11:31:00Z'));await h.message('sim');expect(mocks.cancelar).not.toHaveBeenCalled();expect(h.saved.consultaAgendada).toBe(h.reserva.inicio);});
 it('pergunta não enviada não autoriza confirmação',async()=>{const h=setup(canal);mocks.enviar.mockRejectedValueOnce(new Error('Envio indisponível'));await h.message('quero cancelar');expect(h.saved.agenteAna?.confirmacaoCancelamento).toBeUndefined();h.patch(c=>({...c,agenteAna:{...c.agenteAna,humano:false,pausa:false}}));await h.message('sim');expect(mocks.cancelar).not.toHaveBeenCalled();});
 it('remarcar oferece horários distintos do atual e usa novo recibo após escolha',async()=>{const h=setup(canal);await h.message('quero remarcar');const slots=h.saved.agenteAna?.horariosTeste??[];expect(slots).toHaveLength(2);expect(slots).not.toContain(h.reserva.inicio);expect(h.saved.agenteAna?.autorizacaoRemarcacao?.eventoId).toBe(h.reserva.id);const novo=slots[0];if(!novo)throw new Error('Missing offer');mocks.remarcar.mockResolvedValue({id:'novo-evento',inicio:novo,fim:new Date(Date.parse(novo)+30*60000).toISOString()});await h.message('a primeira');expect(mocks.remarcar).toHaveBeenCalledWith(h.saved.id,h.reserva,novo,true,expect.any(Date),{nome:'Maria Silva',telefone:'5511999600306',tipo:'novo'});expect(h.saved.consultaAgendada).toBe(novo);expect(h.saved.agenteAna?.reservaCalendar?.id).toBe('novo-evento');});
 it('frustração consulta novamente sem repetir nenhuma oferta e sem encaminhamento delicado',async()=>{const h=setup(canal,false);await h.message('quero agendar');const first=h.saved.agenteAna?.horariosTeste??[];await h.message('mas você me deu os mesmos horários!');const second=h.saved.agenteAna?.horariosTeste??[];expect(second).toHaveLength(2);expect(second.every(s=>!first.includes(s))).toBe(true);expect(h.saved.agenteAna?.humano).toBe(false);expect(h.saved.agenteAna?.motivo).toBe('');expect(mocks.ocupados).toHaveBeenCalledTimes(2);});
});describe('primeira lista depois de pedir o nome',()=>{
 it('não guarda horários nunca mostrados e a primeira lista usa o texto inicial com os primeiros horários livres',async()=>{
  const h=setup('telegram',false);
  h.patch(c=>({...c,agenteAna:{...c.agenteAna,dados:{nome:'',email:'',cpf:'',assunto:''},horariosTeste:[],agendaReal:false}}));
  await h.message('quero marcar uma consulta');
  expect(mocks.enviar.mock.calls.at(-1)?.[0]?.texto).toBe('Qual é seu nome completo?');
  expect(h.saved.agenteAna?.horariosTeste??[]).toEqual([]);
  mocks.gerar.mockResolvedValue({acao:'enviar',mensagem:'Obrigada!',intencao:'agendamento',encaminhar_humano:false,motivo_aprovacao:'',urgente:false,dados_coletados:{nome:'Mariana Souza Lima',cpf:'',email:'',assunto:''},proximo_passo:''});
  await h.message('Mariana Souza Lima');
  const texto=String(mocks.enviar.mock.calls.at(-1)?.[0]?.texto??'');
  expect(mocks.ocupados).not.toHaveBeenCalled();
  expect(h.saved.agenteAna?.horariosTeste??[]).toEqual([]);
  expect(h.saved.agenteAna?.dados?.nome).toBe('Mariana Souza Lima');
 });
 it('horários fictícios salvos antes da correção não contam como já oferecidos',async()=>{
  const h=setup('telegram',false);
  h.patch(c=>({...c,agenteAna:{...c.agenteAna,horariosTeste:['2026-10-28T12:00:00.000Z','2026-10-28T12:30:00.000Z','2026-10-28T13:00:00.000Z'],agendaReal:false}}));
  await h.message('quero agendar');
  const texto=String(mocks.enviar.mock.calls.at(-1)?.[0]?.texto??'');
  expect(texto.startsWith('Tenho estes horários livres na agenda:')).toBe(true);
  expect(h.saved.agenteAna?.horariosTeste?.[0]).toBe('2026-10-27T12:00:00.000Z');
 });
});


describe('Primeiro contato completo',()=>{
 it('consulta antes de enviar, guarda nome sem nova consulta e reserva a opção original',async()=>{
  const h=setup('ultramsg',false);
  h.patch(c=>({...c,etapa:'inicial',agenteAna:{apresentado:false,dados:{nome:'',cpf:'',email:'',assunto:''}}}));
  await h.message('oi');
  const offered=h.saved.agenteAna?.horariosTeste??[];
  expect(offered).toHaveLength(2);
  expect(mocks.ocupados.mock.invocationCallOrder[0]).toBeLessThan(mocks.enviar.mock.invocationCallOrder[0]??0);
  await h.message('Mariana Souza Lima');
  expect(mocks.ocupados).toHaveBeenCalledOnce();
  expect(h.saved.agenteAna?.horariosTeste).toEqual(offered);
  expect(h.saved.agenteAna?.dados?.nome).toBe('Mariana Souza Lima');
  const selected=offered[1];if(!selected)throw new Error('Sem segunda opção');
  mocks.reservar.mockResolvedValueOnce({id:'recibo',inicio:selected,fim:new Date(Date.parse(selected)+1800000).toISOString()});
  await h.message('2');
  expect(mocks.reservar).toHaveBeenCalledWith(h.saved.id,selected,expect.any(Date),{nome:'Mariana Souza Lima',telefone:'5511999600306',tipo:'novo'});
  expect(h.saved.consultaAgendada).toBe(selected);
 });
 it('ProJuris fora do ar: Anne atende mesmo assim com saudação e horários',async()=>{
  const h=setup('ultramsg',false);h.patch(c=>({...c,etapa:'inicial',agenteAna:{apresentado:false}}));
  mocks.ocupados.mockResolvedValueOnce(null);await h.message('oi');
  expect(mocks.enviar).toHaveBeenCalledTimes(1);expect(h.saved.agenteAna?.humano).not.toBe(true);
 });
 it('horário ocupado busca novas opções sem confirmar nem repetir reserva',async()=>{
  const h=setup('ultramsg',false);await h.message('quero agendar');
  const offered=h.saved.agenteAna?.horariosTeste??[];
  mocks.reservar.mockRejectedValueOnce(new Error('Esse horário acabou de ficar ocupado. Escolha outro horário.'));
  await h.message('1');
  expect(mocks.reservar).toHaveBeenCalledOnce();expect(h.saved.consultaAgendada).toBeUndefined();
  expect(h.saved.agenteAna?.horariosTeste?.every(s=>!offered.includes(s))).toBe(true);
  expect(h.saved.agenteAna?.humano).toBe(false);
 });
});

describe('retomada de identificados',()=>{
 it('outro dia preserva nome, mensagens e consulta, sem consultar ou oferecer agenda',async()=>{
  const h=setup('ultramsg');
  h.patch(c=>({...c,mensagens:[{id:'old',de:'escritorio',canal:'ultramsg',hora:'08:00',dataHora:'2026-10-26T11:00:00Z',texto:'Consulta confirmada.'}]}));
  await h.message('bom dia');
  expect(mocks.ocupados).not.toHaveBeenCalled();expect(mocks.reservar).not.toHaveBeenCalled();
  expect(h.saved.agenteAna?.dados?.nome).toBe('Maria Silva');expect(h.saved.consultaAgendada).toBe(h.reserva.inicio);
  expect(h.saved.mensagens.map(m=>m.id)).toContain('old');expect(h.saved.mensagens.at(-1)?.texto).toBe('Olá! Como posso ajudar com seu atendimento?');
  await h.message('oi');expect(h.saved.mensagens.filter(m=>m.texto===SAUDACAO_RETORNO_ANA)).toHaveLength(0);
 });
 it('pedido de cancelamento no retorno mantém pergunta e exige confirmação posterior',async()=>{
  const h=setup('ultramsg');h.patch(c=>({...c,mensagens:[{id:'old',de:'escritorio',canal:'ultramsg',hora:'08:00',dataHora:'2026-10-26T11:00:00Z',texto:'Consulta confirmada.'}]}));
  await h.message('quero cancelar');expect(mocks.cancelar).not.toHaveBeenCalled();
  expect(h.saved.agenteAna?.confirmacaoCancelamento?.eventoId).toBe(h.reserva.id);
  expect(h.saved.mensagens.at(-1)?.texto.startsWith(SAUDACAO_RETORNO_ANA)).toBe(false);
  await h.message('sim');expect(mocks.cancelar).toHaveBeenCalledOnce();
 });
 it('modo sugerir e pausa humana não enviam saudação',async()=>{
  const h=setup('ultramsg');h.patch(c=>({...c,modoIA:'Sugerir',mensagens:[{id:'old',de:'escritorio',canal:'ultramsg',hora:'08:00',dataHora:'2026-10-26T11:00:00Z',texto:'Anterior'}]}));
  await h.message('oi');expect(mocks.enviar).not.toHaveBeenCalled();
  h.patch(c=>({...c,modoIA:'Automática',agenteAna:{...c.agenteAna,humano:true}}));await h.message('oi');expect(mocks.enviar).not.toHaveBeenCalled();
 });
});

 describe('recuperação de geração e intervenção humana',()=>{
 it('falha temporária gera nova tentativa persistente sem assumir atendimento humano',async()=>{const h=setup('ultramsg',false);mocks.gerar.mockRejectedValueOnce(Object.assign(new Error('Indisponível'),{retryable:true}));await h.message('quero agendar');expect(h.saved.mensagens.at(-1)?.iaExecucao?.estado).toBe('aguardando');expect(h.saved.agenteAna?.humano).not.toBe(true);expect(mocks.enviar).not.toHaveBeenCalled();});
 it('equipe assume durante geração e bloqueia resposta',async()=>{const h=setup('ultramsg',false);mocks.gerar.mockImplementationOnce(async()=>{h.patch(c=>({...c,agenteAna:{...c.agenteAna,humano:true,controleHumanoEm:'assumido'}}));return {acao:'enviar',mensagem:'Olá',intencao:'duvida_geral',encaminhar_humano:false,motivo_aprovacao:'',urgente:false,dados_coletados:{nome:'',cpf:'',email:'',assunto:''},proximo_passo:''};});await h.message('oi');expect(mocks.enviar).not.toHaveBeenCalled();expect(h.saved.agenteAna?.humano).toBe(true);});
});


describe('Paulo — continuidade no servidor real com portas controladas',()=>{
 it('nome não reoferta e cobrança persiste tarefa antes do envio; equipe pausa Anne',async()=>{
  const h=setup('ultramsg',false);
  h.patch(c=>({...c,agenteAna:{apresentado:true,agendaReal:true,horariosTeste:['2026-10-28T12:00:00Z'],dados:{nome:'',cpf:'',email:'',assunto:''}},mensagens:[{id:'assunto',de:'cliente',canal:'ultramsg',texto:'Aguardo conferência dos documentos que enviei',hora:''},{id:'promessa',de:'escritorio',canal:'ultramsg',texto:'Vou verificar com a doutora e dar um retorno',hora:''},...Array.from({length:30},(_,i)=>({id:`old${i}`,de:'cliente' as const,canal:'ultramsg',texto:'ok',hora:''})),{id:'boas',de:'escritorio',canal:'ultramsg',texto:'Olá, Seja bem vindo. Horários apresentados.',hora:''}]}));
  await h.message('Bom dia. É o Paulo.');
  expect(h.saved.agenteAna?.dados?.nome).toBe('Paulo');expect(mocks.ocupados).not.toHaveBeenCalled();expect(h.saved.agenteAna?.horariosTeste).toEqual(['2026-10-28T12:00:00Z']);
  expect(mocks.gerar.mock.calls[0]?.[1].historico.some((m:{id:string})=>m.id==='promessa')).toBe(true);
  mocks.enviar.mockImplementationOnce(async()=>{expect(h.saved.tarefasRetorno).toHaveLength(1);return {simulado:false,idExterno:'retorno-enviado'};});
  await h.message('Você ficou de me dar um retorno.');
  expect(h.saved.tarefasRetorno?.[0]).toMatchObject({responsavelId:'owner',assunto:'Aguardo conferência dos documentos que enviei',status:'pendente'});
  expect(h.saved.agenteAna?.humano).toBe(true);expect(mocks.reservar).not.toHaveBeenCalled();
  const count=mocks.enviar.mock.calls.length;await h.message('Estou aguardando.');expect(mocks.enviar).toHaveBeenCalledTimes(count);expect(h.saved.tarefasRetorno).toHaveLength(1);
 });
 it('primeira cobrança não inicia boas-vindas ou consulta de agenda',async()=>{const h=setup('ultramsg',false);h.patch(c=>({...c,agenteAna:{apresentado:false},mensagens:[]}));await h.message('Bom dia. Alguma novidade?');expect(mocks.ocupados).not.toHaveBeenCalled();expect(mocks.gerar).not.toHaveBeenCalled();expect(h.saved.tarefasRetorno).toHaveLength(1);expect(h.saved.agenteAna?.humano).toBe(true);});
});
