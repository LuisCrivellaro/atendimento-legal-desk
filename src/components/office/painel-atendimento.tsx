import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { lerResumoPainelAnne } from '@/lib/atendimento/painel-atendimento.functions';

/** Resumo do Atendimento dentro de "Automações do atendimento": audiências, perícias, aprovações e documentos. */
export function PainelAtendimento() {
  const ler = useServerFn(lerResumoPainelAnne);
  const { data } = useQuery({ queryKey: ['painel-atendimento'], queryFn: () => ler(), staleTime: 60000, refetchInterval: 300000, retry: false });
  if (!data) return null;
  return (
    <section aria-label="Resumo do atendimento" className="space-y-1 border-b pb-3 text-xs">
      <p className="text-muted-foreground">
        {data.aprovacoesPendentes} aprovação(ões) jurídica(s) pendente(s) · {data.documentosPendentes.itens} documento(s) pendente(s) em {data.documentosPendentes.conversas} atendimento(s)
      </p>
      <details>
        <summary className="cursor-pointer font-medium text-muted-foreground">Audiências e perícias futuras: {data.eventos.length}</summary>
        <ul className="space-y-0.5 pt-1">
          {data.eventos.length ? data.eventos.map((e, i) => <li key={i}>{e.data}{e.hora ? ` às ${e.hora}` : ''} · {e.tipo === 'audiencia' ? 'Audiência' : 'Perícia'} · {e.nome} · {e.estado}</li>) : <li className="text-muted-foreground">Nenhuma registrada.</li>}
        </ul>
      </details>
      {!!data.modelosAguardando.length && (
        <details>
          <summary className="cursor-pointer font-medium text-muted-foreground">Modelos oficiais aguardando a Dra.: {data.modelosAguardando.length}</summary>
          <ul className="space-y-0.5 pt-1">{data.modelosAguardando.map(m => <li key={m.id}>{m.id} · {m.titulo}</li>)}</ul>
          <p className="pt-1 text-muted-foreground">A infraestrutura já está pronta; ative na Biblioteca de mensagens quando aprovar.</p>
        </details>
      )}
    </section>
  );
}
