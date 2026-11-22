/**
 * Funil de consulta PAGA — Direito Internacional Brasil–Portugal (Dra. Carolina, 17/11/2026).
 * Só é ativado quando a primeira mensagem é o texto da landing page
 * https://carolinasantos.com.br/advogada-intenacional-brasil-portugal/
 */
import { validarNome } from './ana-rules';

export const LINK_MERCADO_PAGO = 'https://mpago.la/2EkJjJq';
export const CHAVE_PIX = '+5511918582706';
export const VALOR_CONSULTA = 'R$ 500 (aproximadamente € 90)';

export type EtapaFunil = 'nome' | 'pagamento' | 'pix' | 'link' | 'conferencia' | 'pago';
export interface FunilInternacional { etapa: EtapaFunil; inicio: string; nome?: string; forma?: 'pix' | 'link'; confirmadoEm?: string; confirmadoPor?: string }

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9()\- ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Mensagem única da landing page internacional (Dra. Carolina, 19/11/2026). */
const GATILHOS = new Set(['ola dra carolina gostaria de agendar uma consulta familia internacional']);

/** Reconhece a mensagem da landing page (tolerante a acentos, pontuação e espaços). */
export function gatilhoLandingInternacional(texto: string) { return GATILHOS.has(norm(texto)); }

export const MSG_BOAS_VINDAS = 'Olá, seja bem-vindo(a) à Equipe CS Lawyers! É um prazer tê-lo(a) conosco. 😊\n\nVamos iniciar seu agendamento. Por favor, nos informe seu nome completo.';
export const msgValor = (nome: string) => `Obrigada, ${nome.split(/\s+/)[0]}!\n\nNossa consulta inicial tem o valor mínimo estipulado pela tabela da OAB: ${VALOR_CONSULTA}. Caso feche negócio conosco, esse valor será abatido do valor do serviço jurídico acordado.\n\nO agendamento é feito mediante comprovante de pagamento. O pagamento pode ser feito da seguinte forma:\n\n1 - via PIX\n2 - link de pagamento\n\nQual das duas opções você deseja: 1 ou 2?`;
export const MSG_PIX = `Perfeito! Segue a chave PIX:\n\n🔑 ${CHAVE_PIX}\n\nValor: R$ 500. Após o pagamento, envie o comprovante aqui nesta conversa.`;
export const MSG_LINK = `Perfeito! Segue o link de pagamento do Mercado Pago:\n\n🔗 ${LINK_MERCADO_PAGO}\n\nApós o pagamento, envie o comprovante aqui nesta conversa.`;
export const MSG_CONFERENCIA = 'Recebemos seu comprovante, obrigada! Aguarde só um momento: nossa equipe vai conferir o pagamento e em seguida enviaremos os horários disponíveis para o seu agendamento.';
export const MSG_PEDIR_COMPROVANTE = 'Assim que concluir o pagamento, por favor envie o comprovante (foto ou PDF) aqui nesta conversa.';
export const MSG_ESCOLHA = 'Por favor, responda 1 para PIX ou 2 para link de pagamento.';
export const MSG_NOME = 'Para continuar, por favor informe seu nome completo (nome e sobrenome).';
export const MSG_PAGO = 'Pagamento confirmado! ✅ Muito obrigada.';
export const msgPagoComHorarios = (linhaHorarios: string, pergunta: string) => `${MSG_PAGO}\n\nEstes são os horários disponíveis para sua consulta com a Dra. Carolina (horário de Brasília):\n${linhaHorarios}\n\n${pergunta}`;
export const REGRAS_REAGENDAMENTO = 'ℹ️ Caso não possa comparecer à reunião virtual, desmarque com até 2 horas de antecedência, para que a consulta não seja contabilizada. É possível reagendar sem custo 1 vez; a partir do segundo reagendamento, será cobrada uma taxa de 35% do valor da consulta.';

export interface PassoFunil { mensagem: string; funil: FunilInternacional; nome?: string }

/** Próximo passo determinístico antes da confirmação do pagamento. `undefined` = sem resposta (aguardando equipe). */
export function passoFunil(f: FunilInternacional, texto: string, temArquivo: boolean): PassoFunil | undefined {
  const t = texto.trim();
  if (f.etapa === 'nome') {
    const nome = validarNome(t);
    return nome ? { mensagem: msgValor(nome), funil: { ...f, etapa: 'pagamento', nome }, nome } : { mensagem: MSG_NOME, funil: f };
  }
  if (f.etapa === 'pagamento') {
    if (/^(?:op[cç][aã]o\s*)?1\b|\bpix\b/i.test(t)) return { mensagem: MSG_PIX, funil: { ...f, etapa: 'pix', forma: 'pix' } };
    if (/^(?:op[cç][aã]o\s*)?2\b|\blink\b|cart[aã]o/i.test(t)) return { mensagem: MSG_LINK, funil: { ...f, etapa: 'link', forma: 'link' } };
    return { mensagem: MSG_ESCOLHA, funil: f };
  }
  if (f.etapa === 'pix' || f.etapa === 'link') {
    if (temArquivo || /comprovante|paguei|pago|transferi|feito o pagamento/i.test(t)) return { mensagem: MSG_CONFERENCIA, funil: { ...f, etapa: 'conferencia' } };
    return { mensagem: MSG_PEDIR_COMPROVANTE, funil: f };
  }
  return undefined;
}
