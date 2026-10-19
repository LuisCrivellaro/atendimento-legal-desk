import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analisarDocumento, type ResultadoAnalise } from "@/lib/documentos.functions";
import type { Conversa } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const toBase64 = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

type Analise = { arquivo: string; resultado: ResultadoAnalise };

export function AnaliseDocumento({ c, update }: { c: Conversa; update: (fn: (c: Conversa) => Conversa) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const analisar = useServerFn(analisarDocumento);
  const [carregando, setCarregando] = useState<string | null>(null);
  const [analises, setAnalises] = useState<Analise[]>([]);

  const processar = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) return toast.error("Arquivo muito grande (máx. 10 MB)");
    setCarregando(f.name);
    try {
      const base64 = await toBase64(f);
      const r = await analisar({ data: { filename: f.name, mimeType: f.type, base64, checklist: c.documentos.map((d) => d.nome) } });
      if (!r.ok) { toast.error(r.erro); return; }
      const res = r.resultado;
      setAnalises((a) => [{ arquivo: f.name, resultado: res }, ...a]);
      const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      update((x) => ({
        ...x,
        documentos: x.documentos.map((d) => (d.nome === res.itemChecklist ? { ...d, recebido: true } : d)),
        timeline: [...x.timeline, { data: hoje, evento: `IA identificou: ${res.tipoDocumento} (${f.name})` }],
      }));
      toast.success(res.itemChecklist ? `Checklist atualizado: ${res.itemChecklist}` : `Identificado: ${res.tipoDocumento} (fora do checklist)`);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao enviar o arquivo");
    } finally {
      setCarregando(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t pt-3">
      <h3 className="section-title text-sm">Análise de documentos com IA</h3>
      <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processar(f); }} />
      <Button variant="outline" className="w-full" disabled={!!carregando} onClick={() => input.current?.click()}>
        {carregando ? <><Loader2 className="animate-spin" />Analisando {carregando}…</> : <><Upload />Enviar documento do cliente</>}
      </Button>
      <p className="text-xs text-muted-foreground">PDF ou imagem. A IA identifica o tipo, extrai dados do caso e marca o item do checklist.</p>
      {analises.map((a, i) => (
        <div key={i} className="rounded-lg border-l-4 border-primary bg-secondary p-2.5 text-sm">
          <p className="flex items-center gap-1 font-semibold"><Sparkles className="size-3.5 text-primary" />{a.resultado.tipoDocumento}</p>
          <p className="truncate text-xs text-muted-foreground">{a.arquivo}</p>
          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
            <span className={cn("rounded px-1.5 py-0.5", a.resultado.itemChecklist ? "bg-success text-success-foreground" : "bg-pending text-pending-foreground")}>
              {a.resultado.itemChecklist ? <><CheckCircle2 className="mr-0.5 inline size-3" />{a.resultado.itemChecklist}</> : "Fora do checklist"}
            </span>
            <span className={cn("rounded px-1.5 py-0.5", a.resultado.confianca === "baixa" ? "bg-pending text-pending-foreground" : "bg-card")}>confiança {a.resultado.confianca}</span>
          </div>
          {(a.resultado.nomeTitular || a.resultado.cpf) && <p className="mt-1 text-xs">{a.resultado.nomeTitular}{a.resultado.cpf && ` · CPF ${a.resultado.cpf}`}</p>}
          {a.resultado.datas.length > 0 && <ul className="mt-1 text-xs">{a.resultado.datas.map((d, j) => <li key={j}><b>{d.descricao}:</b> {d.data}</li>)}</ul>}
          {a.resultado.detalhesCaso.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs">{a.resultado.detalhesCaso.map((d, j) => <li key={j}>{d}</li>)}</ul>}
          {a.resultado.observacoes && <p className="mt-1 rounded bg-pending px-1.5 py-0.5 text-xs text-pending-foreground">{a.resultado.observacoes}</p>}
        </div>
      ))}
    </div>
  );
}
