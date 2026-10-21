import { z } from 'zod';
import type { AIMode } from '../atendimento';
import { forbiddenTopics, normalized } from '../atendimento';
import { validarTextoEnvio } from './canal-envio';

export const anaSchema = z.object({
  acao: z.enum(['enviar', 'rascunho', 'nenhuma']), mensagem: z.string(), motivo_aprovacao: z.string(),
  intencao: z.enum(['duvida_geral','novo_caso','agendamento','processo','documento','reclamacao','outro']),
  urgente: z.boolean(), encaminhar_humano: z.boolean(),
  dados_coletados: z.object({ nome:z.string(), cpf:z.string(), assunto:z.string(), email:z.string() }),
  proximo_passo: z.string(),
});
export type AnaResult = z.infer<typeof anaSchema>;
export interface AnaState {
  apresentado?: boolean; humano?: boolean; urgente?: boolean; motivo?: string; proximoPasso?: string;
  dados?: AnaResult['dados_coletados']; resultado?: AnaResult; erro?: string | undefined; pausa?: boolean;
}
export function expedienteAna(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/Sao_Paulo', weekday:'short', hour:'numeric', hourCycle:'h23' }).formatToParts(now);
  const weekday = parts.find(p=>p.type==='weekday')?.value;
  const hour = Number(parts.find(p=>p.type==='hour')?.value);
  return weekday !== 'Sat' && weekday !== 'Sun' && hour >= 8 && hour < 18;
}
export function mensagemSemResposta(texto: string, arquivo = false) {
  return !arquivo && ['', 'ok','obrigado','obrigada','recebi','beleza','certo','perfeito','combinado'].includes(normalized(texto));
}
export function aplicarRegrasAna(r:AnaResult, mode:AIMode, texto:string, proibidos:string[]):AnaResult {
  let result = { ...r, dados_coletados:{...r.dados_coletados} };
  const folded = texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const humano = /(?:falar|conversar|atendimento).{0,35}(?:pessoa|humano|equipe|advogad|carolina)|(?:pessoa|humano).{0,25}(?:falar|atender)/.test(folded);
  const etico = /honorari|ganhar|chance|vitoria|tenho direito|prescri|recorrer|estrategia|desistir|parte contraria|devo assinar/.test(folded);
  const urgent = /(?:risco.{0,15}vida|suicid|me matar|violencia|ameaca|perigo|citacao|oficial de justica|carta do forum|prazo.{0,25}(?:venc|amanha|hoje)|demitid.{0,30}(?:hoje|ontem|semana)|audiencia.{0,35}(?:hoje|amanha|semana))/.test(folded);
  const prohibited = etico || forbiddenTopics(texto,proibidos).length > 0 || forbiddenTopics(r.mensagem,proibidos).length > 0;
  if (humano || prohibited) result = {...result, encaminhar_humano:true};
  result.urgente ||= urgent;
  if(/risco.{0,15}vida|suicid|me matar|violencia|ameaca|perigo/.test(folded)&&!r.mensagem.includes('190'))result.mensagem=`${result.mensagem.trim()}\n\nSe houver perigo imediato, ligue 190.`.trim();
  const sensitive = prohibited || ['agendamento','processo','reclamacao'].includes(r.intencao) || /documentos? (?:faltantes|pendentes)/i.test(r.mensagem);
  if (sensitive || validarTextoEnvio(r.mensagem) && r.mensagem.trim()) result = {...result, acao:'rascunho',motivo_aprovacao:r.motivo_aprovacao || 'Revisão da equipe obrigatória; agenda real indisponível.'};
  if (mode==='Sugerir' && result.mensagem.trim()) result.acao='rascunho';
  if (mode==='Desligada') result = {...result,acao:'nenhuma',mensagem:''};
  if (result.acao==='enviar' && !['duvida_geral','novo_caso','documento','outro'].includes(result.intencao)) result.acao='rascunho';
  // Nunca exibir CPF completo, inclusive um CPF recém-coletado.
  result.mensagem = result.mensagem.replace(/\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g, cpf=>`••••••••${cpf.replace(/\D/g,'').slice(-3)}`);
  if (result.dados_coletados.cpf && !/^\d{11}$/.test(result.dados_coletados.cpf.replace(/\D/g,''))) result.dados_coletados.cpf='';
  return result;
}