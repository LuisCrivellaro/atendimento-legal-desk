/** Avaliação pura da saúde da Ana a partir de medições reais coletadas no servidor. */
export type EstadoServico = 'ok' | 'atencao' | 'falha';
export interface Servico { nome: string; estado: EstadoServico; detalhe: string }
export interface MedicoesAna {
  agora: number;
  backendOk: boolean;
  whatsapp: { configurado: boolean; status?: string; erro?: string };
  webhook: { correto?: boolean; erro?: string };
  ia: { chaveOk?: boolean; erro?: string; chamadasHoje: number; limite: number; bloqueadasHoje: number };
  ultimaExecucaoOk?: string | null;
  ultimaRecebida?: string | null;
  ultimaEnviada?: string | null;
  errosUltimas24h: number;
  pendentes: number;
  incertas: number;
  agendaErros24h: number;
  projuris?: { sincronizadoEm?: string | null; falhasProcessos: number } | undefined;
}
export interface SaudeAna extends Omit<MedicoesAna, 'agora'> { verificadoEm: string; geral: EstadoServico; servicos: Servico[]; alertas: string[] }

const h = 3600000;
export function avaliarSaude(m: MedicoesAna): SaudeAna {
  const s: Servico[] = [];
  s.push({ nome: 'Backend', estado: m.backendOk ? 'ok' : 'falha', detalhe: m.backendOk ? 'Banco respondendo' : 'Banco indisponível' });
  s.push({ nome: 'WhatsApp', estado: !m.whatsapp.configurado ? 'falha' : m.whatsapp.status === 'authenticated' ? 'ok' : 'falha', detalhe: !m.whatsapp.configurado ? 'Credenciais ausentes' : m.whatsapp.erro ?? `Instância: ${m.whatsapp.status ?? 'desconhecido'}` });
  s.push({ nome: 'Webhook', estado: m.webhook.correto ? 'ok' : 'falha', detalhe: m.webhook.erro ?? (m.webhook.correto ? 'Endereço de recebimento correto' : 'Endereço de recebimento diferente do publicado') });
  const uso = m.ia.limite ? m.ia.chamadasHoje / m.ia.limite : 0;
  s.push({ nome: 'IA (Claude)', estado: !m.ia.chaveOk ? 'falha' : m.ia.bloqueadasHoje > 0 || uso >= 0.8 ? 'atencao' : 'ok', detalhe: m.ia.erro ?? `${m.ia.chamadasHoje}/${m.ia.limite} chamadas hoje${m.ia.bloqueadasHoje ? ` · ${m.ia.bloqueadasHoje} bloqueadas pelo limite` : ''}` });
  s.push({ nome: 'Fila da Ana', estado: m.incertas > 0 ? 'atencao' : m.pendentes > 0 ? 'atencao' : 'ok', detalhe: `${m.pendentes} pendentes · ${m.incertas} com envio incerto` });
  s.push({ nome: 'Agendamentos', estado: m.agendaErros24h > 0 ? 'atencao' : 'ok', detalhe: `${m.agendaErros24h} falhas de agenda em 24h` });
  if (m.projuris) {
    const idade = m.projuris.sincronizadoEm ? m.agora - Date.parse(m.projuris.sincronizadoEm) : Infinity;
    s.push({ nome: 'Sincronização ProJuris', estado: idade > 24 * h || m.projuris.falhasProcessos > 0 ? 'atencao' : 'ok', detalhe: `${m.projuris.sincronizadoEm ? `Última em ${new Date(m.projuris.sincronizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Nunca sincronizado'} · ${m.projuris.falhasProcessos} processos com falha` });
  }
  const alertas = s.filter(x => x.estado === 'falha').map(x => `${x.nome}: ${x.detalhe}`);
  if (m.pendentes > 0 && m.ultimaRecebida && m.agora - Date.parse(m.ultimaRecebida) > 15 * 60000 && (!m.ultimaEnviada || Date.parse(m.ultimaEnviada) < Date.parse(m.ultimaRecebida))) alertas.push('Ana sem responder há mais de 15 minutos com mensagens pendentes');
  if (m.ia.bloqueadasHoje > 0) alertas.push('Limite diário de consumo de IA atingido');
  const geral: EstadoServico = alertas.length ? 'falha' : s.some(x => x.estado === 'atencao') ? 'atencao' : 'ok';
  const { agora, ...resto } = m;
  return { ...resto, verificadoEm: new Date(agora).toISOString(), geral, servicos: s, alertas };
}

/** Só alerta na transição para um conjunto novo de problemas (evita repetir o mesmo alerta a cada verificação). */
export function alertasNovos(anteriores: string[] | undefined, atuais: string[]) {
  const prev = new Set(anteriores ?? []);
  return atuais.filter(a => !prev.has(a));
}
