import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { defaultState, type OfficeState } from '../office';
import { defaultAutomations, newMessage, chosenSlot, formatarHorarioCliente } from '../atendimento';
import { escolherReservaAna } from './calendar-booking';
import { aplicarRegrasAna, expedienteAna, mensagemSemResposta, aceitarRespostaAna, respostaAgendaTeste, priorizarAgendamentoAna, saudacaoClienteNovo, pediuNomeInicialAna, nomePrimeiroContatoAna, nomeParaHorarioPendenteAna, saudacaoInicialAna, linhaDoisHorariosAna, PERGUNTA_HORARIO_ANA, PEDIDO_NOME_AGENDA_ANA, resumoTransbordoAna } from './ana-rules';
import { classificarAgenda, etiquetaConversa, identificarTipoCliente } from './intake-rules';
import { telefoneRemetenteAna } from './telegram-intake';
import { horarioPermitido } from './schedule-rules';
import { decidirAlteracaoConsulta, decidirCancelamentoAna, operacaoExpirada } from './appointment-management';
import { solicitarEmailPendente } from './email-rules';
import { lembreteAtivo, respostaLembreteAna } from './lembrete-consulta';
import { confirmacao40Respondivel, registrarRespostaConfirmacao40, respostaConfirmacao40 } from './confirmacao-consulta';
import { emColeta, perguntaAvaliacaoDocumento, respostaDocumentoColeta } from './coleta';
import { encerramentoRespondivel, respostaEncerramento } from './acompanhamento';
import { textosColeta } from '../respostas-prontas';
import { hora } from './ana-scheduling';
import { pedidoInformacoesConsultaAna, aceiteConsultaAna } from './ana-rules';
import { gatilhoLandingInternacional, passoFunil, MSG_BOAS_VINDAS, REGRAS_REAGENDAMENTO } from './funil-internacional';
import { bloqueiaAgenda, pedidoHumano, escolherHorarioAna, pedidoHorarioEspecifico, horarioEspecificoLivre, selecionarOpcoesAna, linhaHorarioAna, listaHorariosAna, pedidoOutrasOpcoesAna, frustracaoHorariosAna, temPreferenciaAna, horizonteAgendaAna, limitarNomeAna, mensagemConfirmacaoAna } from './ana-scheduling';
import { apenasInsistencia, TEXTOS_CONSULTA } from './consulta-processo';
import { retornoIdentificadoAna, pedidoAgendaRetornoAna, mensagemRetornoAna } from './ana-retomada';
import { podeExecutarAna } from './ana-execution';
import { contextoPersistente, nomeConhecido, apresentacaoNome, atendimentoIniciado, cobraRetorno, registrarRetorno, resultadoRetorno, semReintroducao } from './ana-contexto';
import { permiteAgendaRelacionamento, protegerRelacionamentoAna } from './ana-relacionamento';
import { reconhecerRelacionamentoAna } from './ana-relacionamento.server';
// Secretaria digital: só age com a flag da área de trabalho ligada (padrão desligado = fluxo idêntico ao anterior).
import { configDoEstado, contextoSecretaria, portasSupabase, secretariaLigada } from './secretaria/secretaria.server';
import { aplicarModo, modoEfetivo, retornoAutomaticoDevido } from './secretaria/modos';
import { ultimaIntervencaoHumana } from './secretaria/origem';
import { encaminharInjecao, encerrarAutomacaoRespondida, reterRespostaNaoVerificada, tratarMensagemOperacional } from './secretaria/operacional';
import { dadosNaoVerificados, fontesDaConversa, possivelInjecao } from './secretaria/seguranca';
import { memoriaEstruturada, REGRAS_MEMORIA } from './secretaria/memoria';
import { classificarMensagemComercial, contextoFiltroComercial, registrarFiltroComercial } from './filtro-comercial';
import { lerBiblioteca, renderizarOficial } from './biblioteca/renderizar';
import { marcaModelo, pedidoRedeSocial, periodoForaExpediente, saudacaoPrimeiroAtendimento, textoAgendamentoConfirmado, textoForaDoHorario } from './biblioteca/selecao';
type Db=SupabaseClient<Database>;

async function assumirAlteracao(db:Db,id:string,messageId:string,eventoId:string,tipo:'cancelar'|'remarcar') {
  let claimed=false;
  await atualizarConversa(db,id,x=>{
    claimed=false;
    if((x.agenteAna?.operacaoConsulta&&!operacaoExpirada(x.agenteAna.operacaoConsulta))||x.agenteAna?.reservaCalendar?.id!==eventoId||x.mensagens.at(-1)?.id!==messageId||x.agenteAna?.humano||x.agenteAna?.pausa)return x;
    claimed=true;
    return {...x,agenteAna:{...x.agenteAna,operacaoConsulta:{mensagemId:messageId,eventoId,tipo,desde:new Date().toISOString()}}};
  });
  if(!claimed)throw new Error('Alteração já em andamento ou consulta alterada; conferir antes de repetir.');
}

/** CAS: não substitui mensagens ou edições recebidas durante a geração. */
export async function atualizarConversa(db:Db,id:string,fn:(c:Conversa)=>Conversa) {
  for(let attempt=0;attempt<5;attempt++) {
    const row=await db.from('casos').select('dados,updated_at').eq('id',id).single();
    if(row.error)throw new Error('Conversa indisponível.');
    const next=fn(row.data.dados as unknown as Conversa);
    const result=await db.from('casos').update({dados:JSON.parse(JSON.stringify(next)) as Json,updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',row.data.updated_at).select('id');
    if(result.error)throw new Error('Não foi possível salvar o atendimento.');
    if(result.data?.length)return next;
  }
  throw new Error('Conversa alterada simultaneamente; confira o atendimento.');
}

export async function processarAna(db:Db,id:string,messageId:string,request:Request) {
  const canal = messageId.startsWith('telegram:') ? 'telegram' as const : 'ultramsg' as const;
  const [row,config,remetente]=await Promise.all([db.from('casos').select('owner_id,dados').eq('id',id).single(),db.from('atendimento_canal_config').select('*').eq('id',true).single(),db.from('atendimento_contatos_teste').select('contato_externo,telefone_ficticio').eq('conversa_id',id).eq('canal',canal).eq('status','liberado').maybeSingle()]);
  if(row.error||config.error||!config.data.agente_ativo||config.data.canal_ativo!==canal)return;
  const telefone=telefoneRemetenteAna(canal,remetente.data??undefined,messageId);
  if(remetente.error||!telefone)return;
  const c=row.data.dados as unknown as Conversa;
  const ws=await db.from('office_workspace').select('dados').eq('owner_id',row.data.owner_id).maybeSingle();
  if(ws.error)throw new Error('Treinamento indisponível.');
  const state=(ws.data?.dados as unknown as OfficeState)??defaultState;
  const mode=c.modoIA??state.automations?.modoIA??defaultAutomations.modoIA;
  const retomada=retornoIdentificadoAna(c,messageId,canal);
  const m=c.mensagens.find(m=>m.id===messageId);
  // Regra obrigatória: áudios/mensagens de voz (audio, ptt) ficam sem resposta da Anne.
  if(m?.tipo==='audio')return;
  // Secretaria digital ligada: fora do Automático só a camada operacional age (respostas dentro de automações
  // ativas no Híbrido); Humano e Bloqueado não enviam nada. A regra de volta ao Automático é opcional e desligada.
  const secretaria=canal==='ultramsg'&&secretariaLigada(state);
  const modoPadrao=state.automations?.modoIA??defaultAutomations.modoIA;
  if(secretaria&&m&&podeExecutarAna(m)){
    if(retornoAutomaticoDevido(c,configDoEstado(state),modoPadrao,ultimaIntervencaoHumana(c))){
      await atualizarConversa(db,id,x=>retornoAutomaticoDevido(x,configDoEstado(state),modoPadrao,ultimaIntervencaoHumana(x))?aplicarModo(x,'automatico',{tipo:'sistema',autor:'regra'},new Date(),'regra configurada de volta ao Automático'):x);
      return processarAna(db,id,messageId,request);
    }
    if(modoEfetivo(c,modoPadrao).modo!=='automatico'){
      const ctx=await contextoSecretaria(db,id,canal);
      await tratarMensagemOperacional(portasSupabase(db,row.data.owner_id,id),ctx,id,messageId);
      return;
    }
  }
  if(!m||!podeExecutarAna(m)||c.agenteAna?.humano||c.agenteAna?.pausa||state.anaPausa?.ativa)return;
  let claimed=false;
  await atualizarConversa(db,id,current=>{
    claimed=false;
    const target=current.mensagens.find(m=>m.id===messageId);
    if(!target||!podeExecutarAna(target)||current.mensagens.at(-1)?.id!==messageId||current.agenteAna?.humano||current.agenteAna?.pausa)return current;
    claimed=true;
    return {...current,mensagens:current.mensagens.map(m=>m.id===messageId?{...m,iaProcessada:true,iaExecucao:{estado:'executando' as const,tentativas:(m.iaExecucao?.tentativas??0)+1,desde:new Date().toISOString()}}:m)};
  });
  if(!claimed)return;
  let efeitosIniciados=false;
  const marcarEfeito=()=>atualizarConversa(db,id,x=>({...x,mensagens:x.mensagens.map(m=>m.id===messageId&&m.iaExecucao?{...m,iaExecucao:{...m.iaExecucao,estado:'enviando' as const}}:m)}));
  try {
  if(mode==='Automática'&&canal==='ultramsg'&&c.agenteAna?.pedidosProcesso?.some(p=>p.status==='pendente'&&!p.evento)&&apenasInsistencia(m.texto)) {
    efeitosIniciados=true;
    await marcarEfeito();
    const { enviarAvisoProcesso } = await import('./consulta-processo.server');
    await enviarAvisoProcesso(db,id,TEXTOS_CONSULTA.emConferencia,remetente.data?.contato_externo??'');
    return;
  }
  // Funil de consulta paga Brasil–Portugal: só a partir das mensagens da landing page.
  if(canal==='ultramsg'&&mode==='Automática'&&(c.funilInternacional?c.funilInternacional.etapa!=='pago':gatilhoLandingInternacional(m.texto)&&!c.mensagens.some(x=>x.de!=='cliente'))){
    const funil=c.funilInternacional;
    const passo=funil?passoFunil(funil,m.texto,!!m.arquivo):{mensagem:MSG_BOAS_VINDAS,funil:{etapa:'nome' as const,inicio:new Date().toISOString()}};
    if(!passo)return;
    efeitosIniciados=true;
    await marcarEfeito();
    const {enviarMensagemSistema}=await import('./envio.functions');
    const sent=await enviarMensagemSistema({supabase:db,conversaId:id,texto:passo.mensagem,motivo:'ana-funil-internacional',contatoEsperado:remetente.data?.contato_externo??'',mensagemOrigem:messageId,controleHumanoEm:c.agenteAna?.controleHumanoEm});
    await atualizarConversa(db,id,x=>({...x,funilInternacional:passo.funil,...(passo.funil.etapa==='conferencia'&&x.funilInternacional?.etapa!=='conferencia'?{timeline:[...x.timeline,{data:new Date().toISOString(),evento:'Funil internacional: comprovante recebido — conferir e clicar em PIX Confirmado.'}]}:{}),agenteAna:{...x.agenteAna,apresentado:true,...(passo.nome?{dados:{...(x.agenteAna?.dados??{nome:'',cpf:'',assunto:'',email:''}),nome:passo.nome}}:{})} as NonNullable<typeof x.agenteAna>,mensagens:[...x.mensagens,newMessage(passo.mensagem,{autor:'Ana · assistente virtual',canal,idExterno:sent.idExterno,respostaAnaDe:messageId,status:'enviada'})]}));
    return;
  }
  // "ok" em resposta à confirmação de 40 min registra presença; fora disso, continua sem resposta.
  if(mensagemSemResposta(m.texto,!!m.arquivo)&&!(confirmacao40Respondivel(c,canal)&&respostaConfirmacao40(m.texto)))return;
  // Filtro comercial (sem modelo): propaganda, curso, assinatura, prospecção ou robô de outra empresa não recebe
  // resposta nem inicia atendimento; fica no histórico marcada. Na dúvida, a equipe confere em silêncio.
  const filtro=classificarMensagemComercial(m.texto,contextoFiltroComercial(c,messageId));
  if(filtro.resultado!=='atender'){
    await atualizarConversa(db,id,x=>registrarFiltroComercial(x,messageId,filtro));
    await db.rpc('registrar_audit_log',{p_ator:'Anne',p_perfil:'sistema',p_acao:'filtroComercial',p_resumo:`${filtro.resultado==='comercial'?'Comunicação comercial ignorada':'Possível comunicação comercial enviada à equipe'} · ${filtro.sinaisComerciais.slice(0,2).join(', ')}`,p_status:'bloqueado'});
    return;
  }
  // Instruções dirigidas à IA no texto do cliente: sem chamada ao modelo; a equipe assume (Híbrido) e é avisada.
  if(secretaria&&possivelInjecao(m.texto)){
    await atualizarConversa(db,id,x=>encaminharInjecao(x,messageId,modoPadrao));
    await db.rpc('registrar_audit_log',{p_ator:'Anne',p_perfil:'sistema',p_acao:'secretariaInjecao',p_resumo:'Mensagem com instruções para a IA passada à equipe sem resposta automática',p_status:'bloqueado'});
    return;
  }
  // Biblioteca oficial: textos determinísticos, enviados pela camada central (sem modelo, sem reescrita).
  const biblioteca=lerBiblioteca((state as {bibliotecaMensagens?:unknown}).bibliotecaMensagens);
  const responderOficial=async(sel:{texto:string;modelo:{id:string;versao:number}},extra:(x:Conversa)=>Conversa=x=>x)=>{
    efeitosIniciados=true;
    await marcarEfeito();
    const {enviarMensagemSistema}=await import('./envio.functions');
    const sent=await enviarMensagemSistema({supabase:db,conversaId:id,texto:sel.texto,motivo:'ana',contatoEsperado:remetente.data?.contato_externo??'',mensagemOrigem:messageId,controleHumanoEm:c.agenteAna?.controleHumanoEm});
    if(sent.simulado)throw new Error('Canal desligado; resposta não enviada.');
    await atualizarConversa(db,id,x=>extra({...x,agenteAna:{...x.agenteAna,envioAna:undefined},mensagens:[...x.mensagens.map(y=>y.id===messageId&&y.iaExecucao?{...y,iaExecucao:{...y.iaExecucao,estado:'concluida' as const}}:y),newMessage(sel.texto,{autor:'Ana · assistente virtual',canal,idExterno:sent.idExterno,respostaAnaDe:messageId,status:'enviada',modeloOficial:sel.modelo})]}));
    await db.rpc('registrar_audit_log',{p_ator:'Anne',p_perfil:'sistema',p_acao:'mensagemOficial',p_resumo:`Modelo ${sel.modelo.id} v${sel.modelo.versao}`,p_status:'sucesso'});
  };
  // Pedido do Instagram/LinkedIn da doutora (modelos 10.1/10.2): link oficial, sem chamar o modelo.
  const social=mode==='Automática'&&canal==='ultramsg'?pedidoRedeSocial(m.texto):undefined;
  if(social){
    const oficial=renderizarOficial(social,{},{biblioteca});
    if(oficial.ok){await responderOficial({texto:oficial.texto,modelo:{id:oficial.id,versao:oficial.versao}});return;}
  }
  let modeloUsado:{id:string;versao:number}|undefined;
    const {gerarRespostaAna}=await import('./ana.functions');
    // Histórico exclusivamente deste contato/canal; nunca material jurídico do caso demonstrativo.
    const memoria=contextoPersistente(c,canal);
    const history=memoria.historico;
    const cobranca=cobraRetorno(m.texto);
    const etiqueta=etiquetaConversa(c);
    const lista=await db.from('checklist_itens').select('nome,recebido').eq('caso_id',id).eq('owner_id',row.data.owner_id);
    if(lista.error)throw new Error('Checklist indisponível.');
    const email=c.email||c.agenteAna?.dados?.email||'';
    const reconhecimento=await reconhecerRelacionamentoAna(db,row.data.owner_id,c,telefone,canal);
    const localIdentidade=reconhecimento.rel.situacao==='ativo'&&reconhecimento.identidade.tipo==='unico'?reconhecimento.identidade:reconhecimento.identidade.tipo==='duplicado'?reconhecimento.identidade:undefined;
    const rel=reconhecimento.rel;
    // Cliente ativo fora do expediente (modelo 03), só com a automação "Resposta fora do horário" ligada:
    // uma vez por período fora do expediente; nesse período a equipe responde (sem resposta gerada pelo modelo).
    if(mode==='Automática'&&canal==='ultramsg'&&state.automations?.foraHorario===true&&rel.situacao==='ativo'&&periodoForaExpediente()){
      const fora=textoForaDoHorario(c.agenteAna?.foraHorarioAvisado,new Date(),biblioteca);
      if(fora&&fora.id!=='anterior')await responderOficial({texto:fora.texto,modelo:{id:fora.id,versao:fora.versao??1}},x=>({...x,agenteAna:{...x.agenteAna,foraHorarioAvisado:fora.periodo}}));
      else await atualizarConversa(db,id,x=>({...x,mensagens:x.mensagens.map(y=>y.id===messageId&&y.iaExecucao?{...y,iaExecucao:{...y.iaExecucao,estado:'concluida' as const}}:y)}));
      return;
    }
    // Pergunta de encerramento (S3): "sim" explícito pede horários de retorno (sexta, cliente da casa).
    const enc=encerramentoRespondivel(c,canal)?respostaEncerramento(m.texto):undefined;
    const permiteAgenda=permiteAgendaRelacionamento(rel,m.texto,c)||enc==='sim';
    // Vínculo ativo vem do cadastro (base local sincronizada), nunca do histórico da conversa.
    const classificacao=classificarAgenda({persistida:c.tipoClienteAgenda,local:localIdentidade,autodeclaracao:identificarTipoCliente(m.texto),contexto:c.agenteAna?.tipoCliente,padraoLead:c.etapa==='inicial'});
    // Funil internacional pago: os horários ofertados após o PIX valem como cliente novo (seg–qui).
    const tipoCliente=enc==='sim'?'cadastrado' as const:c.funilInternacional?.etapa==='pago'?'novo' as const:rel.situacao==='ativo'||rel.situacao==='em_atendimento'?'cadastrado':classificacao.tipo;
    const clienteLocal=reconhecimento.nome?{nome:reconhecimento.nome,telefone,email}:undefined;
    const identidade=nomeConhecido(c,canal,clienteLocal?.nome??'');
    const introducao=apresentacaoNome(m.texto);
    const gerada=cobranca?resultadoRetorno(c,canal):await gerarRespostaAna(request,{relacionamento:rel,continuidade:memoria.continuidade,checklist:lista.data,email_cadastrado:email,solicitar_email:c.etapa==='documentos'&&solicitarEmailPendente(lista.data,email),data_hora_atual:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),dentro_expediente:expedienteAna(),tipo_cliente_agenda:tipoCliente??'desconhecido; perguntar',area_origem:etiqueta,telefone_informado:telefone??'',regras_agenda:'30 minutos; novo segunda a quinta 09:00–17:30; cadastrado sexta 13:30–17:30; sem feriados; sem CPF',modo_ia:mode,vendedor_ativo:state.automations?.vendedor??false,cliente:{...(c.agenteAna?.dados??{}),nome:identidade,...(clienteLocal?{telefone:clienteLocal.telefone,email:clienteLocal.email}:{})},apresentado:atendimentoIniciado(c,canal,messageId),consulta_info:!rel.consultaInicial?{tipo:"acompanhamento",reserva_confirmada:c.consultaAgendada??null}:c.agenteAna?.reservaCalendar?{online:true,gratuita:true,duracao_minutos:30,reserva_confirmada:c.agenteAna.reservaCalendar.inicio}:{online:true,gratuita:true,duracao_minutos:30},horarios_oferecidos:permiteAgenda?c.agenteAna?.horariosTeste??[]:[],temas_proibidos_extra:state.training.proibidos,historico:history,ultima_mensagem:{texto:m.texto,arquivo:m.arquivo??''},exemplos:state.training.exemplos,...(secretaria?{memoria_estruturada:memoriaEstruturada(c,{checklist:lista.data}).resumo,regras_memoria:REGRAS_MEMORIA}:{})},state.training.instrucoes);
    const respostaAnterior=c.mensagens.filter(x=>x.canal===canal&&x.de==='escritorio').at(-1)?.texto??'';
    const aceiteCaptacao=rel.consultaInicial&&aceiteConsultaAna(m.texto,respostaAnterior);
    const raw=rel.consultaInicial?priorizarAgendamentoAna(gerada,m.texto,!retomada&&c.agenteAna?.resultado?.intencao==='agendamento'&&!c.consultaAgendada,respostaAnterior):{...gerada};
    raw.dados_coletados.nome=identidade||introducao||raw.dados_coletados.nome;
    if(!rel.consultaInicial&&(m.arquivo||['video','imagem','documento'].includes(m.tipo??''))){raw.intencao='documento';}
    if(cobranca){raw.intencao='outro';raw.encaminhar_humano=true;}
    if(retomada){
      raw.dados_coletados.nome=identidade||introducao||raw.dados_coletados.nome;
      if(!pedidoAgendaRetornoAna(m.texto)&&raw.intencao==='agendamento')raw.intencao='duvida_geral';
    }
    // Cadastro do e-mail só usa texto validado do cliente, nunca suposição do modelo.
    raw.dados_coletados.email=email;
    if(enc==='sim'){raw.intencao='agendamento';raw.encaminhar_humano=false;}
    const consentCancel=c.agenteAna?.confirmacaoCancelamento;
    const pendenteCancel=!!consentCancel&&consentCancel.eventoId===c.agenteAna?.reservaCalendar?.id&&consentCancel.inicio===c.consultaAgendada&&consentCancel.contato===telefone&&Date.parse(consentCancel.expira)>Date.now();
    // Confirmação de 40 min (última mensagem do escritório): "ok" registra presença; "não" nunca cancela a partir desta mensagem.
    const ativa40=confirmacao40Respondivel(c,canal);
    const resposta40=ativa40?respostaConfirmacao40(m.texto):undefined;
    // Resposta ao lembrete das 8h: SIM mantém; NÃO cancela (consentimento gravado após o envio do lembrete) e oferece 2 novos horários.
    const respostaLembrete=!ativa40&&lembreteAtivo(c.agenteAna?.lembreteConsulta,c.consultaAgendada)?respostaLembreteAna(m.texto):undefined;
    const confirmouLembrete=respostaLembrete==='sim'||resposta40==='sim';
    const cancelouLembrete=respostaLembrete==='nao'&&pendenteCancel;
    const decisaoCancel=cancelouLembrete?'confirmar' as const:confirmouLembrete?undefined:decidirCancelamentoAna(m.texto,pendenteCancel&&!ativa40);
    if(resposta40==='nao'&&!pedidoHumano(m.texto)){raw.intencao='agendamento';raw.encaminhar_humano=false;}
    const alteracao=decisaoCancel==='confirmar'?'cancelar':decisaoCancel==='remarcar'?'remarcar':decisaoCancel==='pedir'||decisaoCancel==='manter'?'perguntar':decidirAlteracaoConsulta(m.texto,!!c.consultaAgendada,c.agenteAna?.alteracaoConsulta);
    const semConsulta=decisaoCancel==='pedir'&&!c.consultaAgendada;
    if(decisaoCancel&&!pedidoHumano(m.texto)){raw.intencao='agendamento';raw.encaminhar_humano=false;}
    if(alteracao||c.agenteAna?.alteracaoConsulta==='remarcar')raw.intencao='agendamento';
    const primeiroContato=rel.consultaInicial&&!pedidoInformacoesConsultaAna(m.texto)&&!cobranca&&!retomada&&!identidade&&!atendimentoIniciado(c,canal,messageId)&&tipoCliente==='novo'&&!c.consultaAgendada&&mode==='Automática'&&!pedidoHumano(m.texto)&&!raw.urgente;
    if(primeiroContato){raw.intencao='agendamento';raw.encaminhar_humano=false;}
    let bloqueada=!permiteAgenda||cobranca||!primeiroContato&&bloqueiaAgenda(m.texto,raw.intencao)||pedidoHumano(m.texto);
    if(!bloqueada&&(escolherHorarioAna(c.agenteAna?.horariosTeste??[],m.texto)??chosenSlot(c.agenteAna?.horariosTeste??[],m.texto)))raw.intencao='agendamento';
    const teste=config.data.modo_teste===true;
    const previous=c.mensagens.filter(m=>m.canal===canal&&m.de==='escritorio').at(-1)?.texto??'';
    // Resposta direta à saudação oficial ("Qual o seu nome?"): texto curto só com letras vale como nome.
    // Horário já escolhido aguardando o nome: vale mesmo se outra mensagem entrou no meio ou se passou mais
    // tempo; a reserva revalida a disponibilidade antes de confirmar.
    // Escolha anterior perdida (ex.: não reconhecida na hora): recupera da última mensagem do cliente após a oferta.
    const clienteAnterior=c.mensagens.filter(x=>x.canal===canal&&x.de==='cliente'&&x.id!==messageId).at(-1)?.texto??'';
    const recuperado=!c.agenteAna?.horarioPendente&&/nome completo/i.test(previous)?escolherHorarioAna(c.agenteAna?.horariosTeste??[],clienteAnterior):undefined;
    const pendenteSalvo=c.agenteAna?.horarioPendente??recuperado;
    const aguardaNome=!!pendenteSalvo&&Date.parse(pendenteSalvo)>Date.now();
    const respostaNome=introducao||nomePrimeiroContatoAna(m.texto,previous)||(aguardaNome?nomeParaHorarioPendenteAna(m.texto):'');
    if(respostaNome&&!raw.dados_coletados.nome.trim()){raw.dados_coletados.nome=respostaNome;}
    // Com escolha pendente, o nome recebido conclui o agendamento: nunca transferir para a equipe nesse passo.
    if(permiteAgenda&&!cobranca&&!retomada&&respostaNome&&aguardaNome&&!pedidoHumano(m.texto)){raw.intencao='agendamento';raw.encaminhar_humano=false;bloqueada=false;}
    const nome=raw.dados_coletados.nome.trim()||c.agenteAna?.dados?.nome||'';
    let horarios=(c.agenteAna?.horariosTeste??[]).filter(s=>tipoCliente&&horarioPermitido(s,tipoCliente)&&Date.parse(s)>Date.now());
    let agendaReal=c.agenteAna?.agendaReal===true&&horarios.length>0;
    // Horário já escolhido aguardando o nome completo: o nome recebido autoriza reservar esse horário (revalidado na reserva).
    const pendenteNome=!!respostaNome&&aguardaNome;
    const recebeuNome=!pendenteNome&&!!respostaNome&&!cobranca&&!pedidoAgendaRetornoAna(m.texto);
    if(recebeuNome){raw.intencao='duvida_geral';raw.encaminhar_humano=false;bloqueada=true;}
    const oferecidos=c.agenteAna?.horariosTeste??[];
    // Só horários da agenda real contam como já oferecidos; fictícios salvos antes da correção nunca foram mostrados.
    const historicoHorarios=[...new Set([...(c.agenteAna?.horariosApresentados??[]),...(c.agenteAna?.agendaReal===true?oferecidos:[]),...(c.horariosOfertados??[]),...(c.consultaAgendada?[c.consultaAgendada]:[])])];
    const outras=pedidoOutrasOpcoesAna(m.texto)||decisaoCancel==='remarcar';
    const repetida=(c.agenteAna?.listasHorarios??0)>0||historicoHorarios.length>0;
    const pedidosOutras=(c.agenteAna?.pedidosOutrasOpcoes??0)+(outras&&!temPreferenciaAna(m.texto)?1:0);
    const aceitouPendente=!!c.agenteAna?.horarioPendente&&!!c.agenteAna.horarioPendenteDesde&&Date.now()-Date.parse(c.agenteAna.horarioPendenteDesde)<30*60000&&/^(?:sim|pode|pode marcar|sim pode|sim por favor|confirmo|confirmar)[.!\s]*$/i.test(m.texto.trim());
    const especifico=!bloqueada?pedidoHorarioEspecifico(m.texto):undefined;
    // Uma pergunta de disponibilidade nunca autoriza uma reserva, mesmo em horário já oferecido.
    const consultaEspecifica=!!especifico&&(/\?|\b(?:tem|livre|disponivel|disponível)\b/i.test(m.texto)||!oferecidos.includes(especifico));
    const selecionado=pendenteNome?pendenteSalvo:!bloqueada&&!consultaEspecifica?(aceitouPendente?c.agenteAna?.horarioPendente:escolherHorarioAna(oferecidos,m.texto)??chosenSlot([...(c.agenteAna?.horariosTeste??[]),...(c.horariosOfertados??[])],m.texto)):undefined;
    if(!bloqueada&&(especifico||selecionado||aceitouPendente))raw.intencao='agendamento';
    if(!aceiteCaptacao&&!primeiroContato&&!pendenteNome&&!selecionado&&!especifico&&!aceitouPendente&&!outras&&!alteracao&&!pedidoAgendaRetornoAna(m.texto)&&enc!=='sim'&&raw.intencao==='agendamento')raw.intencao='duvida_geral';
    const gerenciarExistente=!!c.consultaAgendada&&alteracao!=='remarcar'&&c.agenteAna?.alteracaoConsulta!=='remarcar';
    let horarioPendente:string|undefined;
    // Escolheu um dos horários oferecidos sem nome: guardar a escolha e pedir só o nome completo.
    const pedirNome=!!selecionado&&!pendenteNome&&!nome&&!!tipoCliente&&!!telefone&&mode==='Automática'&&!bloqueada;
    let semPeriodo=false;
    let indisponivel=false;
    // Telefone com mais de um cadastro na base: a Ana não classifica por conta própria; a equipe confirma o vínculo.
    if(classificacao.fonte==='duvida'&&raw.intencao==='agendamento'){raw.encaminhar_humano=true;raw.motivo_aprovacao='Telefone vinculado a mais de um cadastro; a equipe confirma o vínculo antes de agendar.';bloqueada=true;}
    if(teste&&tipoCliente&&telefone&&raw.intencao==='agendamento'&&!bloqueada&&!selecionado&&!gerenciarExistente&&!semConsulta&&!recebeuNome&&(aceiteCaptacao||primeiroContato||nome||consultaEspecifica||enc==='sim'||/horarios|horários/.test(m.texto))){
      const {ocupadosAgenda}=await import('./projuris-agenda.server');
      // A Anne atende mesmo com o ProJuris fora: usa as regras locais da agenda; a reserva revalida depois.
      const busy=(await ocupadosAgenda(db,row.data.owner_id,new Date(),horizonteAgendaAna()))??[];
      agendaReal=true;
      if(consultaEspecifica&&especifico&&horarioEspecificoLivre(especifico,busy,tipoCliente)){
        horarioPendente=especifico;horarios=[especifico];
      }else{
        indisponivel=consultaEspecifica;
        const opcoes=selecionarOpcoesAna(busy,new Date(),tipoCliente,primeiroContato?'':m.texto,primeiroContato?[]:historicoHorarios,!primeiroContato);
        horarios=opcoes.slots;semPeriodo=opcoes.semPeriodo;
      }
    }
    const r=saudacaoClienteNovo(aplicarRegrasAna(primeiroContato?{...raw,intencao:'duvida_geral'}:raw,mode,m.texto,state.training.proibidos,{teste,horarios,ultimaResposta:previous,agendaReal,tipoCliente,nome,telefone,emailPendente:c.etapa==='documentos'&&solicitarEmailPendente(lista.data,email),consultaInicial:rel.consultaInicial}),m.texto,{apresentado:!primeiroContato,tipoCliente,horarios,agendaReal});
    if(canal==='ultramsg'&&mode==='Automática') {
      const { fluxoProcessoReal } = await import('./consulta-processo.server');
      efeitosIniciados=true;
      await marcarEfeito();
      if(await fluxoProcessoReal(db,{conversa:c,owner:row.data.owner_id,telefone,contato:remetente.data?.contato_externo??'',texto:m.texto,intencao:raw.intencao,messageId}))return;
      efeitosIniciados=false;
    }
    // Caminhos excluídos ou outros modos nunca liberam conteúdo processual produzido pelo modelo.
    if(raw.intencao==='consulta_processo'&&!r.encaminhar_humano){r.acao='rascunho';r.motivo_aprovacao='Notícia processual exige revisão individual.';}
    const saudou=saudacaoInicialAna(r.mensagem);
    if(recebeuNome&&mode==='Automática'&&!r.encaminhar_humano&&!r.urgente){r.acao='enviar';r.motivo_aprovacao='';r.mensagem=historicoHorarios.length?`Obrigada, ${nome}. Qual das opções já apresentadas fica melhor para você?`:`Obrigada, ${nome}. Vou manter o contexto do seu atendimento.`;r.proximo_passo='Nome recebido; manter solicitação e ofertas anteriores.';}
    if(aceiteCaptacao&&agendaReal&&!nome&&!r.encaminhar_humano){r.acao=mode==='Automática'?'enviar':mode==='Sugerir'?'rascunho':'nenhuma';r.motivo_aprovacao='';}
    if(pedirNome&&selecionado&&!r.encaminhar_humano&&!r.urgente){horarioPendente=selecionado;r.acao='enviar';r.intencao='agendamento';r.motivo_aprovacao='';r.mensagem=PEDIDO_NOME_AGENDA_ANA;r.proximo_passo='Horário escolhido; aguardar nome completo para reservar.';}
    if(!saudou&&!recebeuNome&&agendaReal&&!selecionado&&!horarioPendente&&!gerenciarExistente&&r.acao==='enviar'&&r.intencao==='agendamento'&&!r.motivo_aprovacao){
      r.mensagem=listaHorariosAna(horarios,new Date(),repetida);
      if(frustracaoHorariosAna(m.texto)&&horarios.length)r.mensagem=r.mensagem.replace(/^[^\n]+/,'Desculpe! Aqui vão opções diferentes:');
      if(outras&&pedidosOutras>=2&&!temPreferenciaAna(m.texto)&&horarios.length)r.mensagem=r.mensagem.replace('Qual fica melhor para você? Se preferir, me diga outro dia ou horário.','Prefere algum dia da semana ou período, manhã ou tarde?');
    }
    if(horarioPendente&&!pedirNome&&mode==='Automática'&&!r.encaminhar_humano&&!r.motivo_aprovacao){r.acao='enviar';r.mensagem=`${linhaHorarioAna(horarioPendente)} está livre. Posso marcar para você?`;r.proximo_passo='Aguardar aceite explícito e nome completo para reservar o horário consultado.';}
    // Nunca afirmar que anotou um horário que não foi reconhecido e salvo.
    if(!selecionado&&!horarioPendente&&!pendenteNome&&/anotei (?:o|seu) hor|hor[aá]rio (?:que (?:voc[eê] )?escolheu|escolhido)/i.test(r.mensagem)){r.mensagem='Qual dos horários enviados fica melhor para você?';r.proximo_passo='Escolha de horário não reconhecida; aguardar escolha.';}
    if(indisponivel&&r.acao==='enviar')r.mensagem=`Esse horário não está disponível.\n\n${r.mensagem}`;
    if(identidade&&/qual (?:[ée] )?(?:o )?seu nome|como (?:você|voce) se chama/i.test(r.mensagem)){r.mensagem='Já tenho seu nome registrado. Vou continuar a partir da sua solicitação.';}
    if(semPeriodo&&r.acao==='enviar')r.mensagem='Não encontrei novas opções livres nesse período nos próximos 15 dias úteis. Quer que a equipe entre em contato com você?';
    if(cobranca)Object.assign(r,resultadoRetorno(c,canal));
    const gerenciar=teste&&mode==='Automática'&&!r.encaminhar_humano&&!r.motivo_aprovacao&&!!c.consultaAgendada;
    const cancelar=gerenciar&&decisaoCancel==='confirmar'&&pendenteCancel;
    // "Não vou conseguir"/"vou atrasar" à confirmação de 40 min: pergunta explícita com data e hora, nunca cancelamento direto.
    const naoNaConfirmacao=resposta40==='nao'&&!pedidoHumano(m.texto)&&!decisaoCancel;
    const perguntar=gerenciar&&!confirmouLembrete&&!cancelar&&alteracao!=='remarcar'&&c.agenteAna?.alteracaoConsulta!=='remarcar'&&(r.intencao==='agendamento'||naoNaConfirmacao);
    if(perguntar&&naoNaConfirmacao)r.acao='enviar';
    if(perguntar){r.mensagem=`Você já tem uma consulta marcada para ${formatarHorarioCliente(c.consultaAgendada??'')}. Deseja remarcar ou cancelar esse agendamento?`;r.proximo_passo='Aguardar autorização do cliente para cancelar ou remarcar.';}
    if(gerenciar&&decisaoCancel==='pedir'){r.mensagem=`Quer mesmo cancelar a sua consulta de ${formatarHorarioCliente(c.consultaAgendada??'').toLowerCase()}? Se preferir, posso remarcar para outro dia.`;r.proximo_passo='Aguardar confirmação explícita posterior para cancelar esta consulta.';}
    if(gerenciar&&decisaoCancel==='manter'){r.mensagem=`Combinado, sua consulta continua marcada para ${formatarHorarioCliente(c.consultaAgendada??'').toLowerCase()}.`;r.proximo_passo='Consulta mantida por escolha do cliente.';}
    if(semConsulta&&mode==='Automática'&&!pedidoHumano(m.texto)){r.acao='enviar';r.motivo_aprovacao='';r.encaminhar_humano=false;r.mensagem='Não encontrei consulta marcada por aqui. Quer marcar uma?';r.proximo_passo='Aguardar interesse em novo agendamento.';}
    if(confirmouLembrete&&mode==='Automática'&&c.consultaAgendada&&!pedidoHumano(m.texto)){r.acao='enviar';r.motivo_aprovacao='';r.encaminhar_humano=false;r.mensagem=`Presença confirmada! Sua consulta continua hoje, às ${hora(c.consultaAgendada)}.`;r.proximo_passo='Cliente confirmou presença pelo lembrete do dia.';}
    if(cancelar){r.mensagem='';r.proximo_passo='Cancelar consulta somente após validar o recibo do atendimento.';}
    Object.assign(r,protegerRelacionamentoAna(r,rel,m,mode,permiteAgenda,c));
    // Concierge de coleta (depois do Trato feito): anexo só é "recebido" com recibo do servidor (arquivo guardado);
    // faltantes pelos nomes do checklist real; avaliação do documento ("serve?") fica com a equipe.
    if(mode==='Automática'&&emColeta(c)&&!r.urgente&&!pedidoHumano(m.texto)&&!cobranca){
      if(m.arquivo){const resp=respostaDocumentoColeta({temRecibo:!!m.path&&m.salvoStart===true,faltantes:lista.data.filter(i=>!i.recebido).map(i=>i.nome),textoCliente:m.texto,textos:textosColeta(state.respostasProntas)});Object.assign(r,{acao:'enviar',motivo_aprovacao:'',intencao:'documento',mensagem:resp.mensagem,encaminhar_humano:resp.humano,proximo_passo:resp.proximo});}
      else if(perguntaAvaliacaoDocumento(m.texto)){Object.assign(r,{acao:'enviar',motivo_aprovacao:'',intencao:'documento',encaminhar_humano:true,mensagem:'Quem confere se o documento atende é a equipe. Vou pedir para olharem e te retornam por aqui.',proximo_passo:'Cliente perguntou se o documento serve: equipe avaliar e responder.'});}
    }
    if(enc==='nao'&&mode==='Automática'&&!r.urgente){r.acao='nenhuma';r.mensagem='';r.encaminhar_humano=false;r.proximo_passo='Cliente respondeu à pergunta de encerramento; nada mais a enviar.';}
    const agenda=saudou?{slots:horarios,selected:undefined}:!recebeuNome&&!horarioPendente&&!bloqueada&&!perguntar&&!cancelar&&!semConsulta&&teste&&tipoCliente&&telefone&&r.intencao==='agendamento'&&r.acao==='enviar'?respostaAgendaTeste(m.texto,horarios,new Date(),agendaReal,tipoCliente,repetida):undefined;
    const resumoTransbordo=r.encaminhar_humano?resumoTransbordoAna(nome,telefone,m.texto):undefined;
    if(resumoTransbordo)r.proximo_passo=resumoTransbordo;
    let accepted=false;
    await atualizarConversa(db,id,current=>{
      accepted=false;
      if(!aceitarRespostaAna(messageId,current.mensagens.at(-1)?.id,current.agenteAna))return current;
      accepted=true;
      const base=cobranca?registrarRetorno(current,canal,messageId,row.data.owner_id):current;
      return {...base,...(current.etiquetaAcao||etiqueta==='sem'?{}:{etiquetaAcao:etiqueta}),...(rel.situacao==='ativo'&&reconhecimento.identidade.tipo==='unico'?{tipoClienteAgenda:'cadastrado' as const}:!current.tipoClienteAgenda&&classificacao.fonte==='cadastro'&&tipoCliente?{tipoClienteAgenda:tipoCliente}:{}),agenteAna:{...current.agenteAna,...(gerenciar&&alteracao==='remarcar'&&current.agenteAna?.reservaCalendar?{alteracaoConsulta:'remarcar' as const,autorizacaoRemarcacao:{eventoId:current.agenteAna.reservaCalendar.id,inicio:current.agenteAna.reservaCalendar.inicio,contato:telefone,expira:new Date(Date.now()+30*60000).toISOString()}}:{}),tipoCliente,telefone,horarioPendente:horarioPendente??(aceitouPendente?c.agenteAna?.horarioPendente:undefined),horarioPendenteDesde:horarioPendente?new Date().toISOString():aceitouPendente?c.agenteAna?.horarioPendenteDesde:undefined,...(horarioPendente?{horariosTeste:[horarioPendente],agendaReal:true}:{}),...(agenda&&agendaReal?{horariosTeste:agenda.slots,agendaReal}:{}),resultado:r,dados:{...(current.agenteAna?.dados??{nome:'',cpf:'',assunto:'',email:''}),...Object.fromEntries(Object.entries(r.dados_coletados).filter(([,v])=>v))},humano:r.encaminhar_humano,urgente:r.urgente||current.agenteAna?.urgente||false,motivo:r.motivo_aprovacao,proximoPasso:r.proximo_passo,erro:undefined},iaRetida:r.acao==='rascunho'?r.mensagem:current.iaRetida,...(resumoTransbordo?{timeline:[...base.timeline,{data:new Date().toISOString(),evento:resumoTransbordo}]}:{})};
    });
    if(!accepted)return;
    if(respostaLembrete==='sim')await atualizarConversa(db,id,x=>({...x,agenteAna:{...x.agenteAna,confirmacaoCancelamento:undefined,...(x.agenteAna?.lembreteConsulta?{lembreteConsulta:{...x.agenteAna.lembreteConsulta,confirmadoEm:new Date().toISOString()}}:{})},timeline:[...x.timeline,{data:new Date().toISOString(),evento:'Cliente confirmou presença pelo lembrete'}]}));
    if(resposta40)await atualizarConversa(db,id,x=>registrarRespostaConfirmacao40(x,resposta40));
    // Secretaria ligada: a automação respondida pelo fluxo Automático é encerrada (não fica "aguardando").
    if(secretaria&&(resposta40||respostaLembrete))await atualizarConversa(db,id,x=>resposta40?encerrarAutomacaoRespondida(x,'confirmacao_consulta',resposta40):encerrarAutomacaoRespondida(x,'lembrete_consulta',respostaLembrete==='sim'?'sim':'nao'));
    if(enc)await atualizarConversa(db,id,x=>({...x,agenteAna:{...x.agenteAna,...(x.agenteAna?.encerramentoProcesso?{encerramentoProcesso:{...x.agenteAna.encerramentoProcesso,respondidoEm:new Date().toISOString(),resposta:enc}}:{})},timeline:[...x.timeline,{data:new Date().toISOString(),evento:enc==='sim'?'Cliente pediu horários de retorno depois da notícia do processo':'Cliente respondeu que a dúvida foi esclarecida'}]}));
    if(decisaoCancel==='manter'||decisaoCancel==='remarcar')await atualizarConversa(db,id,x=>({...x,agenteAna:{...x.agenteAna,confirmacaoCancelamento:undefined,...(decisaoCancel==='manter'?{alteracaoConsulta:undefined,autorizacaoRemarcacao:undefined,horarioPendente:undefined,horarioPendenteDesde:undefined}:{})}}));
    if(r.acao==='enviar'&&(r.mensagem.trim()||cancelar)) {
      // Relê bloqueios imediatamente antes de enviar; alteração de modo/canal vence a geração.
      const [fresh,cfg,contact,freshWorkspace]=await Promise.all([db.from('casos').select('dados').eq('id',id).single(),db.from('atendimento_canal_config').select('canal_ativo,agente_ativo,modo_teste').eq('id',true).single(),db.from('atendimento_contatos_teste').select('contato_externo,status').eq('conversa_id',id).eq('canal',canal).eq('status','liberado').maybeSingle(),db.from('office_workspace').select('dados').eq('owner_id',row.data.owner_id).maybeSingle()]);
      const current=fresh.data?.dados as unknown as Conversa|undefined;
      const currentState=(freshWorkspace.data?.dados as unknown as OfficeState)??defaultState;
      if(fresh.error||cfg.error||contact.error||freshWorkspace.error||!contact.data||!current||cfg.data?.canal_ativo!==canal||!cfg.data.agente_ativo||(current.modoIA??currentState.automations?.modoIA??defaultAutomations.modoIA)!=='Automática'||current.mensagens.at(-1)?.id!==messageId||current.agenteAna?.pausa||currentState.anaPausa?.ativa||current.agenteAna?.humano&&!r.encaminhar_humano||current.mensagens.some(x=>x.respostaAnaDe===messageId))return;
      if(!messageId.startsWith(`${canal}:${contact.data.contato_externo}:`))return;
      let novasLembrete:string[]=[];
      if(cancelar){
        efeitosIniciados=true;
        await marcarEfeito();
        try {
        const reserva=current.agenteAna?.reservaCalendar;
        if(!reserva||reserva.inicio!==current.consultaAgendada)throw new Error('Consulta sem recibo verificável; equipe deve conferir antes de cancelar.');
        const consent=current.agenteAna?.confirmacaoCancelamento;
        if(!consent||consent.eventoId!==reserva.id||consent.inicio!==reserva.inicio||consent.contato!==telefone||Date.parse(consent.expira)<=Date.now())throw new Error('Confirmação de cancelamento inválida ou vencida.');
        const {cancelarAgenda}=await import('./projuris-agenda.server');
        await assumirAlteracao(db,id,messageId,reserva.id,'cancelar');
        const resultado=await cancelarAgenda(db,row.data.owner_id,id,reserva,true);
        r.mensagem=`Pronto, sua consulta de ${formatarHorarioCliente(reserva.inicio).toLowerCase()} foi cancelada. Se quiser marcar outro dia, é só me chamar.`;
        r.proximo_passo=resultado==='ausente'?'Consulta retirada do atendimento; o compromisso já não estava na agenda conectada. Equipe: conferir outras agendas.':'Consulta cancelada com autorização do cliente.';
        await atualizarConversa(db,id,x=>({...x,consultaAgendada:undefined,horariosOfertados:[],agenteAna:{...x.agenteAna,confirmacaoCancelamento:undefined,operacaoConsulta:undefined,reservaCalendar:undefined,alteracaoConsulta:undefined,autorizacaoRemarcacao:undefined,horarioPendente:undefined,horarioPendenteDesde:undefined,horariosTeste:[],agendaReal:false,resultado:r,proximoPasso:r.proximo_passo},timeline:[...x.timeline,{data:new Date().toISOString(),evento:r.proximo_passo}]}));
        await db.rpc('registrar_audit_log',{p_ator:'Ana',p_perfil:'sistema',p_acao:'cancelarCalendar',p_resumo:r.proximo_passo,p_status:'sucesso'});
        if(cancelouLembrete){
          const {ocupadosAgenda}=await import('./projuris-agenda.server');
          const busy=await ocupadosAgenda(db,row.data.owner_id,new Date(),horizonteAgendaAna());
          novasLembrete=busy?selecionarOpcoesAna(busy,new Date(),tipoCliente??'novo','',[reserva.inicio],true).slots:[];
          r.mensagem=novasLembrete.length?`Tudo bem, cancelei sua consulta de hoje. Para reagendar:\n\n${listaHorariosAna(novasLembrete)}`:'Tudo bem, cancelei sua consulta de hoje. Vou pedir para a equipe te passar novos horários.';
          if(novasLembrete.length)await atualizarConversa(db,id,x=>({...x,agenteAna:{...x.agenteAna,horariosTeste:novasLembrete,agendaReal:true}}));
        }
        }catch(error){
          console.error('Cancelamento na agenda ProJuris não concluído',error);
          r.mensagem='Não consegui cancelar agora. Deixei registrado e a equipe vai confirmar com você.';r.encaminhar_humano=true;r.proximo_passo='Equipe: conferir falha de cancelamento; consulta não confirmada como cancelada.';
          await atualizarConversa(db,id,x=>({...x,agenteAna:{...x.agenteAna,operacaoConsulta:undefined,humano:true,resultado:r,erro:'Falha ao cancelar; conferir agenda.',proximoPasso:r.proximo_passo},timeline:[...x.timeline,{data:new Date().toISOString(),evento:r.proximo_passo}]}));
          await db.rpc('registrar_audit_log',{p_ator:'Ana',p_perfil:'sistema',p_acao:'cancelarCalendar',p_resumo:r.proximo_passo,p_status:'erro',p_erro:'Cancelamento não confirmado; conferir registros do servidor.'});
        }
      }
      const ofertasEquipe=(current.horariosOfertados??[]).filter(s=>tipoCliente&&horarioPermitido(s,tipoCliente)&&Date.parse(s)>Date.now());
      const escolhido=escolherReservaAna({texto:m.texto,selecionado,horarios:agendaReal?[...(c.agenteAna?.horariosTeste??[]),...ofertasEquipe]:ofertasEquipe,real:agendaReal||ofertasEquipe.length>0,tipoCliente,teste:cfg.data.modo_teste===true,modo:current.modoIA??currentState.automations?.modoIA??defaultAutomations.modoIA,bloqueado:!permiteAgenda||pedirNome||(bloqueada&&!pendenteNome)||consultaEspecifica||cancelar||perguntar||!tipoCliente||!nome||!telefone||(r.intencao!=='agendamento'&&!selecionado)||r.encaminhar_humano||!!r.motivo_aprovacao});
      if(escolhido){
        efeitosIniciados=true;
        await marcarEfeito();
        if(current.consultaAgendada&&current.agenteAna?.alteracaoConsulta!=='remarcar'){
          r.mensagem=`Você já tem uma consulta marcada para ${formatarHorarioCliente(current.consultaAgendada)}. Deseja remarcar ou cancelar esse agendamento?`;
          r.proximo_passo='Aguardar autorização para alteração da consulta.';
        }else{
          try{
            const {reservarAgenda,remarcarAgenda}=await import('./projuris-agenda.server');
            const cliente={nome,telefone:telefone??'',tipo:tipoCliente??'novo'};
            if(current.consultaAgendada){
              const consent=current.agenteAna?.autorizacaoRemarcacao;
              if(!current.agenteAna?.reservaCalendar||!consent||consent.eventoId!==current.agenteAna.reservaCalendar.id||consent.inicio!==current.consultaAgendada||consent.contato!==telefone||Date.parse(consent.expira)<=Date.now())throw new Error('Remarcação sem autorização vigente para esta consulta.');
              await assumirAlteracao(db,id,messageId,current.agenteAna.reservaCalendar.id,'remarcar');
            }
            const reserva=current.consultaAgendada&&current.agenteAna?.reservaCalendar?await remarcarAgenda(db,row.data.owner_id,id,current.agenteAna.reservaCalendar,escolhido,true,new Date(),cliente):await reservarAgenda(db,row.data.owner_id,id,escolhido,new Date(),cliente);
            // Modelo oficial 08.1 quando compatível (manhã, sem link do Meet a entregar); senão a confirmação aprovada anterior.
            const agendado=textoAgendamentoConfirmado(reserva,nome,new Date(),{funilInternacional:!!c.funilInternacional,biblioteca});
            modeloUsado=marcaModelo(agendado);
            r.mensagem=agendado.texto.replace(/(Horário: [^\n]+)/,c.funilInternacional?'$1 (horário de Brasília)':'$1')+(c.funilInternacional?`\n\n${REGRAS_REAGENDAMENTO}`:'');
            r.proximo_passo='Consulta reservada automaticamente na agenda do ProJuris.';
            // Mesmo se chegar nova mensagem, preservar o recibo da operação já concluída.
            await atualizarConversa(db,id,x=>({...x,consultaAgendada:reserva.inicio,horariosOfertados:[],agenteAna:{...x.agenteAna,operacaoConsulta:undefined,reservaCalendar:reserva,alteracaoConsulta:undefined,autorizacaoRemarcacao:undefined,horariosTeste:[],horarioPendente:undefined,horarioPendenteDesde:undefined,consultaTeste:undefined,resultado:r,proximoPasso:r.proximo_passo},timeline:x.agenteAna?.reservaCalendar?.id===reserva.id?x.timeline:[...x.timeline,{data:new Date().toISOString(),evento:`Consulta confirmada na agenda do ProJuris · ${formatarHorarioCliente(reserva.inicio)}`}]}));
            const audit=await db.rpc('registrar_audit_log',{p_ator:'Ana',p_perfil:'sistema',p_acao:'reservaCalendar',p_resumo:`Compromisso confirmado · ${reserva.inicio}`,p_status:'sucesso'});
            if(audit.error)throw new Error('Reserva criada; falha de auditoria. Confira a Agenda.');
          }catch(error){
            console.error('Reserva na agenda ProJuris não concluída',error);
            if(error instanceof Error&&error.message==='Esse horário acabou de ficar ocupado. Escolha outro horário.'){
              const {ocupadosAgenda}=await import('./projuris-agenda.server');
              const busy=await ocupadosAgenda(db,row.data.owner_id,new Date(),horizonteAgendaAna());
              if(!busy)throw new Error('Agenda indisponível; nenhum novo horário oferecido.');
              const novas=selecionarOpcoesAna(busy,new Date(),tipoCliente??'novo','',historicoHorarios,true).slots;
              r.mensagem=`Esse horário acabou de ser ocupado.\n\n${listaHorariosAna(novas)}`;
              r.proximo_passo='Aguardar escolha das novas opções verificadas.';
              const {enviarMensagemSistema}=await import('./envio.functions');
              const envio=await enviarMensagemSistema({supabase:db,conversaId:id,texto:r.mensagem,motivo:'ana',contatoEsperado:contact.data.contato_externo,mensagemOrigem:messageId,controleHumanoEm:c.agenteAna?.controleHumanoEm,...(novas.length?{horarios:novas}:{})});
              if(envio.simulado)throw new Error('Novas opções não enviadas.');
              await atualizarConversa(db,id,x=>({...x,agenteAna:{...x.agenteAna,operacaoConsulta:undefined,horariosTeste:novas,agendaReal:true,resultado:r,horariosApresentados:[...new Set([...(x.agenteAna?.horariosApresentados??[]),...novas])],listasHorarios:(x.agenteAna?.listasHorarios??0)+1},mensagens:[...x.mensagens,newMessage(r.mensagem,{autor:'Ana · assistente virtual',canal,idExterno:envio.idExterno,respostaAnaDe:messageId,status:'enviada'})]}));
              return;
            }
            // Nunca prometer reserva após falha, nem criar uma segunda tentativa automática.
            r.mensagem='Não consegui concluir a reserva na agenda. Deixei a situação registrada para a equipe verificar; não considere o horário confirmado por esta mensagem.';
            r.proximo_passo='Equipe: conferir a agenda e a falha de reserva antes de retomar.';
            await atualizarConversa(db,id,x=>({...x,agenteAna:{...x.agenteAna,humano:true,erro:'Falha ao concluir a reserva; conferir a agenda do ProJuris.',resultado:{...r,encaminhar_humano:true},proximoPasso:r.proximo_passo}}));
            await db.rpc('registrar_audit_log',{p_ator:'Ana',p_perfil:'sistema',p_acao:'reservaCalendar',p_resumo:'Reserva não confirmada · revisão humana',p_status:'erro',p_erro:'Falha na reserva na agenda ProJuris; conferir registros do servidor.'});
          }
        }
        const latest=await db.from('casos').select('dados').eq('id',id).single();
        const x=latest.data?.dados as unknown as Conversa|undefined;
        if(latest.error||!x||x.mensagens.at(-1)?.id!==messageId||x.agenteAna?.pausa)return;
      }else if(!cancelar&&!perguntar&&agendaReal&&agenda?.selected){
        // Seleção vencida ou fora da autorização nunca vira confirmação.
        r.mensagem='Não posso reservar esse horário agora. Peça novos horários disponíveis para continuar.';
        r.proximo_passo='Consultar novos horários disponíveis.';
      }
      // Claim persistente antes do envio impede replay em falha de rede; nunca reenvia automaticamente.
      const {enviarMensagemSistema}=await import('./envio.functions');
      // Primeiro atendimento de lead que já disse o nome, com os dois horários amanhã: modelo oficial 07.1.
      if(saudou&&primeiroContato){const inicial=saudacaoPrimeiroAtendimento(r.mensagem,{nome:introducao||raw.dados_coletados.nome,horarios:agenda?.slots??horarios,biblioteca});if(inicial.id!=='anterior'){r.mensagem=inicial.texto;modeloUsado=marcaModelo(inicial);}}
      if(!saudou)r.mensagem=limitarNomeAna(r.mensagem,nome,c.mensagens.filter(x=>x.canal===canal&&x.de==='escritorio').slice(-2).map(x=>x.texto));
      const novosOferecidos=cancelar?novasLembrete:!escolhido&&!cancelar&&!perguntar&&!semConsulta&&agendaReal&&!agenda?.selected?(horarioPendente?[horarioPendente]:agenda?.slots??[]):[];
      if(retomada&&!r.urgente)r.mensagem=mensagemRetornoAna(m.texto,r.mensagem);
      r.mensagem=semReintroducao(r.mensagem,atendimentoIniciado(c,canal,messageId)||!!identidade);
      // Secretaria ligada: horário, data, valor, processo ou CPF fora das fontes desta conversa retém a resposta.
      if(secretaria){
        const faltando=dadosNaoVerificados(r.mensagem,fontesDaConversa(current,{horarios:[...novosOferecidos,...(escolhido?[escolhido]:[]),...(horarioPendente?[horarioPendente]:[]),...historicoHorarios],textos:['30 minutos; novo segunda a quinta 09:00–17:30; cadastrado sexta 13:30–17:30',REGRAS_REAGENDAMENTO]}));
        if(faltando.length){
          await atualizarConversa(db,id,x=>reterRespostaNaoVerificada(x,r.mensagem,faltando,messageId));
          await db.rpc('registrar_audit_log',{p_ator:'Anne',p_perfil:'sistema',p_acao:'secretariaFatos',p_resumo:`Resposta retida: dado sem fonte verificada (${faltando.length})`,p_status:'bloqueado'});
          return;
        }
      }
      efeitosIniciados=true;
      const sent=await enviarMensagemSistema({supabase:db,conversaId:id,texto:r.mensagem,motivo:'ana',contatoEsperado:contact.data.contato_externo,mensagemOrigem:messageId,controleHumanoEm:c.agenteAna?.controleHumanoEm,permitirEncaminhamento:r.encaminhar_humano,...(novosOferecidos.length&&!horarioPendente?{horarios:novosOferecidos}:{})});
      if(sent.simulado)throw new Error('Canal desligado; resposta não enviada.');
      await atualizarConversa(db,id,current=>({...current,iaRetida:undefined,agenteAna:{...current.agenteAna,apresentado:true,...(gerenciar&&decisaoCancel==='pedir'&&current.agenteAna?.reservaCalendar?.id===c.agenteAna?.reservaCalendar?.id&&current.agenteAna?.reservaCalendar?{confirmacaoCancelamento:{eventoId:current.agenteAna.reservaCalendar.id,inicio:current.agenteAna.reservaCalendar.inicio,contato:telefone,expira:new Date(Date.now()+30*60000).toISOString()}}:{}),...(novosOferecidos.length?{horariosApresentados:[...new Set([...(current.agenteAna?.horariosApresentados??[]),...historicoHorarios,...novosOferecidos])],listasHorarios:(current.agenteAna?.listasHorarios??0)+1,pedidosOutrasOpcoes:pedidosOutras}:{})},mensagens:[...current.mensagens,newMessage(r.mensagem,{autor:'Ana · assistente virtual',canal,idExterno:sent.idExterno,respostaAnaDe:messageId,status:'enviada',...(modeloUsado?{modeloOficial:modeloUsado}:{})})]}));
    }
    await atualizarConversa(db,id,x=>({...x,agenteAna:{...x.agenteAna,envioAna:undefined},mensagens:x.mensagens.map(m=>m.id===messageId&&m.iaExecucao?{...m,iaExecucao:{...m.iaExecucao,estado:'concluida' as const}}:m)}));
    const audit=await db.rpc('registrar_audit_log',{p_ator:'Ana',p_perfil:'sistema',p_acao:'agenteAna',p_resumo:`${mode} · ${r.acao} · ${r.intencao}${r.urgente?' · urgente':''}`,p_status:'sucesso'});
    if(audit.error)throw new Error('Falha ao registrar auditoria.');
  } catch(error) {
    const e=error as {statusCode?:number;responseBody?:string;message?:string;retryable?:boolean;code?:string;name?:string};
    if(e.code==='ana_envio_bloqueado')return;
    console.error('Ana interrompida',error);
    const temporaria=!efeitosIniciados&&(e.retryable===true||e.code==='cancelled'||e.name==='TimeoutError');
    if(temporaria){
      let agendada=false;
      await atualizarConversa(db,id,x=>{
        const target=x.mensagens.find(m=>m.id===messageId);
        agendada=false;
        if(!target?.iaExecucao||target.iaExecucao.tentativas>=3||x.agenteAna?.humano||x.agenteAna?.pausa)return x;
        agendada=true;
        return {...x,agenteAna:{...x.agenteAna,erro:'Falha temporária; nova tentativa automática pendente.'},mensagens:x.mensagens.map(m=>m.id===messageId&&m.iaExecucao?{...m,iaExecucao:{...m.iaExecucao,estado:'aguardando' as const,retryEm:new Date(Date.now()+m.iaExecucao.tentativas*60000).toISOString()}}:m)};
      });
      if(agendada){await db.rpc('registrar_audit_log',{p_ator:'Ana',p_perfil:'sistema',p_acao:'anaRetry',p_resumo:'Geração temporariamente indisponível; recuperação agendada',p_status:'erro'});return;}
    }
    let safe='Não foi possível concluir a resposta da Ana; atendimento encaminhado para a equipe.';
    // Mensagens internas curtas (sem corpo de provedor) ajudam a equipe a saber o motivo real.
    if(e.message&&!e.responseBody&&!/\[\d{3}\]/.test(e.message))safe=`${safe} Motivo: ${e.message}`;
    try {const body=JSON.parse(e.responseBody??'{}');safe=body.message??body.error?.message??safe;}catch {/* Não exibir corpo bruto. */}
    safe=safe.slice(0,400);
    const pause=e.code==='chave_invalida'||e.statusCode===402||e.statusCode===403||e.statusCode===404||e.statusCode===401;
    // Libera a operação de agenda travada pela falha; sem isso a conversa ficaria impedida de cancelar/remarcar para sempre.
    await atualizarConversa(db,id,current=>({...current,mensagens:current.mensagens.map(m=>m.id===messageId&&m.iaExecucao?{...m,iaExecucao:{...m.iaExecucao,estado:efeitosIniciados?'incerta' as const:'concluida' as const}}:m),agenteAna:{...current.agenteAna,humano:true,pausa:pause||current.agenteAna?.pausa===true,erro:safe,operacaoConsulta:undefined,proximoPasso:'Equipe: conferir falha da Ana antes de retomar.'}}));
    if(pause) {
      // Pausa durável para todos os atendimentos do proprietário. Sem probes/retries.
      for(let attempt=0;attempt<5;attempt++){
      const latest=await db.from('office_workspace').select('dados,updated_at').eq('owner_id',row.data.owner_id).maybeSingle();
      if(latest.error)throw new Error('Não foi possível salvar a pausa da IA.');
      const next={...((latest.data?.dados as unknown as OfficeState)??defaultState),anaPausa:{ativa:true,motivo:safe}};
      const save=latest.data?await db.from('office_workspace').update({dados:next as unknown as Json,updated_at:new Date().toISOString()}).eq('owner_id',row.data.owner_id).eq('updated_at',latest.data.updated_at).select('owner_id'):await db.from('office_workspace').insert({owner_id:row.data.owner_id,dados:next as unknown as Json}).select('owner_id');
      if(save.error)throw new Error('Não foi possível salvar a pausa da IA.');
      if(save.data?.length)break;
      if(attempt===4)throw new Error('Não foi possível salvar a pausa da IA.');
      }
    }
    await db.rpc('registrar_audit_log',{p_ator:'Ana',p_perfil:'sistema',p_acao:'agenteAna',p_resumo:'Resposta interrompida · atendimento humano',p_status:'erro',p_erro:safe});
  }
}