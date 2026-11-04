import { describe, expect, it } from 'vitest';
import {
  sobrepoe,
  compromissoDe,
  compromissosDaResposta,
  corpoConsultaCompromissos,
  corpoCriacaoCompromisso,
  codigoExternoConsulta,
} from '@/lib/projuris/agenda';
import { reservarCompromisso } from '@/lib/projuris/agenda.server';
import { ErroProjuris } from '@/lib/projuris/erros';

const DIA = 1762387200000; // 2025-11-06T00:00:00Z (valor fixo qualquer)

describe('agenda ProJuris — regras puras', () => {
  it('sobreposição de intervalos [início, fim)', () => {
    expect(sobrepoe(10, 20, 15, 25)).toBe(true);
    expect(sobrepoe(10, 20, 20, 30)).toBe(false); // encostado não conflita
    expect(sobrepoe(10, 20, 5, 10)).toBe(false);
    expect(sobrepoe(10, 20, 10, 20)).toBe(true);
  });

  it('normaliza item da consulta: dataInicio/dataFim já são instantes completos (confirmado na API real)', () => {
    const c = compromissoDe({
      codigoTarefaEvento: 123,
      titulo: 'Consulta',
      dataInicioCompromisso: DIA + 36000000,
      horaInicioCompromisso: DIA + 36000000, // a API repete o instante completo; nunca somar
      dataFimCompromisso: DIA + 37800000,
      flagCompromissoConcluido: false,
    });
    expect(c).toEqual({ codigo: 123, titulo: 'Consulta', inicioMs: DIA + 36000000, fimMs: DIA + 37800000, concluido: false, codigoExterno: undefined });
  });

  it('descarta item sem código ou sem data e nunca inventa horário', () => {
    expect(compromissoDe({ titulo: 'x' })).toBeUndefined();
    expect(compromissoDe({ codigoTarefaEvento: 1 })).toBeUndefined();
  });

  it('extrai lista plana da resposta agrupada', () => {
    const raw = { tarefasAgrupadasDataTipoWs: [{ tarefaConsultaWs: [
      { codigoTarefaEvento: 1, dataInicioCompromisso: DIA, horaInicioCompromisso: 0 },
      { codigoTarefaEvento: 2, dataInicioCompromisso: DIA, horaInicioCompromisso: 1800000 },
    ] }] };
    expect(compromissosDaResposta(raw).map(c => c.codigo)).toEqual([1, 2]);
    expect(compromissosDaResposta(null)).toEqual([]);
  });

  it('corpo da consulta usa o filtro real dataInicio/dataFim e só compromissos não concluídos', () => {
    expect(corpoConsultaCompromissos(1000, 2000)).toEqual({
      dataInicio: 1000, dataFim: 2000, flagCompromisso: true, flagCompromissoConcluido: false,
    });
  });

  it('corpo de criação segue o formato comprovado na API real: dataBase, responsável e codigoExterno, sem tipoEvento', () => {
    const inicio = Date.UTC(2026, 10, 5, 13, 30); // 10:30 em São Paulo
    const corpo = corpoCriacaoCompromisso({ titulo: 'Consulta — Maria', inicioMs: inicio, fimMs: inicio + 1800000, codigoExterno: 'manageradv:consulta:abc:1000', responsavel: { chave: 7, valor: 'FULANO' } });
    expect(corpo.compromisso).toBe(true);
    expect(corpo.codigoExterno).toBe('manageradv:consulta:abc:1000');
    const ev = corpo.tarefaCompromissoEventoWs;
    expect(ev).not.toHaveProperty('tipoEvento');
    expect(ev.dataHoraInicio).toBe(inicio);
    expect(ev.dataHoraFim).toBe(inicio + 1800000);
    expect(ev.dataBase).toBe(Date.UTC(2026, 10, 5, 3, 0)); // meia-noite em São Paulo
    expect(ev.usuariosResponsaveis).toEqual([{ chave: 7, valor: 'FULANO' }]);
    expect(ev.tipoTarefa.chave).toBe(6683563); // Atendimento inicial
    expect(ev.notificaClienteCriacao).toBe(false);
  });

  it('codigoExterno de consulta carrega caso e instante', () => {
    expect(codigoExternoConsulta('caso-1', 5000)).toBe('manageradv:consulta:caso-1:5000');
  });
});

function dbFalso(claimOk: boolean) {
  const updates: unknown[] = [];
  const liberar = { then: (f: () => void) => { f(); return Promise.resolve(); } };
  const eq2 = () => liberar;
  const eq1 = () => ({ eq: eq2 });
  return {
    rpc: async (nome: string, _args: unknown) => nome === 'projuris_claim'
      ? { data: claimOk, error: null }
      : { data: null, error: new Error('rpc inesperada') },
    from: () => ({ update: (v: unknown) => { updates.push(v); return { eq: eq1 }; } }),
    updates,
  };
}

const pedido = { titulo: 'Consulta — Maria', inicioMs: DIA + 36000000, fimMs: DIA + 37800000, codigoExterno: 'manageradv:consulta:c1:1' };
const recibo = { codigoExterno: pedido.codigoExterno, tarefaCompromissoEventoWs: { titulo: pedido.titulo, dataHoraInicio: pedido.inicioMs, dataHoraFim: pedido.fimMs, usuariosResponsaveis: [{ chave: 176189 }] } };

describe('agenda ProJuris — reserva com proteção de overbooking', () => {
  it('recusa quando outra operação detém o bloqueio', async () => {
    const r = await reservarCompromisso(dbFalso(false) as never, 'dono', pedido, { chamar: async <T,>() => null as T });
    expect(r).toEqual({ ok: false, motivo: 'ocupado', detalhe: 'Outra operação de agenda em andamento.' });
  });

  it('detecta conflito na releitura e não cria nada', async () => {
    const chamadas: string[] = [];
    let consultas = 0;
    const cliente = { chamar: async (op: string) => {
      chamadas.push(op);
      if (op === 'tarefa.compromissoConsulta') {
        consultas++;
        if (consultas === 1) return { tarefasAgrupadasDataTipoWs: [] }; // idempotência: nada gravado antes
        return { tarefasAgrupadasDataTipoWs: [{ tarefaConsultaWs: [
          { codigoTarefaEvento: 9, titulo: 'Audiência', dataInicioCompromisso: DIA + 36000000, dataFimCompromisso: DIA + 39600000 },
        ] }] };
      }
      throw new Error('não deveria criar');
    } };
    const r = await reservarCompromisso(dbFalso(true) as never, 'dono', pedido, cliente);
    expect(r.ok).toBe(false);
    expect((r as { motivo?: string }).motivo).toBe('conflito');
    expect(chamadas).not.toContain('tarefa.compromissoCriar');
  });

  it('cria, confirma por leitura e devolve o código', async () => {
    const chamadas: string[] = [];
    const cliente = { chamar: async (op: string) => {
      chamadas.push(op);
      if (op === 'tarefa.compromissoConsulta') return { tarefasAgrupadasDataTipoWs: [] };
      if (op === 'tarefa.compromissoCriar') return { chave: 555 };
      if (op === 'tarefa.compromissoObter') return { codigoTarefa: 555, ...recibo };
      throw new Error('op inesperada: ' + op);
    } };
    const r = await reservarCompromisso(dbFalso(true) as never, 'dono', pedido, cliente);
    expect(r).toEqual({ ok: true, codigo: 555, jaExistia: false });
    expect(chamadas).toContain('tarefa.compromissoObter');
  });

  it('timeout na criação: consulta pelo codigoExterno e reutiliza o registro gravado (sem duplicar)', async () => {
    let consultas = 0;
    const cliente = { chamar: async (op: string) => {
      if (op === 'tarefa.compromissoConsulta') {
        consultas++;
        if (consultas <= 2) return { tarefasAgrupadasDataTipoWs: [] }; // idempotência inicial e disponibilidade
        return { tarefasAgrupadasDataTipoWs: [{ tarefaConsultaWs: [
          { codigoTarefaEvento: 777, dataInicioCompromisso: DIA + 36000000, codigoExterno: pedido.codigoExterno },
        ] }] };
      }
      if (op === 'tarefa.compromissoCriar') throw new ErroProjuris('tempo', 'sem resposta');
      if (op === 'tarefa.compromissoObter') return recibo;
      throw new Error('op inesperada: ' + op);
    } };
    const r = await reservarCompromisso(dbFalso(true) as never, 'dono', pedido, cliente);
    expect(r).toEqual({ ok: true, codigo: 777, jaExistia: true });
  });

  it('timeout sem registro gravado: resposta inconclusiva, sem retry automático', async () => {
    const cliente = { chamar: async (op: string) => {
      if (op === 'tarefa.compromissoConsulta') return { tarefasAgrupadasDataTipoWs: [] };
      if (op === 'tarefa.compromissoCriar') throw new ErroProjuris('indisponivel', 'falha');
      throw new Error('op inesperada: ' + op);
    } };
    const r = await reservarCompromisso(dbFalso(true) as never, 'dono', pedido, cliente);
    expect(r.ok).toBe(false);
    expect((r as { motivo?: string }).motivo).toBe('inconclusivo');
  });

  it('rejeita codigoExterno fora do padrão e horário inválido', async () => {
    await expect(reservarCompromisso(dbFalso(true) as never, 'dono', { ...pedido, codigoExterno: 'livre' }, { chamar: async <T,>() => null as T })).rejects.toThrow('padrão');
    await expect(reservarCompromisso(dbFalso(true) as never, 'dono', { ...pedido, fimMs: pedido.inicioMs }, { chamar: async <T,>() => null as T })).rejects.toThrow('término');
  });
});
