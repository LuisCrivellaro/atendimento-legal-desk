import { afterEach, describe, expect, it } from 'vitest';
import { concluirEnvioEquipe, ENVIO_EM_ANDAMENTO_MS, falhaAmbigua, falharEnvioEquipe, reservarEnvioEquipe } from '@/lib/atendimento/envio-equipe';
import { enfileirarEnvio, limparFilaEnvio, pendentesAtuais, reenviarMensagem, resolverPendentes, type ResultadoEnvioEquipe } from '@/lib/atendimento/fila-envio';
import { comPendentes, pendentesResolvidos, type MensagemPendente } from '@/lib/atendimento/sincronizacao';
import { mensagemDoSistema } from '@/lib/atendimento/entrada-whatsapp';
import type { Conversa } from '@/lib/mock-data';

const base = (): Conversa => ({
  id: 'c1', nome: 'Cliente Teste', cpf: '', telefone: '', atendimento: '', etapa: 'inicial', naoLidas: 0, etapaPipeline: 0, syncs: [], processos: [], documentos: [], timeline: [],
  mensagens: [{ id: 'm1', de: 'cliente', texto: 'Oi', hora: '', dataHora: '2026-11-26T12:00:00Z' }],
  agenteAna: { humano: false } as NonNullable<Conversa['agenteAna']>, iaRetida: 'rascunho retido',
});
const agora = new Date('2026-11-26T12:01:00Z');
const ID = '11111111-1111-4111-8111-111111111111';

describe('envio da equipe no servidor (reserva → canal → recibo)', () => {
  it('reserva a mensagem antes do canal, assume a conversa e limpa o rascunho retido', () => {
    const d = reservarEnvioEquipe(base(), { id: ID, texto: 'Bom dia', autor: 'Equipe', agora });
    expect(d.acao).toBe('reservar');
    if (d.acao !== 'reservar') return;
    const m = d.conversa.mensagens.at(-1)!;
    expect(m).toMatchObject({ id: ID, de: 'escritorio', texto: 'Bom dia', autor: 'Equipe', dataHora: agora.toISOString(), envio: { estado: 'enviando' } });
    expect(m.status).toBeUndefined();
    expect(d.conversa.agenteAna?.humano).toBe(true);
    expect(d.conversa.iaRetida).toBeUndefined();
    // O eco do próprio número (message_create) é reconhecido como envio do sistema, não como resposta pelo celular.
    expect(mensagemDoSistema('Bom dia', d.conversa, new Date(agora.getTime() + 2000))).toBe(true);
  });

  it('nova tentativa com o mesmo id nunca duplica: devolve a já enviada', () => {
    const d = reservarEnvioEquipe(base(), { id: ID, texto: 'Bom dia', autor: 'Equipe', agora });
    if (d.acao !== 'reservar') throw new Error('esperava reserva');
    const enviada = concluirEnvioEquipe(d.conversa, ID, { status: 'enviada', canal: 'ultramsg', idExterno: '987' });
    expect(enviada.mensagens.at(-1)).toMatchObject({ status: 'enviada', idExterno: '987', canal: 'ultramsg' });
    expect(enviada.mensagens.at(-1)?.envio).toBeUndefined();
    const de_novo = reservarEnvioEquipe(enviada, { id: ID, texto: 'Bom dia', autor: 'Equipe', agora: new Date(agora.getTime() + 5000) });
    expect(de_novo.acao).toBe('jaEnviada');
    expect(enviada.mensagens.filter(m => m.id === ID)).toHaveLength(1);
  });

  it('reserva recente é envio em andamento; reserva órfã antiga exige conferência', () => {
    const d = reservarEnvioEquipe(base(), { id: ID, texto: 'Oi', autor: 'Equipe', agora });
    if (d.acao !== 'reservar') throw new Error('esperava reserva');
    expect(reservarEnvioEquipe(d.conversa, { id: ID, texto: 'Oi', autor: 'Equipe', agora: new Date(agora.getTime() + 1000) }).acao).toBe('emAndamento');
    const depois = new Date(agora.getTime() + ENVIO_EM_ANDAMENTO_MS + 1);
    expect(reservarEnvioEquipe(d.conversa, { id: ID, texto: 'Oi', autor: 'Equipe', agora: depois }).acao).toBe('conferir');
    expect(reservarEnvioEquipe(d.conversa, { id: ID, texto: 'Oi', autor: 'Equipe', agora: depois, reenvioConferido: true }).acao).toBe('reservar');
  });

  it('falha antes do canal permite nova tentativa; falha depois do canal exige conferência', () => {
    const d = reservarEnvioEquipe(base(), { id: ID, texto: 'Oi', autor: 'Equipe', agora });
    if (d.acao !== 'reservar') throw new Error('esperava reserva');
    const regra = falharEnvioEquipe(d.conversa, ID, 'Contato de WhatsApp não liberado para esta conversa. Nada foi enviado.', false, agora);
    expect(regra.mensagens.at(-1)?.envio).toMatchObject({ estado: 'falhou' });
    expect(reservarEnvioEquipe(regra, { id: ID, texto: 'Oi', autor: 'Equipe', agora }).acao).toBe('reservar');
    const canal = falharEnvioEquipe(d.conversa, ID, 'O envio pelo WhatsApp não foi concluído. Nada foi registrado como enviado.', true, agora);
    expect(reservarEnvioEquipe(canal, { id: ID, texto: 'Oi', autor: 'Equipe', agora }).acao).toBe('conferir');
    expect(falhaAmbigua('O envio pelo WhatsApp não foi concluído. Nada foi registrado como enviado.')).toBe(true);
    expect(falhaAmbigua('Número não autorizado nesta fase de produção.')).toBe(false);
  });

  it('falha nunca rebaixa mensagem que já tem recibo', () => {
    const d = reservarEnvioEquipe(base(), { id: ID, texto: 'Oi', autor: 'Equipe', agora });
    if (d.acao !== 'reservar') throw new Error('esperava reserva');
    const ok = concluirEnvioEquipe(d.conversa, ID, { status: 'enviada', canal: 'ultramsg' });
    expect(falharEnvioEquipe(ok, ID, 'x', true, agora).mensagens.at(-1)).toMatchObject({ status: 'enviada' });
  });

  it('id de mensagem do cliente nunca é usado para envio', () => {
    expect(() => reservarEnvioEquipe(base(), { id: 'm1', texto: 'x', autor: 'Equipe', agora })).toThrow();
  });
});

describe('fila de envio no navegador (otimista, em ordem, sem travar)', () => {
  afterEach(() => limparFilaEnvio());
  const esperar = (ms = 0) => new Promise(r => setTimeout(r, ms));

  it('mensagem aparece na hora e as seguintes saem em ordem, uma de cada vez por conversa', async () => {
    const ordem: string[] = []; let simultaneas = 0, maxSimultaneas = 0;
    const executar = async (p: MensagemPendente): Promise<ResultadoEnvioEquipe> => {
      simultaneas++; maxSimultaneas = Math.max(maxSimultaneas, simultaneas);
      await esperar(5); ordem.push(p.texto); simultaneas--; return { ok: true };
    };
    const t0 = performance.now();
    for (let i = 1; i <= 5; i++) enfileirarEnvio({ conversaId: 'c1', texto: `m${i}`, autor: 'Equipe' }, executar);
    const exibicao = performance.now() - t0;
    expect(pendentesAtuais().map(p => p.texto)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(exibicao).toBeLessThan(100);
    await esperar(80);
    expect(ordem).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(maxSimultaneas).toBe(1);
    expect(pendentesAtuais()).toHaveLength(0);
  });

  it('conversas diferentes não esperam uma pela outra', async () => {
    const inicio: string[] = [];
    let liberar!: () => void; const trava = new Promise<void>(r => { liberar = r; });
    enfileirarEnvio({ conversaId: 'lenta', texto: 'a', autor: 'E' }, async () => { inicio.push('lenta'); await trava; return { ok: true }; });
    enfileirarEnvio({ conversaId: 'rapida', texto: 'b', autor: 'E' }, async () => { inicio.push('rapida'); return { ok: true }; });
    await esperar(10);
    expect(inicio).toEqual(['lenta', 'rapida']);
    liberar(); await esperar(5);
  });

  it('falha fica visível com o motivo; nova tentativa usa o mesmo id e não duplica', async () => {
    const ids: string[] = []; let tentativa = 0;
    const executar = async (p: MensagemPendente): Promise<ResultadoEnvioEquipe> => { ids.push(p.id); tentativa++; return tentativa === 1 ? { ok: false, erro: 'Sem rede', ambiguo: false } : { ok: true }; };
    const id = enfileirarEnvio({ conversaId: 'c1', texto: 'Olá', autor: 'Equipe' }, executar);
    await esperar(5);
    expect(pendentesAtuais()[0]).toMatchObject({ id, estado: 'falhou', erro: 'Sem rede' });
    const c = base();
    expect(comPendentes(c, pendentesAtuais()).mensagens.at(-1)?.envio?.estado).toBe('falhou');
    reenviarMensagem({ id, conversaId: 'c1', texto: 'Olá', autor: 'Equipe' }, executar, false);
    await esperar(5);
    expect(ids).toEqual([id, id]);
    expect(pendentesAtuais()).toHaveLength(0);
  });

  it('erro de rede entre navegador e servidor vira falha recuperável (o servidor decide a duplicidade)', async () => {
    enfileirarEnvio({ conversaId: 'c1', texto: 'Olá', autor: 'Equipe' }, async () => { throw new Error('Failed to fetch'); });
    await esperar(5);
    expect(pendentesAtuais()[0]).toMatchObject({ estado: 'falhou', ambiguo: false });
  });

  it('versão do servidor com recibo substitui a pendente sem duplicar', async () => {
    let liberar!: () => void; const trava = new Promise<void>(r => { liberar = r; });
    const id = enfileirarEnvio({ conversaId: 'c1', texto: 'Olá', autor: 'Equipe' }, async () => { await trava; return { ok: true }; });
    const servidor: Conversa = { ...base(), mensagens: [...base().mensagens, { id, de: 'escritorio', texto: 'Olá', hora: '', dataHora: agora.toISOString(), status: 'enviada' }] };
    const exibida = comPendentes(servidor, pendentesAtuais());
    expect(exibida.mensagens.filter(m => m.id === id)).toHaveLength(1);
    // Enquanto o envio está na fila ou em andamento a pendente fica (só sai depois da resposta).
    resolverPendentes(pendentesResolvidos(servidor, pendentesAtuais()));
    expect(pendentesAtuais()).toHaveLength(1);
    liberar(); await esperar(5);
    expect(pendentesAtuais()).toHaveLength(0);
  });

  it('nova tentativa de falha gravada no servidor não se perde e aparece como enviando', async () => {
    const falhou: Conversa = { ...base(), mensagens: [...base().mensagens, { id: ID, de: 'escritorio', texto: 'Olá', hora: '', dataHora: agora.toISOString(), envio: { estado: 'falhou', reservadoEm: agora.toISOString() } }] };
    let chamou = 0; let liberar!: () => void; const trava = new Promise<void>(r => { liberar = r; });
    reenviarMensagem({ id: ID, conversaId: 'c1', texto: 'Olá', autor: 'Equipe' }, async () => { chamou++; await trava; return { ok: true }; }, false);
    resolverPendentes(pendentesResolvidos(falhou, pendentesAtuais()));
    expect(comPendentes(falhou, pendentesAtuais()).mensagens.at(-1)?.envio?.estado).toBe('enviando');
    expect(comPendentes(falhou, pendentesAtuais()).mensagens.filter(m => m.id === ID)).toHaveLength(1);
    await esperar(5); liberar(); await esperar(5);
    expect(chamou).toBe(1);
  });
});
