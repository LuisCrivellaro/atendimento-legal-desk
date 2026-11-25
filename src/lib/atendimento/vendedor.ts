import type { Conversa } from '../mock-data';
import { expedienteColeta } from './coleta';

/**
 * Atendente vendedor (P1-3): construído e DESLIGADO por padrão (`automations.vendedor`, só sênior/admin altera).
 * Um único follow-up para lead novo que recebeu horários reais e não escolheu em 24 h. Sem preço, sem promessa,
 * sem pressão; nunca depois de recusa ou pedido para parar; nunca para cliente da casa.
 */
export const ESPERA_FOLLOWUP_MS = 24 * 3600_000;
/** Texto PROPOSTO (editável aqui); os horários vêm sempre da agenda real, logo abaixo. */
export const TEXTO_FOLLOWUP_VENDEDOR = 'Oi{nome}! Tudo bem? 😊\nPassando para lembrar que a primeira consulta com a Dra. Carolina é on-line e gratuita.';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function recusaOuParar(texto: string) {
  return /nao tenho interesse|sem interesse|nao quero|nao preciso|nao vou querer|pode parar|pare de|parar de|nao me mande|nao mande mais|desisto|ja resolvi|ja contratei|outro advogado|remover|descadastr/.test(fold(texto));
}

export interface EntradaVendedor {
  ligado: boolean;
  conversa: Pick<Conversa, 'etapa' | 'tipoClienteAgenda' | 'consultaAgendada' | 'mensagens' | 'agenteAna' | 'modoIA'>;
  modo: 'Desligada' | 'Sugerir' | 'Automática';
}

/** Decide sem efeitos. Devolve o momento da oferta que motiva o follow-up (um por oferta). */
export function decidirFollowupVendedor(e: EntradaVendedor, agora = new Date()): { ofertaEm: string } | undefined {
  const c = e.conversa;
  if (!e.ligado || e.modo !== 'Automática' || !expedienteColeta(agora)) return undefined;
  if (c.etapa !== 'inicial' || c.tipoClienteAgenda === 'cadastrado' || c.agenteAna?.tipoCliente === 'cadastrado' || c.consultaAgendada) return undefined;
  if (c.agenteAna?.humano || c.agenteAna?.pausa || c.agenteAna?.horarioPendente) return undefined;
  if (!(c.agenteAna?.agendaReal && (c.agenteAna.horariosApresentados?.length ?? 0) > 0)) return undefined;
  const ordenadas = c.mensagens.filter(m => m.dataHora && Number.isFinite(Date.parse(m.dataHora))).sort((a, b) => Date.parse(a.dataHora ?? '') - Date.parse(b.dataHora ?? ''));
  const ultima = ordenadas.at(-1);
  // A última mensagem é a oferta do escritório: o cliente não respondeu nada depois dela.
  if (!ultima || ultima.de !== 'escritorio' || !/Tenho estes horários livres|Temos horários|Qual (?:fica|desses)/i.test(ultima.texto)) return undefined;
  if (agora.getTime() - Date.parse(ultima.dataHora ?? '') < ESPERA_FOLLOWUP_MS) return undefined;
  if (ordenadas.some(m => m.de === 'cliente' && recusaOuParar(m.texto))) return undefined;
  if (c.agenteAna?.followupVendedor?.ofertaEm === ultima.dataHora) return undefined;
  return { ofertaEm: ultima.dataHora ?? '' };
}

export function textoFollowupVendedor(nome: string, listaHorarios: string) {
  const p = nome.trim().split(/\s+/)[0] ?? '';
  const n = p ? `, ${p.charAt(0).toLocaleUpperCase('pt-BR')}${p.slice(1).toLocaleLowerCase('pt-BR')}` : '';
  return `${TEXTO_FOLLOWUP_VENDEDOR.replace('{nome}', n)}\n\n${listaHorarios}`;
}
