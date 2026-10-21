// Substitui legalAI (servidor) na demonstração: respostas simuladas, sem chamada externa e sem prompts internos.
import { REVIEW_CATEGORIES } from '@/lib/office';
const AVISO = '(Resposta simulada — versão de demonstração. Na versão real, a IA do escritório gera este texto.)';
export async function legalAI(kind: 'petition' | 'audit' | 'training', context: string, area: string, _training: string) {
  await new Promise((r) => setTimeout(r, 1100));
  let c: any = {}; try { c = JSON.parse(context); } catch { /* ignora */ }
  const nome = c.cliente ?? 'Cliente';
  const primeiro = String(nome).split(' ')[0];
  const base = { memorial: '', pendencias: [] as string[], revisao: [] as any[], novosFatos: [] as string[] };
  if (kind === 'training') {
    const t = String(c.tarefa ?? '');
    if (t.startsWith('Resuma')) {
      const falt: string[] = c.faltantes ?? [];
      return { ...base, texto: `${nome} — etapa: ${c.etapa ?? 'não informada'}. ${falt.length ? `Documentos faltantes: ${falt.join(', ')}.` : 'Nenhum documento pendente.'} Início da espera: ${c.inicioEspera ?? 'não informado'}. ${AVISO}` };
    }
    if (t.startsWith('Traduza')) return { ...base, texto: `Em palavras simples: ${String(c.texto ?? '').trim() || 'houve uma movimentação no seu processo'}. A equipe vai acompanhar e avisar se for preciso fazer alguma coisa. ${AVISO}` };
    if (c.tarefa) return { ...base, texto: `Olá, ${primeiro}! Recebemos sua mensagem, obrigada. Vou verificar com a Dra. Carolina e retorno em breve com as orientações. ${AVISO}` };
    return { ...base, texto: `Olá! Obrigada pelo contato. Vou encaminhar sua dúvida para a advogada responsável, que vai orientar com segurança. ${AVISO}` };
  }
  if (kind === 'petition') {
    return { ...base, texto: `EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ___ VARA COMPETENTE\n\n${String(nome).toUpperCase()}, qualificação completa a conferir nos documentos, vem, por seus advogados, propor a presente\n\nAÇÃO (${area})\n\npelos fatos e fundamentos a seguir.\n\nI – DOS FATOS\n\n[Fatos extraídos do atendimento e dos documentos — revisar.]\n\nII – DO DIREITO\n\n[Fundamentação — citações sem fonte verificada ficam como pendência.]\n\nIII – DOS PEDIDOS\n\na) [pedido principal];\nb) a condenação nas verbas de sucumbência.\n\nDá-se à causa o valor de R$ [a calcular].\n\nNestes termos, pede deferimento.\n\n${AVISO}`, pendencias: ['Conferir qualificação completa', 'Calcular valor da causa'] };
  }
  return { ...base, texto: `Relatório de auditoria — ${nome}\n\nA análise foi feita apenas sobre os dados disponíveis na demonstração; nenhum anexo foi conferido. ${AVISO}`,
    revisao: REVIEW_CATEGORIES.map((item, i) => ({ item, status: i % 4 === 0 ? 'PENDENTE' : 'SIM', constatacao: i % 4 === 0 ? 'Não foi possível conferir na demonstração.' : 'Item conferido de forma simulada.', providencia: i % 4 === 0 ? 'Revisão humana necessária.' : '', localizacao: i % 4 === 0 ? '' : 'Minuta, item correspondente' })),
    pendencias: ['Revisão humana dos itens marcados como PENDENTE'], novosFatos: [] };
}
