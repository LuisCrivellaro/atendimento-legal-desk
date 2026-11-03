import { chaveTelefone } from './telefone';

/** Lista de testes retirada em 03/11/2026 (produção aberta pela Dra.). Vazia: só a entrada aberta libera números. */
export const numerosUltraMsgPermitidos: readonly string[] = [];
/** Compares by DDD + last 8 digits because WhatsApp may omit the mobile ninth digit outside some DDDs. */
export function numeroUltraMsgPermitido(valor: string): boolean {
  if (/@(?:g\.us|broadcast|newsletter)$/.test(valor)) return false;
  const chave = chaveTelefone(valor.replace(/@.*$/, ''));
  return numerosUltraMsgPermitidos.some(numero => chaveTelefone(numero) === chave);
}

/**
 * Checagem única de produção, usada em todos os pontos de recebimento e envio do WhatsApp.
 * Entrada aberta (donaEntradaWhatsApp devolve uma conta): qualquer número é aceito.
 * Entrada fechada ou configuração indisponível: vale só a lista numerosUltraMsgPermitidos.
 * Grupos, listas de transmissão e canais são sempre recusados; contatos bloqueados são tratados na entrada.
 */
export function numeroWhatsAppAtendido(valor: string, entradaAberta: boolean): boolean {
  if (/@(?:g\.us|broadcast|newsletter)$/.test(valor)) return false;
  if (entradaAberta) return true;
  return numeroUltraMsgPermitido(valor);
}
