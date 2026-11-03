// Lista de pessoas do ProJuris para consulta ao vivo na página Clientes. Nada é gravado no Manager.
// Campos seguem a resposta real de pessoa/consulta (lista `pessoaConsulta`).

export interface ClienteProjurisDiretorio {
  codigo: number;
  nome: string;
  tipo: string;
  cpfCnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  nascimento: string | null;
  classificacoes: string | null;
  habilitado: boolean;
  incluidoEm: string | null;
  nomeExibicao?: string;
  acoes?: string;
  /** Motivo de nome incompleto (processo sem número identificador ou sem tipo RT/AC). */
  nomePendencia?: string;
  processosAtivos?: number;
}

type Obj = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
export function dataCadastro(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
  }
  const d = new Date(typeof v === 'number' ? v : String(v));
  if (!Number.isFinite(d.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(p => [p.type, p.value]));
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}
const data = dataCadastro;

export const INICIO_COORTE = '2025-01-01';
export const pertenceCoorte = (c: Pick<ClienteProjurisDiretorio, 'incluidoEm'>) => !!c.incluidoEm && c.incluidoEm >= INICIO_COORTE;

/** Somente sinais explícitos da API. Justiça estadual sozinha não comprova ação cível. */
export function acaoDoProcesso(r: Obj): 'RT' | 'AC' | undefined {
  const valor = (v: unknown): string => typeof v === 'string' ? v : v && typeof v === 'object' ? valor((v as Obj)['valor'] ?? (v as Obj)['nome']) : '';
  const s = fold([r['area'], r['tipoJustica'], r['classeCnj'], r['assunto']].map(valor).join(' '));
  if (/trabalh|reclamacao trabalhista/.test(s)) return 'RT';
  if (/\bcivel\b|\bcivil\b|acao de alimentos|alimentos|indeniza|consumidor/.test(s)) return 'AC';
  return undefined;
}

/**
 * Número identificador do processo (campo `identificador`, ex.: "PRO.0000149") com 5 dígitos: "00149".
 * Nunca usa codigoProcesso/codigoPessoa. Sem número válido devolve undefined.
 */
export function numeroIdentificadorProcesso(r: Obj): string | undefined {
  const id = typeof r['identificador'] === 'string' ? r['identificador'].trim() : '';
  const m = /^(?:[A-Za-z]+\.)?(\d{1,12})$/.exec(id);
  if (!m?.[1]) return undefined;
  const d = m[1];
  if (d.length <= 5) return d.padStart(5, '0');
  return /^0+$/.test(d.slice(0, d.length - 5)) ? d.slice(-5) : d;
}

/** "RT - 00034 - NOME COMPLETO"; vários processos: "RT - 00149 / AC - 00150 - NOME". Partes sem número ou tipo não entram. */
export function nomeClienteProjuris(nome: string, processosAtivos: Obj[]): { nome: string; pendencia?: string } {
  const nomeMaiusculo = nome.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  const partes: string[] = [];
  let semNumero = 0, semTipo = 0;
  for (const p of [...processosAtivos].sort((a, b) => String(a['identificador'] ?? '').localeCompare(String(b['identificador'] ?? '')))) {
    const acao = acaoDoProcesso(p), numero = numeroIdentificadorProcesso(p);
    if (!numero) { semNumero++; continue; }
    if (!acao) { semTipo++; continue; }
    const parte = `${acao} - ${numero}`;
    if (!partes.includes(parte)) partes.push(parte);
  }
  const pend = [semNumero ? `${semNumero} processo(s) sem número identificador` : '', semTipo ? `${semTipo} processo(s) sem tipo RT/AC` : ''].filter(Boolean).join(' · ');
  return { nome: partes.length ? `${partes.join(' / ')} - ${nomeMaiusculo}` : nomeMaiusculo, ...(pend || !partes.length ? { pendencia: pend || 'Falta o número identificador do processo' } : {}) };
}

export function clienteDiretorioDe(r: Obj): ClienteProjurisDiretorio | undefined {
  const codigo = r['codigoPessoa'];
  const nome = txt(r['nome']);
  if (typeof codigo !== 'number' || !Number.isSafeInteger(codigo) || codigo <= 0 || !nome) return undefined;
  const rua = [txt(r['logradouro']), txt(r['numero']), txt(r['complemento'])].filter(Boolean).join(', ');
  const endereco = [rua, txt(r['bairro']), txt(r['cep'])].filter(Boolean).join(' · ') || null;
  return {
    codigo, nome,
    tipo: txt(r['tipoPessoa']) ?? '',
    cpfCnpj: txt(r['cpfOuCnpj']), telefone: txt(r['telefonePrincipal']), email: txt(r['emailPrincipal']),
    endereco, cidade: txt(r['cidadePrincipal']), estado: txt(r['estadoPrincipal']),
    nascimento: data(r['dataNascimento']), classificacoes: txt(r['classificacoes']),
    habilitado: r['habilitado'] === true, incluidoEm: data(r['dtInclusao']),
  };
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const digitos = (s: string) => s.replace(/\D/g, '');

/** Busca por nome, CPF/CNPJ, telefone, e-mail ou cidade; página começa em 0. */
export function filtrarDiretorio(lista: ClienteProjurisDiretorio[], busca: string, pagina: number, porPagina: number) {
  const b = fold(busca.trim());
  const d = digitos(busca);
  const achados = !b ? lista : lista.filter(c =>
    fold([c.nome, c.nomeExibicao, c.email, c.cidade].filter(Boolean).join(' ')).includes(b) ||
    (d.length >= 3 && [c.cpfCnpj, c.telefone].some(v => v && digitos(v).includes(d))));
  const ordenados = [...achados].sort((a, z) => a.nome.localeCompare(z.nome, 'pt-BR'));
  const inicio = Math.max(0, pagina) * porPagina;
  return { total: ordenados.length, itens: ordenados.slice(inicio, inicio + porPagina) };
}
