import {describe,it,expect,vi,afterEach} from 'vitest';
import {mensagemDoAgente,podeApagarParaTodos} from '@/lib/atendimento/apagar-mensagem';
import {apagarNoWhatsApp} from '@/lib/atendimento/apagar-mensagem.server';
import type {Mensagem} from '@/lib/mock-data';
const m:Mensagem={id:'m',de:'escritorio',texto:'Mensagem enviada',hora:'',dataHora:'2026-11-03T18:00:00Z',autor:'Ana · assistente virtual',canal:'ultramsg',idExterno:'77',status:'enviada'};
afterEach(()=>vi.unstubAllGlobals());
describe('apagar mensagem do agente',()=>{
 it('só mensagem do agente pode ser apagada',()=>{expect(mensagemDoAgente(m)).toBe(true);expect(mensagemDoAgente({...m,de:'cliente'})).toBe(false);expect(mensagemDoAgente({...m,autor:'Equipe'})).toBe(false);});
 it('exclusão externa exige recibo WhatsApp não simulado e não apagado',()=>{expect(podeApagarParaTodos(m)).toBe(true);expect(podeApagarParaTodos({...m,status:'simulada'})).toBe(false);expect(podeApagarParaTodos({...m,idExterno:''})).toBe(false);expect(podeApagarParaTodos({...m,apagadaParaTodos:{em:'agora',por:'user'}})).toBe(false);});
 it('resolve ID WhatsApp único no chat do contato, não envia ID da fila',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json([{id:'true_5511999600306@c.us_ABC',body:m.texto,fromMe:true,timestamp:1793728800}])).mockResolvedValueOnce(Response.json({deleted:true}));vi.stubGlobal('fetch',fetcher);
  await apagarNoWhatsApp(m,'5511999600306',{instancia:'test',token:'token-test'});
  expect(String(fetcher.mock.calls[0]?.[0])).toContain('chatId=5511999600306%40c.us');
  expect(fetcher.mock.calls[1]?.[1].body.get('msgId')).toBe('true_5511999600306@c.us_ABC');
 });
 it('ID ambíguo ou mensagem de terceiro nunca apaga',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json([{id:'77',body:m.texto,fromMe:false}]));vi.stubGlobal('fetch',fetcher);
  await expect(apagarNoWhatsApp(m,'5511999600306',{instancia:'test',token:'token-test'})).rejects.toThrow('segurança');expect(fetcher).toHaveBeenCalledOnce();
 });
 it('não afirma exclusão em falha ou resposta sem confirmação',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json([{id:'77',body:m.texto,fromMe:true}])).mockResolvedValueOnce(Response.json({error:'expired'},{status:400}));vi.stubGlobal('fetch',fetcher);
  await expect(apagarNoWhatsApp(m,'5511999600306',{instancia:'test',token:'token-test'})).rejects.toThrow('não confirmou');
 });
});