import { describe, expect, it } from 'vitest';
import type { Conversa } from '@/lib/mock-data';
import { classificarMensagemComercial, contextoFiltroComercial, registrarFiltroComercial } from '@/lib/atendimento/filtro-comercial';
import { needsReply } from '@/lib/atendimento';

// Textos fictícios. Nenhum contato real.
const novo = { contatoConhecido: false };
const conhecido = { contatoConhecido: true };
const r = (texto: string, ctx = novo) => classificarMensagemComercial(texto, ctx).resultado;

describe('filtro comercial: ignora propaganda, prospecção e robôs', () => {
  it.each([
    ['promoção com cupom e link', 'Promoção imperdível! Cupom de 30% de desconto só hoje: www.exemplo.com'],
    ['black friday', '🔥 BLACK FRIDAY! Aproveite 50% OFF em todos os planos. Garanta já o seu: https://loja.exemplo.com/?utm_source=zap'],
    ['curso com inscrições e descadastro', 'Inscrições abertas para o curso online de oratória! Vagas limitadas. Para não receber mais mensagens, responda SAIR.'],
    ['webinar para advogados', 'Webinar gratuito para advogados que querem dobrar o faturamento. Inscreva-se pelo link: https://bit.ly/x'],
    ['marketing jurídico para o escritório', 'Olá! Somos uma agência de marketing jurídico para escritórios de advocacia. Gostaria de apresentar nossa solução de captação de clientes. Podemos agendar uma reunião?'],
    ['software para escritório', 'Bom dia, doutora! Conhece nosso sistema para advogados? Teste grátis por 15 dias. Planos a partir de R$ 99.'],
    ['robô de atendimento', 'Olá! Sou a assistente virtual da Clínica Exemplo. Digite o número da opção desejada: 1 - Agendamentos 2 - Financeiro'],
    ['resposta automática com protocolo', 'Esta é uma mensagem automática. Seu protocolo de atendimento nº 123456 foi gerado. Em breve um de nossos atendentes falará com você.'],
    ['newsletter', 'Newsletter semanal: as novidades do mercado jurídico. Para não receber, responda PARE.'],
    ['assinatura', 'Assine já o plano premium por apenas R$ 29,90 e tenha acesso ilimitado. Condição especial por tempo limitado!'],
  ])('%s → comercial', (_nome, texto) => {
    expect(r(texto)).toBe('comercial');
  });
});

describe('filtro comercial: nunca ignora quem procura atendimento jurídico sobre ofertas, contratos, planos ou cobranças', () => {
  it.each([
    ['plano de saúde negado', 'Boa tarde, meu plano de saúde negou a cirurgia e continuam cobrando a mensalidade. Vocês atendem esse tipo de caso?'],
    ['oferta de acordo recebida', 'Recebi uma oferta de acordo do banco com desconto de 40% para quitar a dívida. É golpe? Quero uma consulta.'],
    ['curso que não consegue cancelar', 'Comprei um curso online com desconto e não consigo cancelar, eles continuam me cobrando.'],
    ['assinatura cobrada indevidamente', 'Fui cobrado por uma assinatura que eu já tinha cancelado, cobrança indevida no cartão. O que faço?'],
    ['promoção não cumprida', 'Comprei na promoção da Black Friday e a loja não devolveu meu dinheiro. Tenho direito?'],
    ['contrato de plano', 'Quero cancelar meu contrato do plano de academia e não deixam, cobram multa abusiva.'],
    ['pergunta simples', 'Oi, boa tarde'],
    ['trabalhista', 'Fui demitido semana passada e não pagaram minha rescisão. A doutora atende trabalhista?'],
    ['agenda', 'Quero marcar uma consulta para amanhã'],
  ])('%s → atender', (_nome, texto) => {
    expect(r(texto)).toBe('atender');
  });

  it('na dúvida, vai em silêncio para a equipe (nunca descarta sozinho)', () => {
    expect(r('Bom dia! Gostaria de apresentar nossos serviços, com quem posso falar?')).toBe('duvida');
    // Só o assunto jurídico em material comercial: a equipe vê antes.
    expect(r('Curso online sobre aposentadoria: inscrições abertas, vagas limitadas!')).toBe('duvida');
  });

  it('contato já conhecido nunca é ignorado automaticamente', () => {
    const texto = 'Promoção imperdível! Cupom de 30% de desconto só hoje: www.exemplo.com';
    expect(r(texto, conhecido)).toBe('duvida');
    expect(r('Aproveite!', conhecido)).toBe('atender');
  });
});

function conversa(extra: Partial<Conversa> = {}): Conversa {
  return { id: 'c-teste', nome: 'Contato fictício', cpf: '', telefone: '5511999990000', atendimento: 'AT-T', etapa: 'inicial', naoLidas: 0, etapaPipeline: 0, syncs: [], processos: [], documentos: [], mensagens: [], timeline: [], ...extra };
}

describe('filtro comercial: contexto e registro', () => {
  it('conversa com o escritório, consulta, contrato ou cadastro torna o contato conhecido', () => {
    const msg = { id: 'm1', de: 'cliente' as const, texto: 'promo', hora: '' };
    expect(contextoFiltroComercial(conversa({ mensagens: [msg] }), 'm1').contatoConhecido).toBe(false);
    expect(contextoFiltroComercial(conversa({ mensagens: [{ id: 'e', de: 'escritorio', texto: 'Olá', hora: '' }, msg] }), 'm1').contatoConhecido).toBe(true);
    expect(contextoFiltroComercial(conversa({ mensagens: [msg], consultaAgendada: '2026-12-01T12:00:00Z' }), 'm1').contatoConhecido).toBe(true);
    expect(contextoFiltroComercial(conversa({ mensagens: [msg], tipoClienteAgenda: 'cadastrado' }), 'm1').contatoConhecido).toBe(true);
  });

  it('comercial fica marcado no histórico, sem aviso, e sai da fila de respostas da equipe', () => {
    const texto = 'Promoção imperdível! Cupom de 30% de desconto só hoje: www.exemplo.com';
    const c = conversa({ mensagens: [{ id: 'm1', de: 'cliente', texto, hora: '', iaExecucao: { estado: 'executando', tentativas: 1, desde: '2026-11-26T12:00:00Z' } }] });
    const x = registrarFiltroComercial(c, 'm1', classificarMensagemComercial(texto, novo), new Date('2026-11-26T12:00:01Z'));
    expect(x.mensagens[0]).toMatchObject({ texto, filtroComercial: { resultado: 'comercial' }, iaExecucao: { estado: 'concluida' } });
    expect(x.avisosEquipe ?? []).toHaveLength(0);
    expect(needsReply(x)).toBe(false);
  });

  it('dúvida gera um único aviso interno de triagem e continua na fila da equipe', () => {
    const texto = 'Bom dia! Gostaria de apresentar nossos serviços, com quem posso falar?';
    const c = conversa({ mensagens: [{ id: 'm1', de: 'cliente', texto, hora: '' }] });
    const cls = classificarMensagemComercial(texto, novo);
    const x = registrarFiltroComercial(registrarFiltroComercial(c, 'm1', cls), 'm1', cls);
    expect(x.avisosEquipe?.filter(a => a.tipo === 'triagem')).toHaveLength(1);
    expect(needsReply(x)).toBe(true);
  });
});
