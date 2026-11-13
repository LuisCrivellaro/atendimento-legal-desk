import { describe, expect, it, vi, afterEach } from 'vitest';
import { chaveNomeContato, indexarNomesContatos, mesclarNomesAgenda, nomeContatoExibido } from '@/lib/atendimento/nomes-contatos';
import { matchesConversation } from '@/lib/atendimento';
const c={nome:'Perfil',telefone:'5511999990001'};
describe('nomes da agenda WhatsApp',()=>{
 it('nome da agenda prevalece sobre perfil e rótulo ProJuris, sem mudar nome legal',()=>{expect(nomeContatoExibido(c,{telefone:c.telefone,agenda:'Dra. contato salvo',perfil:'Perfil do usuário'},'RT - 00100 - CLIENTE')).toBe('Dra. contato salvo');expect(c.nome).toBe('Perfil');});
 it('identificação interna explícita prevalece',()=>{expect(nomeContatoExibido(c,{telefone:c.telefone,agenda:'Agenda',interno:'Identificação interna',perfil:'Perfil'})).toBe('Identificação interna');});
 it('perfil e telefone são fallbacks reais',()=>{expect(nomeContatoExibido(c,{telefone:c.telefone,perfil:'Perfil atualizado'})).toBe('Perfil atualizado');expect(nomeContatoExibido({...c,nome:''})).toBe(c.telefone);});
 it('somente isMyContact autoriza name como agenda',()=>{const r=indexarNomesContatos([{id:c.telefone+'@c.us',isMyContact:false,name:'Nunca chamar de agenda',pushname:'Perfil'}]);expect(r.contatos[chaveNomeContato(c.telefone)]?.agenda).toBeUndefined();expect(r.contatos[chaveNomeContato(c.telefone)]?.perfil).toBe('Perfil');});
 it('DDI DDD e nono dígito convergem, mas países e DDD distintos não',()=>{expect(chaveNomeContato('+55 (11) 99999-0001')).toBe(chaveNomeContato('11 9999-0001'));expect(chaveNomeContato('5521999990001')).not.toBe(chaveNomeContato(c.telefone));expect(chaveNomeContato('4411999990001')).not.toBe(chaveNomeContato(c.telefone));});
 it('duplicatas idênticas não criam contatos extras',()=>{const x={id:c.telefone+'@c.us',isMyContact:true,name:'Agenda'};expect(Object.keys(indexarNomesContatos([x,x]).contatos)).toHaveLength(1);});
 it('nomes conflitantes para mesmo número nunca escolhem arbitrariamente',()=>{const r=indexarNomesContatos([{id:c.telefone+'@c.us',isMyContact:true,name:'A'},{id:c.telefone+'@c.us',isMyContact:true,name:'B'}]);expect(r.ambiguos.size).toBe(1);expect(Object.keys(r.contatos)).toHaveLength(0);});
 it('atualização de perfil não apaga agenda conhecida ou alias',()=>{const k=chaveNomeContato(c.telefone);const a={contatos:{[k]:{telefone:c.telefone,agenda:'Agenda',interno:'Interno'}},sincronizadoEm:'antes',ambiguos:0};expect(mesclarNomesAgenda(a,{[k]:{telefone:c.telefone,perfil:'Novo perfil'}},'agora',0).contatos[k]).toEqual({telefone:c.telefone,agenda:'Agenda',interno:'Interno',perfil:'Novo perfil'});});
 it('novo nome salvo substitui apenas nome anterior da agenda',()=>{const k=chaveNomeContato(c.telefone);expect(mesclarNomesAgenda({contatos:{[k]:{telefone:c.telefone,agenda:'Antigo'}},sincronizadoEm:'a',ambiguos:0},{[k]:{telefone:c.telefone,agenda:'Novo'}},'b',0).contatos[k]?.agenda).toBe('Novo');});
 it('grupos e conta própria nunca viram contatos de conversa',()=>{expect(Object.keys(indexarNomesContatos([{id:'123@g.us',isGroup:true,name:'Grupo'},{id:c.telefone+'@c.us',isMe:true,name:'Escritório'}]).contatos)).toHaveLength(0);});
 it('nome exibido é pesquisável sem acento',()=>{expect(matchesConversation({...c,nome:nomeContatoExibido(c,{telefone:c.telefone,agenda:'Márcia trabalho'})} as Parameters<typeof matchesConversation>[0],'marcia')).toBe(true);});
});
afterEach(()=>vi.unstubAllGlobals());
import { fotoContatoValida as fotoValida } from '@/lib/atendimento/nomes-contatos';
describe('foto do contato', () => {
  it('aceita só URL HTTPS devolvida pela UltraMsg', () => {
    expect(fotoValida({ success: 'https://s3.amazonaws.com/x.jpg' })).toBe('https://s3.amazonaws.com/x.jpg');
    expect(fotoValida({ error: "user don't have picture" })).toBe('');
    expect(fotoValida({ success: 'http://x/y.jpg' })).toBe('');
  });
});
