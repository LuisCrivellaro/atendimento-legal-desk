import {describe,it,expect} from 'vitest';
import {autorizaEnvioAna,podeExecutarAna} from '@/lib/atendimento/ana-execution';
import {conversas,type Mensagem} from '@/lib/mock-data';

const m:Mensagem={id:'entrada',de:'cliente',texto:'Olá',hora:'10:00'};
describe('execução real da Ana',()=>{
  it('atendimento humano bloqueia envio inclusive quando o modelo pede encaminhamento',()=>{
    const base=conversas[0];if(!base)throw new Error('Fixture ausente');
    expect(autorizaEnvioAna({...base,mensagens:[m],agenteAna:{humano:true,controleHumanoEm:'novo'}},m.id,'anterior',true)).toBe(false);
  });
  it('pausa independente bloqueia envio',()=>{
    const base=conversas[0];if(!base)throw new Error('Fixture ausente');
    expect(autorizaEnvioAna({...base,mensagens:[m],agenteAna:{pausa:true}},m.id,undefined)).toBe(false);
  });
  it('resposta existente não pode ser duplicada',()=>{
    const base=conversas[0];if(!base)throw new Error('Fixture ausente');
    expect(autorizaEnvioAna({...base,mensagens:[{...m,id:'saida',respostaAnaDe:m.id},m],agenteAna:{}},m.id,undefined)).toBe(false);
  });
  it('falha temporária fica elegível após vencimento sem exigir navegador',()=>{
    expect(podeExecutarAna({...m,iaProcessada:true,iaExecucao:{estado:'aguardando',tentativas:1,desde:'2026-11-03T19:00:00Z',retryEm:'2026-11-03T19:01:00Z'}},Date.parse('2026-11-03T19:01:00Z'))).toBe(true);
  });
  it('envio de resultado incerto nunca é repetido automaticamente',()=>{
    expect(podeExecutarAna({...m,iaExecucao:{estado:'enviando',tentativas:1,desde:'2026-11-03T19:00:00Z'}},Date.parse('2026-11-03T20:00:00Z'))).toBe(false);
    expect(podeExecutarAna({...m,iaExecucao:{estado:'incerta',tentativas:1,desde:'2026-11-03T19:00:00Z'}},Date.parse('2026-11-03T20:00:00Z'))).toBe(false);
  });
});