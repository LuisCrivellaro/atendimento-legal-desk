import type { Funcionalidade } from './config';
import type { CodigoMotivo, ResultadoMotor } from './motor';
import type { AutomacaoAtiva } from './automacoes';
import type { ModoAnne } from './modos';

/** Modo persistido da conversa. O efetivo é o mais restritivo entre este e os campos antigos (ver modos.ts). */
export interface EstadoModo {
  modo: ModoAnne;
  definidoEm: string;
  definidoPor: 'equipe' | 'sistema';
  /** Nome curto de quem definiu (equipe) ou da regra (sistema). */
  autor?: string | undefined;
  motivo?: string | undefined;
}

/** Histórico de decisões da Anne (executadas e bloqueadas), sem texto de cliente nem dados pessoais. */
export interface RegistroAcao {
  id: string;
  em: string;
  funcionalidade: Funcionalidade | 'modo';
  resultado: ResultadoMotor | 'executada' | 'falhou';
  motivo: CodigoMotivo;
  /** Motivo legível para a equipe (gerado pelo motor; nunca contém o texto do cliente). */
  texto: string;
  automacaoId?: string | undefined;
}

/** Reserva de envio de uma automação: gravada antes da chamada ao canal, conferida no envio e no eco. */
export interface ReservaEnvioAutomacao {
  automacaoId: string;
  /** Mensagem do cliente que originou a resposta (respostas dentro de uma automação). */
  mensagemOrigem?: string | undefined;
  texto: string;
  desde: string;
  /** Revisão do controle humano no momento da reserva: se mudar (equipe escreveu, modo alterado), nada sai. */
  controleHumanoEm?: string | undefined;
}

/** Estado da secretaria digital dentro de `agenteAna.secretaria` (JSON do caso, sem migração). */
export interface EstadoSecretaria {
  modo?: EstadoModo | undefined;
  automacoes?: AutomacaoAtiva[] | undefined;
  acoes?: RegistroAcao[] | undefined;
  envio?: ReservaEnvioAutomacao | undefined;
}

export const LIMITE_ACOES = 60;

/** Acrescenta ao histórico mantendo só as últimas `LIMITE_ACOES` (o mesmo id nunca duplica). */
export function registrarAcao(acoes: RegistroAcao[] | undefined, nova: RegistroAcao): RegistroAcao[] {
  const atual = acoes ?? [];
  if (atual.some(a => a.id === nova.id)) return atual;
  return [...atual, nova].slice(-LIMITE_ACOES);
}
