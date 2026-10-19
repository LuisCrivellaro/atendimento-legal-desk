import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";

const resultadoSchema = z.object({
  tipoDocumento: z.string(),
  itemChecklist: z.string().nullable(),
  confianca: z.enum(["alta", "media", "baixa"]),
  nomeTitular: z.string().nullable(),
  cpf: z.string().nullable(),
  datas: z.array(z.object({ descricao: z.string(), data: z.string() })),
  detalhesCaso: z.array(z.string()),
  observacoes: z.string().nullable(),
});
export type ResultadoAnalise = z.infer<typeof resultadoSchema>;

type Entrada = { filename: string; mimeType: string; base64: string; checklist: string[] };

export const analisarDocumento = createServerFn({ method: "POST" })
  .inputValidator((d: Entrada) => {
    if (!d.base64) throw new Error("Arquivo vazio");
    if (d.mimeType !== "application/pdf" && !d.mimeType.startsWith("image/")) throw new Error("Envie PDF ou imagem (JPG/PNG)");
    if (d.base64.length > 14_000_000) throw new Error("Arquivo muito grande (máx. 10 MB)");
    return d;
  })
  .handler(async ({ data }): Promise<{ ok: true; resultado: ResultadoAnalise } | { ok: false; erro: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, erro: "Chave da IA não configurada." };
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const arquivo =
      data.mimeType === "application/pdf"
        ? ({ type: "file", filename: data.filename, data: data.base64, mediaType: "application/pdf" } as const)
        : ({ type: "image", image: new URL(`data:${data.mimeType};base64,${data.base64}`) } as const);
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        instructions:
          "Você é assessora jurídica de um escritório de advocacia brasileiro. Identifique o tipo do documento enviado por um cliente e extraia dados relevantes para o caso. " +
          "Em itemChecklist, devolva EXATAMENTE um dos itens da lista fornecida que este documento atende, ou null se não corresponder a nenhum. " +
          "Datas em dd/mm/aaaa. detalhesCaso: até 6 frases curtas com fatos úteis (CID, empregador, período de afastamento, nº de benefício etc.). Responda em pt-BR. Não invente dados ilegíveis.",
        messages: [{ role: "user", content: [{ type: "text", text: `Arquivo: ${data.filename}\nItens do checklist: ${data.checklist.join("; ")}` }, arquivo] }],
        output: Output.object({ schema: resultadoSchema }),
        providerOptions: {
          openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
        },
      });
      const resultado = await result.output;
      return { ok: true, resultado };
    } catch (e) {
      console.error("analisarDocumento", e);
      if (NoObjectGeneratedError.isInstance(e)) return { ok: false, erro: "A IA não conseguiu ler o documento. Tente outro arquivo." };
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 402) return { ok: false, erro: "Créditos de IA esgotados. Adicione créditos em Configurações → Planos." };
      if (status === 429) return { ok: false, erro: "Muitas análises ao mesmo tempo. Aguarde alguns segundos." };
      return { ok: false, erro: "Falha ao analisar o documento." };
    }
  });
