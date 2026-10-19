import { supabase } from "@/integrations/supabase/client";
import type { Conversa, DocItem } from "@/lib/mock-data";
import type { Json } from "@/integrations/supabase/types";

// Casos e checklist do usuário logado (RLS garante que cada um vê só os seus).
export async function listarCasos(): Promise<Conversa[]> {
  const [casos, itens] = await Promise.all([
    supabase.from("casos").select("id, dados, etapa, nome").order("ordem"),
    supabase.from("checklist_itens").select("id, caso_id, nome, recebido, ordem").order("ordem"),
  ]);
  if (casos.error) throw casos.error;
  if (itens.error) throw itens.error;
  return casos.data.map((c) => ({
    ...(c.dados as unknown as Omit<Conversa, "id" | "documentos" | "naoLidas">),
    id: c.id,
    nome: c.nome,
    etapa: c.etapa as Conversa["etapa"],
    naoLidas: 0,
    documentos: itens.data.filter((i) => i.caso_id === c.id).map<DocItem>((i) => ({ id: i.id, nome: i.nome, recebido: i.recebido })),
  }));
}

export async function salvarCaso(antes: Conversa, depois: Conversa) {
  const { id, documentos, naoLidas: _n, ...dados } = depois;
  const { error } = await supabase.from("casos").update({ dados: dados as unknown as Json, etapa: depois.etapa, nome: depois.nome, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  const mudados = documentos.filter((d) => d.id && antes.documentos.find((a) => a.id === d.id)?.recebido !== d.recebido);
  for (const d of mudados) {
    if (!d.id) continue;
    const r = await supabase.from("checklist_itens").update({ recebido: d.recebido, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (r.error) throw r.error;
  }
}
