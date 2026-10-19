import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarCasos, salvarCaso } from "@/lib/casos";
import { toast } from "sonner";
import {
  Search, Paperclip, Mic, Image as ImageIcon, Send, Video, CalendarClock, FileStack, FileSignature,
  CreditCard, CalendarCheck, ListChecks, Sparkles, Check, X, Pencil, FolderOpen, FileText, CheckCircle2,
  Circle, AlertTriangle, Play, Upload, RefreshCw, Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { etapaLabel, naoPodeDizer, sugestoesIA, PIPELINE, type Conversa, type Etapa, type Mensagem } from "@/lib/mock-data";
import { n8n } from "@/services/n8n";
import { AnaliseDocumento } from "@/components/analise-documento";

export const Route = createFileRoute("/_authenticated/atendimento")({
  head: () => ({
    meta: [
      { title: "Atendimento — Manager ADV" },
      { name: "description", content: "Central de atendimento via WhatsApp do escritório CS Lawyers." },
      { property: "og:title", content: "Atendimento — Manager ADV" },
      { property: "og:description", content: "Central de atendimento via WhatsApp do escritório CS Lawyers." },
    ],
  }),
  component: Atendimento,
});

const etapaCor: Record<Etapa, string> = {
  inicial: "bg-pending text-pending-foreground",
  documentos: "bg-secondary text-secondary-foreground border border-primary/30",
  ativo: "bg-success text-success-foreground",
};
const iniciais = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("");
const agora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

// Executa ação com loading/sucesso/erro + tentar novamente
async function executar(label: string, fn: () => Promise<unknown>, onOk?: () => void) {
  const id = toast.loading(`${label}…`);
  try {
    await fn();
    toast.success(`${label}: concluído`, { id });
    onOk?.();
  } catch (e) {
    toast.error(`${label}: falhou`, { id, description: (e as Error).message, action: { label: "Tentar novamente", onClick: () => executar(label, fn, onOk) } });
  }
}

function Atendimento() {
  const { data, isLoading, error } = useQuery({ queryKey: ["casos"], queryFn: listarCasos });
  if (isLoading) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando casos…</div>;
  if (error) return <div className="p-8 text-destructive">Não foi possível carregar os casos.</div>;
  if (!data?.length) return <div className="p-8 text-muted-foreground">Nenhum caso cadastrado para você ainda.</div>;
  return <AtendimentoTela inicial={data} />;
}

function AtendimentoTela({ inicial }: { inicial: Conversa[] }) {
  const [lista, setLista] = useState<Conversa[]>(inicial);
  const [selId, setSelId] = useState(inicial[0]!.id);
  useEffect(() => { setLista(inicial); }, [inicial]);
  const [filtro, setFiltro] = useState<"inicial" | "documentos" | "ativo" | "todos">("todos");
  const [busca, setBusca] = useState("");
  const sel = lista.find((c) => c.id === selId) ?? lista[0]!;

  const update = (id: string, fn: (c: Conversa) => Conversa) => {
    const antes = lista.find((c) => c.id === id);
    if (!antes) return;
    const depois = fn(antes);
    setLista((l) => l.map((c) => (c.id === id ? depois : c)));
    salvarCaso(antes, depois).catch(() => toast.error("Não foi possível salvar a alteração."));
  };
  const addMsg = (texto: string, extra: Partial<Mensagem> = {}) =>
    update(sel.id, (c) => ({ ...c, mensagens: [...c.mensagens, { id: crypto.randomUUID(), de: "escritorio", texto, hora: agora(), ...extra }] }));

  const visiveis = lista.filter((c) => (filtro === "todos" || c.etapa === filtro) && c.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="grid h-[calc(100svh-4rem)] grid-cols-[300px_1fr_360px] grid-rows-[minmax(0,1fr)] overflow-hidden">
      {/* Esquerda */}
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r bg-card">
        <div className="space-y-3 border-b p-3">
          <h1 className="text-xl font-semibold">Conversas</h1>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente" className="pl-8" />
          </div>
          <div className="flex flex-wrap gap-1">
            {([["todos", "Todos"], ["inicial", "Atendimento inicial"], ["documentos", "Coleta de documentos"], ["ativo", "Clientes ativos"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)} className={cn("rounded-full border px-2.5 py-1 text-xs transition", filtro === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{l}</button>
            ))}
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {visiveis.map((c) => {
            const ult = c.mensagens[c.mensagens.length - 1];
            return (
              <button key={c.id} onClick={() => setSelId(c.id)}
                className={cn("flex w-full gap-3 border-b px-3 py-3 text-left transition hover:bg-accent", c.id === selId && "bg-accent")}>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{iniciais(c.nome)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.nome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ult?.hora}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{ult?.texto || `📎 ${ult?.arquivo}`}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", etapaCor[c.etapa])}>{etapaLabel[c.etapa]}</span>
                    {c.naoLidas > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{c.naoLidas}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </aside>

      <Chat key={sel.id} c={sel} addMsg={addMsg} update={(fn) => update(sel.id, fn)} />
      <PainelProJuris c={sel} update={(fn) => update(sel.id, fn)} />
    </div>
  );
}

function Chat({ c, addMsg, update }: { c: Conversa; addMsg: (t: string, e?: Partial<Mensagem>) => void; update: (fn: (c: Conversa) => Conversa) => void }) {
  const [texto, setTexto] = useState("");
  const [ia, setIa] = useState(true);
  const [sugestao, setSugestao] = useState<string | null>(sugestoesIA[c.id] ?? null);
  const [editando, setEditando] = useState(false);
  const [horariosOpen, setHorariosOpen] = useState(false);
  const [retornoOpen, setRetornoOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const alerta = sugestao ? naoPodeDizer.find((t) => sugestao.toLowerCase().includes(t)) : undefined;

  const enviar = async (t: string) => {
    if (!t.trim()) return;
    setEnviando(true);
    await executar("Enviar mensagem", () => n8n.enviarMensagem({ conversaId: c.id, texto: t }), () => { addMsg(t); setTexto(""); });
    setEnviando(false);
  };

  const acoes = [
    { label: "Enviar horários", icon: CalendarClock, run: () => setHorariosOpen(true) },
    { label: "Solicitar documentos base", icon: FileStack, run: () => executar("Solicitar documentos", () => n8n.solicitarDocumentos({ conversaId: c.id }), () => addMsg("Olá! Para darmos andamento, envie por aqui: RG ou CNH, CPF, comprovante de residência, carteira de trabalho, extrato CNIS e laudos médicos.")) },
    { label: "Gerar contrato", icon: FileSignature, run: () => executar("Gerar contrato", () => n8n.gerarContrato({ clienteId: c.id }), () => { update((x) => ({ ...x, contrato: "enviado" })); addMsg("Segue o link para assinatura digital do contrato: https://app.zapsign.com.br/demo"); }) },
    { label: "Cobrança", icon: CreditCard, run: () => executar("Gerar cobrança", () => n8n.gerarCobranca({ clienteId: c.id, valor: 350 }), () => addMsg("Segue o link de pagamento: https://mpago.la/demo")) },
    { label: "Agendar retorno", icon: CalendarCheck, run: () => setRetornoOpen(true), disabled: c.etapa !== "ativo" },
    { label: "Lista de provas", icon: ListChecks, run: () => executar("Enviar lista de provas", () => n8n.enviarListaProvas({ conversaId: c.id }), () => addMsg("Para fortalecer seu caso, precisamos também de: exames de imagem recentes, receitas médicas e atestados de afastamento.")) },
  ];

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-chat-bg">
      <div className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{iniciais(c.nome)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{c.nome}</p>
          <p className="text-xs text-muted-foreground">{c.telefone} · {c.atendimento}</p>
        </div>
        <label className="flex items-center gap-2 text-xs"><Sparkles className="size-4 text-primary" />IA ativa nesta conversa<Switch checked={ia} onCheckedChange={setIa} /></label>
        <Button variant="outline" size="sm" onClick={() => setVideoOpen(true)}><Video />Videochamada</Button>
      </div>

      <Pipeline c={c} />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-4">
          {c.mensagens.map((m) => (
            <div key={m.id} className={cn("flex", m.de === "escritorio" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-soft", m.de === "escritorio" ? "bg-bubble-out" : "bg-bubble-in")}>
                {m.tipo === "documento" || m.tipo === "imagem" ? (
                  <div className="flex items-center gap-2"><FileText className="size-5 text-primary" /><span className="font-medium">{m.arquivo}</span></div>
                ) : m.tipo === "audio" ? (
                  <div className="flex items-center gap-2"><Play className="size-4 text-primary" /><div className="h-1 w-32 rounded bg-primary/30" /><span className="text-xs">{m.arquivo}</span></div>
                ) : <p className="whitespace-pre-wrap">{m.texto}</p>}
                {m.salvoStart && <span className="mt-1 inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"><FolderOpen className="size-3" />salvo na pasta Start</span>}
                <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{m.hora}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {ia && sugestao && (
        <div className="mx-4 mb-2 rounded-lg border-l-4 border-primary bg-secondary p-3 shadow-soft">
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-secondary-foreground"><Sparkles className="size-3.5" />Sugestão da IA</p>
          {editando ? <Textarea value={sugestao} onChange={(e) => setSugestao(e.target.value)} className="bg-card" /> : <p className="text-sm">{sugestao}</p>}
          {alerta && <p className="mt-2 flex items-center gap-1 rounded bg-pending px-2 py-1 text-xs text-pending-foreground"><AlertTriangle className="size-3.5" />Atenção: a resposta toca um tema da lista “não pode dizer” ({alerta}). Revise antes de enviar.</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => { enviar(sugestao); setSugestao(null); }}><Check />Enviar</Button>
            <Button size="sm" variant="outline" onClick={() => setEditando((v) => !v)}><Pencil />{editando ? "Concluir" : "Editar"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSugestao(null)}><X />Descartar</Button>
          </div>
        </div>
      )}

      <div className="border-t bg-card">
        <div className="flex gap-1.5 overflow-x-auto px-3 pt-2">
          {acoes.map((a) => (
            <Button key={a.label} size="sm" variant="secondary" disabled={a.disabled} onClick={a.run} className="shrink-0" title={a.disabled ? "Disponível apenas para clientes ativos" : undefined}><a.icon />{a.label}</Button>
          ))}
        </div>
        <div className="flex items-center gap-1 p-3">
          <Button size="icon" variant="ghost" onClick={() => addMsg("", { tipo: "documento", arquivo: "documento_enviado.pdf" })}><Paperclip /></Button>
          <Button size="icon" variant="ghost" onClick={() => addMsg("", { tipo: "imagem", arquivo: "imagem.jpg" })}><ImageIcon /></Button>
          <Button size="icon" variant="ghost" onClick={() => addMsg("", { tipo: "audio", arquivo: "Áudio 0:12" })}><Mic /></Button>
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar(texto)} placeholder="Digite uma mensagem" className="flex-1" />
          <Button size="icon" onClick={() => enviar(texto)} disabled={enviando}>{enviando ? <Loader2 className="animate-spin" /> : <Send />}</Button>
        </div>
      </div>

      <HorariosDialog open={horariosOpen} onOpenChange={setHorariosOpen} sextas={false}
        onConfirm={(h) => executar("Enviar horários", () => n8n.enviarHorarios({ conversaId: c.id, horarios: h }), () =>
          addMsg(`Olá! Sou a assessora da Dra. Carolina Santos. Temos os seguintes horários disponíveis para sua consulta (30 min):\n${h.map((x) => `• ${x}`).join("\n")}\nQual fica melhor para você?`))} />
      <HorariosDialog open={retornoOpen} onOpenChange={setRetornoOpen} sextas
        onConfirm={(h) => executar("Agendar retorno", () => n8n.agendarRetorno({ clienteId: c.id, horario: h[0] ?? "" }), () => addMsg(`Seu retorno com a Dra. Carolina está agendado para ${h[0]} (15 a 20 min).`))} />

      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Iniciar videochamada</DialogTitle></DialogHeader>
          <p className="rounded bg-pending px-3 py-2 text-sm text-pending-foreground">Aviso: a chamada será gravada e transcrita. O cliente será informado no início.</p>
          <DialogFooter><Button onClick={() => { setVideoOpen(false); toast.success("Videochamada iniciada (demonstração)"); }}><Video />Iniciar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function proximosDias(sextas: boolean) {
  const dias: Date[] = [];
  const d = new Date();
  while (dias.length < 3) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (sextas ? w === 5 : w > 0 && w < 6) dias.push(new Date(d));
  }
  return dias;
}

function HorariosDialog({ open, onOpenChange, sextas, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; sextas: boolean; onConfirm: (h: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const dias = useMemo(() => proximosDias(sextas), [sextas]);
  const slots = sextas ? ["14:00", "14:20", "14:40", "15:00", "15:20", "16:00"] : ["09:00", "10:30", "14:00", "15:30", "17:00"];
  const max = sextas ? 1 : 6;
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= max ? (max === 1 ? [k] : s) : [...s, k]));
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSel([]); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{sextas ? "Agendar retorno — sextas à tarde (15 a 20 min)" : "Enviar horários — 2 por dia, 30 min"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          {dias.map((d) => {
            const dl = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
            return (
              <div key={dl} className="rounded-lg border p-2">
                <p className="mb-2 text-sm font-semibold capitalize">{dl}</p>
                <div className="flex flex-wrap gap-1">
                  {slots.map((s) => { const k = `${dl} às ${s}`; return (
                    <button key={k} onClick={() => toggle(k)} className={cn("rounded border px-2 py-1 text-xs", sel.includes(k) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{s}</button>
                  ); })}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <span className="mr-auto text-sm text-muted-foreground">{sel.length} selecionado(s)</span>
          <Button disabled={!sel.length} onClick={() => { onConfirm(sel); onOpenChange(false); setSel([]); }}><Send />Enviar ao cliente</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pipeline({ c }: { c: Conversa }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b bg-card px-4 py-2">
      {PIPELINE.map((p, i) => {
        const done = i < c.etapaPipeline, atual = i === c.etapaPipeline, s = c.syncs[i];
        return (
          <div key={p} className="flex shrink-0 items-center gap-1" title={done ? `ProJuris: ${s ?? "pendente"}` : undefined}>
            <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              done ? "bg-secondary text-secondary-foreground" : atual ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {done ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}{p}
              {done && <span className={cn("size-1.5 rounded-full", s === "sincronizado" ? "bg-success" : s === "erro" ? "bg-destructive" : "bg-pending")} />}
            </span>
            {i < PIPELINE.length - 1 && <span className="text-muted-foreground">›</span>}
          </div>
        );
      })}
    </div>
  );
}

function PainelProJuris({ c, update }: { c: Conversa; update: (fn: (c: Conversa) => Conversa) => void }) {
  const recebidos = c.documentos.filter((d) => d.recebido).length;
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l bg-card">
      <div className="border-b p-3"><h2 className="section-title text-lg">ProJuris</h2></div>
      <Tabs defaultValue="cliente" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-4">
          <TabsTrigger value="cliente">Cliente</TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="consulta">Consulta</TabsTrigger>
          <TabsTrigger value="tempo">Histórico</TabsTrigger>
        </TabsList>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="cliente" className="space-y-4 p-3">
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Nome</dt><dd className="font-medium">{c.nome}</dd>
              <dt className="text-muted-foreground">CPF</dt><dd>{c.cpf}</dd>
              <dt className="text-muted-foreground">Telefone</dt><dd>{c.telefone}</dd>
              <dt className="text-muted-foreground">Atendimento</dt><dd>{c.atendimento}</dd>
              <dt className="text-muted-foreground">Contrato</dt><dd><StatusContrato s={c.contrato} /></dd>
            </dl>
            <a href="#" onClick={(e) => { e.preventDefault(); toast.info("Abriria a pasta no Google Drive (demonstração)"); }} className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-accent">
              <FolderOpen className="size-4 text-primary" /><span className="truncate">{c.nome} – {c.atendimento} › Start</span>
            </a>
            <div>
              <h3 className="mb-2 text-base font-semibold">Processos ({c.processos.length})</h3>
              {c.processos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum processo vinculado ainda.</p>}
              {c.processos.map((p) => (
                <div key={p.cnj} className="mb-2 rounded-lg border-l-4 border-primary bg-secondary p-2.5 text-sm">
                  <p className="font-mono text-xs font-semibold">{p.cnj}</p>
                  <p className="text-xs text-muted-foreground">{p.vara}</p>
                  <p className="mt-1">{p.status}</p>
                  <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px]", p.homologado ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}>{p.homologado ? "Homologado" : "Não homologado"}</span>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="docs" className="p-3">
            <p className="mb-2 text-sm text-muted-foreground">{recebidos} de {c.documentos.length} recebidos</p>
            <div className="mb-3 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(recebidos / c.documentos.length) * 100}%` }} /></div>
            <ul className="space-y-1.5">
              {c.documentos.map((d) => (
                <li key={d.nome} className="flex items-center gap-2 text-sm">
                  {d.recebido ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-destructive" />}
                  <span className={cn(!d.recebido && "rounded bg-pending px-1 text-pending-foreground")}>{d.nome}</span>
                </li>
              ))}
            </ul>
            <AnaliseDocumento key={c.id} c={c} update={update} />
          </TabsContent>
          <TabsContent value="consulta" className="space-y-3 p-3">
            {c.consulta ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border p-2">
                  <Button size="icon" variant="secondary"><Play /></Button>
                  <div className="h-1.5 flex-1 rounded bg-muted"><div className="h-1.5 w-1/3 rounded bg-primary" /></div>
                  <span className="text-xs text-muted-foreground">{c.consulta.duracao}</span>
                </div>
                <div><h3 className="section-title mb-1 text-sm">Sumarização</h3><p className="text-sm">{c.consulta.resumo}</p></div>
                <div><h3 className="section-title mb-1 text-sm">Transcrição</h3><p className="whitespace-pre-wrap font-doc text-sm">{c.consulta.transcricao}</p></div>
              </>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">Consulta ainda não registrada. Se foi feita fora da plataforma, envie os arquivos:</p>
                <Button variant="outline" className="w-full" onClick={() => toast.success("Transcrição enviada (demonstração)")}><Upload />Enviar transcrição</Button>
                <Button variant="outline" className="w-full" onClick={() => toast.success("Sumarização enviada (demonstração)")}><Upload />Enviar sumarização</Button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="tempo" className="p-3">
            <ol className="relative ml-2 border-l-2 border-primary/40">
              {c.timeline.map((t) => (
                <li key={t.data + t.evento} className="mb-3 ml-4">
                  <span className="absolute -left-[7px] mt-1 size-3 rounded-full bg-primary" />
                  <p className="text-xs text-muted-foreground">{t.data}</p><p className="text-sm">{t.evento}</p>
                </li>
              ))}
            </ol>
            <Button variant="ghost" size="sm" onClick={() => executar("Sincronizar ProJuris", () => n8n.sincronizarEtapaProjuris({ casoId: c.id, etapa: PIPELINE[c.etapaPipeline] ?? "" }))}><RefreshCw />Sincronizar com ProJuris</Button>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}

function StatusContrato({ s }: { s?: Conversa["contrato"] }) {
  if (!s) return <span className="text-muted-foreground">Não gerado</span>;
  const steps = ["gerado", "enviado", "visualizado", "assinado"] as const;
  const idx = steps.indexOf(s);
  return (
    <div className="flex gap-1">
      {steps.map((x, i) => <span key={x} className={cn("rounded px-1 text-[10px]", i <= idx ? (x === "assinado" ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground") : "bg-muted text-muted-foreground")}>{x}</span>)}
    </div>
  );
}
