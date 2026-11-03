import {describe,it,expect} from 'vitest';
import {conversas,type Conversa} from '@/lib/mock-data';
import {retornoIdentificadoAna} from '@/lib/atendimento/ana-retomada';
function c(stamp:string,nome='Mariana'):Conversa {
 const fixture=conversas[0];if(!fixture)throw new Error('Fixture ausente');
 return {...fixture,agenteAna:{dados:{nome,cpf:'',email:'',assunto:''}},mensagens:[{id:'old',de:'cliente',texto:'Anterior',canal:'ultramsg',hora:'',dataHora:stamp},{id:'new',de:'cliente',texto:'oi',canal:'ultramsg',hora:''}]};
}
describe('limites da retomada',()=>{
 it('quatro horas no mesmo dia disparam retorno, intervalo menor não',()=>{
  expect(retornoIdentificadoAna(c('2026-11-03T12:00:00Z'),'new','ultramsg',new Date('2026-11-03T16:00:00Z'))).toBe(true);
  expect(retornoIdentificadoAna(c('2026-11-03T12:00:00Z'),'new','ultramsg',new Date('2026-11-03T15:59:59Z'))).toBe(false);
 });
 it('mudança de dia usa São Paulo e não UTC',()=>{
  expect(retornoIdentificadoAna(c('2026-11-03T02:59:00Z'),'new','ultramsg',new Date('2026-11-03T03:01:00Z'))).toBe(true);
  expect(retornoIdentificadoAna(c('2026-11-02T23:59:00Z'),'new','ultramsg',new Date('2026-11-03T00:01:00Z'))).toBe(false);
 });
 it('data ausente/inválida ou nome desconhecido não inventam retorno',()=>{
  expect(retornoIdentificadoAna(c('invalida'),'new','ultramsg')).toBe(false);
  expect(retornoIdentificadoAna(c('2026-11-01T12:00:00Z',''),'new','ultramsg',new Date('2026-11-03T12:00:00Z'))).toBe(false);
 });
});