import { describe, expect, it } from 'vitest';
import { primeiraMensagemAna, nomePrimeiroContatoAna, PEDIDO_NOME_AGENDA_ANA, resumoTransbordoAna } from '@/lib/atendimento/ana-rules';
import { escolherHorarioAna, parManhaTardeAna, selecionarOpcoesAna, partesAgenda } from '@/lib/atendimento/ana-scheduling';
import { mensagemLembreteAna, respostaLembreteAna, lembreteAtivo } from '@/lib/atendimento/lembrete-consulta';

const manha='2026-11-05T13:00:00.000Z'; // qui 10h SP
const tarde='2026-11-05T17:30:00.000Z'; // qui 14h30 SP

describe('prompt da Ana de 04/11/2026', () => {
  it('saudação inicial exata com 1 horário de manhã e 1 à tarde', () => {
    expect(primeiraMensagemAna([manha,tarde])).toBe('Olá , \n\nSeja bem vindo (a)😊\nEquipe CS Advocacia \nwww.carolinasantos.com.br\n\nVou te ajudar!\nNossa primeira consulta é on-line e gratuita.\nTemos horários  às 10h ou às 14h30 \n\nO que fica melhor para você?');
  });
  it('apresenta só 2 opções: manhã e tarde mais próximas', () => {
    const now=new Date('2026-11-04T12:00:00Z'); // qua 9h SP
    const slots=selecionarOpcoesAna([],now,'novo').slots;
    expect(slots).toHaveLength(2);
    expect(Number(partesAgenda(slots[0]!)['hour'])).toBeLessThan(12);
    expect(Number(partesAgenda(slots[1]!)['hour'])).toBeGreaterThanOrEqual(13);
  });
  it('cliente cadastrado na sexta recebe 2 horários à tarde', () => {
    const slots=selecionarOpcoesAna([],new Date('2026-11-04T12:00:00Z'),'cadastrado').slots;
    expect(slots).toHaveLength(2);
    expect(slots.every(s=>partesAgenda(s)['weekday']==='Fri'&&Number(partesAgenda(s)['hour'])>=13)).toBe(true);
  });
  it('novo cliente nunca recebe sexta, sábado ou domingo', () => {
    const slots=selecionarOpcoesAna([],new Date('2026-11-06T12:00:00Z'),'novo').slots;
    expect(slots.every(s=>!['Fri','Sat','Sun'].includes(String(partesAgenda(s)['weekday'])))).toBe(true);
  });
  it('"de manhã" e "à tarde" escolhem o horário oferecido do período', () => {
    expect(escolherHorarioAna([manha,tarde],'de manhã')).toBe(manha);
    expect(escolherHorarioAna([manha,tarde],'à tarde')).toBe(tarde);
    expect(escolherHorarioAna([manha,tarde],'14h30')).toBe(tarde);
  });
  it('par sem manhã usa os 2 primeiros', () => expect(parManhaTardeAna([tarde,'2026-11-05T18:00:00.000Z'])).toEqual([tarde,'2026-11-05T18:00:00.000Z']));
  it('nome completo só é lido depois do pedido de nome, e "tarde" não vira nome', () => {
    expect(nomePrimeiroContatoAna('Maria da Silva',PEDIDO_NOME_AGENDA_ANA)).toBe('Maria da Silva');
    expect(nomePrimeiroContatoAna('à tarde',primeiraMensagemAna([manha,tarde]))).toBe('');
  });
  it('resumo do transbordo traz nome, telefone e dúvida', () => {
    expect(resumoTransbordoAna('Maria','11999990000','Tenho direito?')).toBe('Resumo para a Dra. Carolina — Nome: Maria · Telefone: 11999990000 · Dúvida: Tenho direito?');
  });
  it('lembrete das 8h com texto oficial', () => {
    expect(mensagemLembreteAna('Maria',tarde)).toBe('Olá, Maria! Aqui é a Ana, do escritório CS Advocacia.\nPassando para lembrar da sua consulta agendada para hoje, às 14h30.\nVocê confirma a sua presença? Responda com SIM para confirmar ou NÃO para cancelar/reagendar.');
  });
  it('SIM/NÃO só contam para lembrete vigente do dia', () => {
    expect(respostaLembreteAna('SIM')).toBe('sim');
    expect(respostaLembreteAna('Não')).toBe('nao');
    expect(respostaLembreteAna('não sei ainda')).toBeUndefined();
    const l={inicio:tarde,enviadoEm:'2026-11-05T11:00:00Z'};
    expect(lembreteAtivo(l,tarde,new Date('2026-11-05T11:05:00Z'))).toBe(true);
    expect(lembreteAtivo({...l,confirmadoEm:'x'},tarde,new Date('2026-11-05T11:05:00Z'))).toBe(false);
    expect(lembreteAtivo(l,tarde,new Date('2026-11-06T11:05:00Z'))).toBe(false);
  });
});
