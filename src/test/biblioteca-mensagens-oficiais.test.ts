import { describe, expect, it } from 'vitest';
import type { Conversa } from '@/lib/mock-data';
import { IDS_TEMPLATES, TEMPLATES_OFICIAIS, variaveisPermitidas, type IdTemplate } from '@/lib/atendimento/biblioteca/mensagens-oficiais';
import { lerBiblioteca, paraWhatsApp, renderizarOficial, templateVigente, variaveisPendentes, versaoValida } from '@/lib/atendimento/biblioteca/renderizar';
import { nomeVerificado, pedidoRedeSocial, periodoForaExpediente, politicaConsultaDia, rascunhoComunicacaoEvento, saudacaoPrimeiroAtendimento, textoAgendamentoConfirmado, textoConfirmacaoDoDia, textoForaDoHorario, textoLembreteDoDia, textoReagendamentoHoje } from '@/lib/atendimento/biblioteca/selecao';

// Dados fictícios. Nenhuma mensagem é enviada nestes testes.
const VALORES: Record<string, string> = {
  '[nome]': 'Maria', '[nome do cliente]': 'Maria', '[horário]': '14h30', '[horário 1]': '9h', '[horário 2]': '15h',
  '[data]': '27/11/2026', '[dia da semana]': 'sexta-feira', '[dia]': 'sexta-feira',
  '[tipo da audiência / modalidade]': 'audiência de instrução', '[número do processo]': '1000000-00.2026.5.02.0001',
  '[vara responsável]': '1ª Vara do Trabalho de São Paulo', '[Endereço completo]': 'Av. Exemplo, 100, São Paulo/SP',
  '[endereço completo]': 'Rua Fictícia, 200, São Paulo/SP', '[endereço]': 'Rua Fictícia, 200, São Paulo/SP',
  '[número]': '1000000-00.2026.5.02.0001', '[presencial/online]': 'presencial', '[tipo de audiência]': 'instrução',
  '[tipo da audiência]': 'instrução', '[Endereço ou link]': 'Av. Exemplo, 100, São Paulo/SP', '[antecedência]': '1 hora de antecedência',
  '[tipo de perícia]': 'perícia médica',
};
const EMOJI = /\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*/gu;
const emojis = (t: string) => [...t.matchAll(EMOJI)].map(m => m[0]);

describe('biblioteca oficial: 19 modelos com metadados completos', () => {
  it('tem exatamente os 19 modelos com id, texto, gatilho, condições, fontes, ativação e aprovação', () => {
    expect(IDS_TEMPLATES).toEqual(['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07.1', 'T07.2', 'T07.3', 'T08.1', 'T08.2', 'T09', 'T10.1', 'T10.2', 'T11.1', 'T11.2', 'T12.1', 'T12.2', 'T12.3']);
    for (const id of IDS_TEMPLATES) {
      const t = TEMPLATES_OFICIAIS[id];
      expect(t.id).toBe(id);
      expect(t.versao).toBe(1);
      expect(t.texto.length).toBeGreaterThan(10);
      expect(t.gatilho.length).toBeGreaterThan(10);
      expect(['ativo', 'manual', 'aguardando_aprovacao']).toContain(t.ativacao);
      for (const v of variaveisPermitidas(id)) expect(t.fontes[v], `${id} ${v}`).toBeTruthy();
    }
  });
  it('consulta paga, audiência/perícia sem rotina e checklist trabalhista não saem automaticamente', () => {
    for (const id of ['T04', 'T07.2', 'T07.3', 'T11.2', 'T12.2', 'T12.3'] as IdTemplate[]) expect(TEMPLATES_OFICIAIS[id].ativacao).toBe('aguardando_aprovacao');
    expect(TEMPLATES_OFICIAIS.T09.ativacao).toBe('manual');
  });
});

describe('fidelidade textual: só as variáveis mudam', () => {
  it.each(IDS_TEMPLATES)('%s — mesmo texto, mesmos emojis e assinatura, nenhuma variável pendente', id => {
    const r = renderizarOficial(id, VALORES, { exigirAtivo: false });
    if (!r.ok) throw new Error(`não renderizou: ${JSON.stringify(r)}`);
    const oficial = TEMPLATES_OFICIAIS[id].texto;
    // Desfazendo a troca das variáveis, volta exatamente ao texto oficial.
    let desfeito = r.texto;
    for (const v of [...variaveisPermitidas(id)].sort((a, b) => VALORES[b]!.length - VALORES[a]!.length)) desfeito = desfeito.split(VALORES[v]!).join(v);
    expect(desfeito).toBe(oficial);
    expect(emojis(r.texto)).toEqual(emojis(oficial));
    expect(r.texto.split('\n').at(-1)).toBe(oficial.split('\n').at(-1));
    expect(variaveisPendentes(r.texto)).toEqual([]);
    expect(r.texto.split('\n').length).toBe(oficial.split('\n').length);
  });

  it.each(IDS_TEMPLATES)('%s — snapshot do texto preenchido', id => {
    const r = renderizarOficial(id, VALORES, { exigirAtivo: false });
    expect(r.ok && r.texto).toMatchSnapshot();
  });

  it('textos idênticos aos recebidos (amostras conferidas caractere a caractere)', () => {
    expect(TEMPLATES_OFICIAIS.T02.texto).toBe('Olá! Bom dia 😊\nPassando para confirmar o seu atendimento hoje às [horário] ✅, ok?\nEquipe CS Advocacia ⚖️');
    expect(TEMPLATES_OFICIAIS['T08.1'].texto).toContain('pedimos a gentileza de avisar com 1 hora de antecedência. 🙏🏻\nEquipe CS Advocacia ⚖️');
    expect(TEMPLATES_OFICIAIS['T10.1'].texto).toBe('https://www.instagram.com/carolinasantoslawyer');
    expect(TEMPLATES_OFICIAIS['T10.2'].texto).toBe('https://www.linkedin.com/in/carolina-santos-654918254/');
    expect(TEMPLATES_OFICIAIS.T03.texto.endsWith('Equipe CS Advocacia ⚖️😊')).toBe(true);
  });

  it('campo ausente, vazio ou com quebra/colchete bloqueia (nunca inventa nem reinsere variável)', () => {
    expect(renderizarOficial('T01', { '[horário]': '9h' })).toMatchObject({ ok: false, motivo: 'variavel_ausente', faltando: ['[nome]'] });
    expect(renderizarOficial('T01', { '[nome]': '  ', '[horário]': '9h' })).toMatchObject({ ok: false });
    expect(renderizarOficial('T01', { '[nome]': 'Maria\nJosé', '[horário]': '9h' })).toMatchObject({ ok: false });
    expect(renderizarOficial('T01', { '[nome]': '[nome]', '[horário]': '9h' })).toMatchObject({ ok: false });
  });

  it('modelo manual ou aguardando aprovação nunca é usado automaticamente', () => {
    expect(renderizarOficial('T09', {})).toMatchObject({ ok: false, motivo: 'inativo' });
    expect(renderizarOficial('T07.2', VALORES)).toMatchObject({ ok: false, motivo: 'inativo' });
    expect(renderizarOficial('T04', VALORES)).toMatchObject({ ok: false, motivo: 'inativo' });
  });

  it('conversão para o WhatsApp não muda o conteúdo visível', () => {
    expect(paraWhatsApp('**Atenção** e __hoje__')).toBe('*Atenção* e _hoje_');
    for (const id of IDS_TEMPLATES) expect(paraWhatsApp(TEMPLATES_OFICIAIS[id].texto)).toBe(TEMPLATES_OFICIAIS[id].texto);
  });
});

describe('versões: só com as mesmas variáveis, histórico preservado', () => {
  it('nova versão não pode criar variável nova; texto inválido salvo é ignorado', () => {
    expect(versaoValida('T02', 'Olá! Boa tarde 😊\nConfirmando hoje às [horário], ok?')).toBe(true);
    expect(versaoValida('T02', 'Olá [nome]! hoje às [horário]')).toBe(false);
    const b = lerBiblioteca({ versoes: { T02: [{ versao: 2, texto: 'Olá [nome]!', autor: 'x', em: '2026-11-26' }, { versao: 3, texto: 'Confirmando às [horário] ✅', autor: 'Dra.', em: '2026-11-26' }] } });
    expect(templateVigente('T02', b)).toMatchObject({ versao: 3, texto: 'Confirmando às [horário] ✅' });
    expect(renderizarOficial('T02', { '[horário]': '9h' }, { biblioteca: b })).toMatchObject({ ok: true, versao: 3, texto: 'Confirmando às 9h ✅' });
  });
  it('consulta paga: só a versão escolhida pela advogada pode ficar ativa', () => {
    expect(templateVigente('T07.2', lerBiblioteca({ ativacao: { 'T07.2': 'ativo' } })).ativacao).toBe('aguardando_aprovacao');
    expect(templateVigente('T07.2', lerBiblioteca({ consultaPaga: 'T07.2', ativacao: { 'T07.2': 'ativo', 'T07.3': 'ativo' } })).ativacao).toBe('ativo');
    expect(templateVigente('T07.3', lerBiblioteca({ consultaPaga: 'T07.2', ativacao: { 'T07.2': 'ativo', 'T07.3': 'ativo' } })).ativacao).toBe('aguardando_aprovacao');
  });
});

describe('compatibilidade com a situação real', () => {
  const MANHA = new Date('2026-11-26T11:00:00Z'); // 8h em São Paulo
  const TARDE = new Date('2026-11-26T17:00:00Z'); // 14h
  it('confirmação do dia: 02 só de manhã ("Bom dia"); à tarde vale 08.2', () => {
    expect(textoConfirmacaoDoDia('2026-11-26T12:30:00Z', MANHA)).toMatchObject({ id: 'T02', texto: 'Olá! Bom dia 😊\nPassando para confirmar o seu atendimento hoje às 9h30 ✅, ok?\nEquipe CS Advocacia ⚖️' });
    expect(textoConfirmacaoDoDia('2026-11-26T18:00:00Z', TARDE)).toMatchObject({ id: 'T08.2', texto: expect.stringContaining('📆 Agendada para hoje, quinta-feira, 26/11/2026, às 15h. ✅') });
    expect(textoConfirmacaoDoDia('2026-11-27T18:00:00Z', TARDE)).toBeUndefined();
  });
  it('lembrete 01: precisa de manhã, consulta hoje e nome do cadastro', () => {
    const c = { nome: 'WhatsApp ••••0000', nomePerfilWhatsApp: 'Mah', agenteAna: { dados: { nome: 'maria teste', cpf: '', assunto: '', email: '' } } } as Pick<Conversa, 'nome' | 'agenteAna' | 'nomePerfilWhatsApp'>;
    expect(textoLembreteDoDia(c, '2026-11-26T17:00:00Z', MANHA)).toMatchObject({ ok: true, texto: expect.stringMatching(/^Oi, Maria! Bom dia 😊\n[\s\S]*hoje, às 14h\. ✅/) });
    expect(textoLembreteDoDia(c, '2026-11-26T19:00:00Z', TARDE)).toMatchObject({ ok: false, motivo: 'incompativel' });
    expect(textoLembreteDoDia({ nome: 'WhatsApp ••••0000', agenteAna: {} }, '2026-11-26T17:00:00Z', MANHA)).toMatchObject({ ok: false, motivo: 'variavel_ausente' });
  });
  it('agendamento 08.1: só de manhã e sem link do Meet a entregar; senão a confirmação aprovada com o link', () => {
    expect(textoAgendamentoConfirmado({ inicio: '2026-11-30T13:00:00Z' }, 'Maria', MANHA)).toMatchObject({ id: 'T08.1', texto: expect.stringContaining('📆 Sua consulta está agendada para segunda-feira, 30/11/2026, às 10h. ✅') });
    expect(textoAgendamentoConfirmado({ inicio: '2026-11-30T13:00:00Z', meetUrl: 'https://meet.google.com/abc-defg-hij' }, 'Maria', MANHA)).toMatchObject({ id: 'anterior', texto: expect.stringContaining('meet.google.com/abc-defg-hij') });
    expect(textoAgendamentoConfirmado({ inicio: '2026-11-30T13:00:00Z' }, 'Maria', TARDE).id).toBe('anterior');
    expect(textoAgendamentoConfirmado({ inicio: '2026-11-30T13:00:00Z' }, 'Maria', MANHA, { funilInternacional: true }).id).toBe('anterior');
  });
  it('reagendamento 06: só com dois horários livres HOJE (nunca troca "Hoje" por outro dia)', () => {
    const hoje = ['2026-11-26T17:00:00Z', '2026-11-26T19:00:00Z'];
    expect(textoReagendamentoHoje('Maria', hoje, MANHA)).toMatchObject({ id: 'T06', opcoes: hoje, texto: expect.stringContaining('Hoje temos disponibilidade às 14h ou às 16h.') });
    expect(textoReagendamentoHoje('Maria', ['2026-11-26T17:00:00Z', '2026-11-27T19:00:00Z'], MANHA)).toBeUndefined();
    expect(textoReagendamentoHoje(undefined, hoje, MANHA)).toBeUndefined();
  });
  it('primeiro atendimento 07.1: só com nome e dois horários amanhã; senão a saudação aprovada anterior', () => {
    const amanha = ['2026-11-27T12:00:00Z', '2026-11-27T18:00:00Z'];
    expect(saudacaoPrimeiroAtendimento('ATUAL', { nome: 'joana', horarios: amanha, agora: MANHA })).toMatchObject({ id: 'T07.1', texto: expect.stringContaining('Temos horários amanhã, sexta-feira, às 9h ou às 15h.') });
    expect(saudacaoPrimeiroAtendimento('ATUAL', { horarios: amanha, agora: MANHA })).toEqual({ id: 'anterior', texto: 'ATUAL' });
    expect(saudacaoPrimeiroAtendimento('ATUAL', { nome: 'Joana', horarios: ['2026-11-26T18:00:00Z', '2026-11-27T18:00:00Z'], agora: MANHA }).id).toBe('anterior');
  });
  it('Instagram/LinkedIn só quando a mensagem pede o perfil', () => {
    expect(pedidoRedeSocial('Qual o Instagram da doutora?')).toBe('T10.1');
    expect(pedidoRedeSocial('me passa o linkedin dela')).toBe('T10.2');
    expect(pedidoRedeSocial('vi vocês no instagram e quero uma consulta sobre minha demissão, fui mandado embora ontem sem receber nada e preciso entender meus direitos com calma, pode ser?')).toBeUndefined();
  });
  it('fora do horário 03: uma vez por período fora do expediente', () => {
    const noite = new Date('2026-11-26T23:30:00Z'); // 20h30 SP
    const periodo = periodoForaExpediente(noite);
    expect(periodo).toBe('2026-11-27T11:00:00.000Z');
    expect(periodoForaExpediente(new Date('2026-11-26T15:00:00Z'))).toBeUndefined();
    expect(textoForaDoHorario(undefined, noite)).toMatchObject({ id: 'T03', periodo });
    expect(textoForaDoHorario(periodo, noite)).toBeUndefined();
  });
  it('[nome] só do cadastro: nunca o rótulo do WhatsApp nem o nome do perfil', () => {
    expect(nomeVerificado({ nome: 'WhatsApp ••••1234', agenteAna: {} })).toBeUndefined();
    expect(nomeVerificado({ nome: 'Mah ❤', nomePerfilWhatsApp: 'Mah ❤', agenteAna: {} })).toBeUndefined();
    expect(nomeVerificado({ nome: 'RT - 12345 - JOANA TESTE', agenteAna: {} })).toBe('Joana');
    expect(nomeVerificado({ nome: 'x', agenteAna: { vinculoProjuris: { codigoPessoa: 1, nome: 'ANA PAULA FICTICIA', status: 'confirmado', origem: 'telefone', desde: '' } } })).toBe('Ana');
  });
});

describe('audiência e perícia: rascunho para a revisora sem cortar o texto oficial', () => {
  it('campos sem dado ficam visíveis e bloqueiam a entrega até a revisão completar', () => {
    const r = rascunhoComunicacaoEvento({ tipo: 'audiencia', data: '10/12/2026', hora: '14h30', numero: '1000000-00.2026.5.02.0001' }, 'Maria');
    expect(r.id).toBe('T11.1');
    expect(r.texto).toContain('📆 Data: 10/12/2026');
    expect(r.faltando).toEqual(['[presencial/online]', '[tipo de audiência]', '[vara responsável]', '[Endereço ou link]']);
    expect(variaveisPendentes(r.texto)).toEqual(r.faltando);
    const completo = rascunhoComunicacaoEvento({ tipo: 'pericia', data: '10/12/2026', hora: '9h', local: 'Rua Fictícia, 200' }, undefined);
    expect(completo).toMatchObject({ id: 'T12.1', faltando: [] });
  });
});

describe('política anti-redundância (01, 02 e 08.2)', () => {
  const inicio = '2026-11-26T17:00:00.000Z';
  const base = { mensagens: [], agenteAna: {} } as Pick<Conversa, 'mensagens' | 'agenteAna'>;
  it('um lembrete e uma confirmação por consulta, no máximo', () => {
    expect(politicaConsultaDia(base, inicio, 'lembrete', new Date('2026-11-26T11:00:00Z'))).toEqual({ permitido: true });
    expect(politicaConsultaDia({ ...base, agenteAna: { lembreteConsulta: { inicio, enviadoEm: '2026-11-26T11:00:00Z' } } }, inicio, 'lembrete')).toMatchObject({ permitido: false });
    expect(politicaConsultaDia({ ...base, agenteAna: { confirmacao40: { inicio, enviadoEm: '2026-11-26T16:15:00Z' } } }, inicio, 'confirmacao')).toMatchObject({ permitido: false });
  });
  it('confirmação não sai se o cliente já confirmou, se o lembrete é recente ou se a equipe já confirmou', () => {
    const agora = new Date('2026-11-26T16:15:00Z');
    expect(politicaConsultaDia({ ...base, agenteAna: { lembreteConsulta: { inicio, enviadoEm: '2026-11-26T11:00:00Z', confirmadoEm: '2026-11-26T11:05:00Z' } } }, inicio, 'confirmacao', agora)).toMatchObject({ permitido: false, motivo: expect.stringMatching(/já confirmou/) });
    expect(politicaConsultaDia({ ...base, agenteAna: { lembreteConsulta: { inicio, enviadoEm: '2026-11-26T15:30:00Z' } } }, inicio, 'confirmacao', agora)).toMatchObject({ permitido: false, motivo: expect.stringMatching(/90 minutos/) });
    expect(politicaConsultaDia({ ...base, agenteAna: { lembreteConsulta: { inicio, enviadoEm: '2026-11-26T11:00:00Z' } } }, inicio, 'confirmacao', agora)).toEqual({ permitido: true });
    const equipe = { ...base, mensagens: [{ id: 'e', de: 'escritorio' as const, texto: 'Oi! Confirmando sua consulta hoje às 14h, ok?', hora: '', dataHora: '2026-11-26T15:00:00Z', autor: 'Dra. Carolina' }] };
    expect(politicaConsultaDia(equipe, inicio, 'confirmacao', agora)).toMatchObject({ permitido: false, motivo: expect.stringMatching(/equipe/) });
  });
});
