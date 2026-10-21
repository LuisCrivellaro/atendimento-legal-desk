import { describe,it,expect } from 'vitest';
import { aplicarRegrasAna, expedienteAna, mensagemSemResposta, type AnaResult } from '@/lib/atendimento/ana-rules';
const response:AnaResult={acao:'enviar',mensagem:'Sou Ana, assistente virtual. Como posso ajudar?',motivo_aprovacao:'',intencao:'duvida_geral',urgente:false,encaminhar_humano:false,dados_coletados:{nome:'',cpf:'',assunto:'',email:''},proximo_passo:''};
describe('limites Ana',()=>{
 it('Desligada não produz mensagem ao cliente',()=>expect(aplicarRegrasAna(response,'Desligada','Olá',[]).mensagem).toBe(''));
 it('Sugerir sempre retém a resposta para a equipe',()=>expect(aplicarRegrasAna(response,'Sugerir','Olá',[]).acao).toBe('rascunho'));
 it('Automática libera dúvida geral',()=>expect(aplicarRegrasAna(response,'Automática','Qual o expediente?',[]).acao).toBe('enviar'));
 it('processo sempre vira rascunho',()=>expect(aplicarRegrasAna({...response,intencao:'processo'},'Automática','Como está meu processo?',[]).acao).toBe('rascunho'));
 it('agenda sem ferramenta de reserva nunca é confirmada automaticamente',()=>expect(aplicarRegrasAna({...response,intencao:'agendamento'},'Automática','Marque amanhã',[]).acao).toBe('rascunho'));
 it('tema proibido retém e encaminha',()=>{const r=aplicarRegrasAna(response,'Automática','Quanto vou ganhar?',[]);expect(r.acao).toBe('rascunho');expect(r.encaminhar_humano).toBe(true);});
 it('pedido humano encaminha sem insistir',()=>expect(aplicarRegrasAna(response,'Automática','Quero falar com uma pessoa',[]).encaminhar_humano).toBe(true));
 it('citação e risco pessoal são urgentes',()=>{expect(aplicarRegrasAna(response,'Automática','Chegou um oficial de justiça',[]).urgente).toBe(true);expect(aplicarRegrasAna(response,'Automática','Estou em perigo',[]).urgente).toBe(true);});
 it('CPF completo nunca aparece',()=>expect(aplicarRegrasAna({...response,mensagem:'CPF 123.456.789-01'},'Automática','Olá',[]).mensagem).toBe('CPF ••••••••901'));
 it('CPF de menos de 11 dígitos não é aceito',()=>expect(aplicarRegrasAna({...response,dados_coletados:{...response.dados_coletados,cpf:'123'}},'Automática','123',[]).dados_coletados.cpf).toBe(''));
 it('não responde ok nem obrigado',()=>{expect(mensagemSemResposta('ok')).toBe(true);expect(mensagemSemResposta('obrigado')).toBe(true);expect(mensagemSemResposta('ok',true)).toBe(false);});
 it('expediente é 8 às 18 em Brasília segunda a sexta',()=>{expect(expedienteAna(new Date('2026-10-21T11:00:00Z'))).toBe(true);expect(expedienteAna(new Date('2026-10-21T21:00:00Z'))).toBe(false);expect(expedienteAna(new Date('2026-10-24T14:00:00Z'))).toBe(false);expect(expedienteAna(new Date('2026-10-21T10:59:00Z'))).toBe(false);});
});