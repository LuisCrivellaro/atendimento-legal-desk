import type { Mensagem } from '../mock-data';
export function mensagemDoAgente(m:Mensagem):boolean {
 return m.de==='escritorio'&&(/^(?:ana|ia)\b/i.test(m.autor?.trim()??'')||!!m.respostaAnaDe);
}
export function podeApagarParaTodos(m:Mensagem):boolean {
 return mensagemDoAgente(m)&&m.canal==='ultramsg'&&!!m.idExterno&&m.status!=='simulada'&&!m.apagadaParaTodos;
}