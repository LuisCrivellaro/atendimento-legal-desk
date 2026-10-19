import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const destinoSeguro = (r?: string) => {
  if (!r) return "/";
  try { const u = new URL(r, window.location.origin); return u.origin === window.location.origin ? u.pathname + u.search : "/"; } catch { return "/"; }
};

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined }),
  head: () => ({
    meta: [
      { title: "Entrar — Manager ADV" },
      { name: "description", content: "Acesso da equipe CS Lawyers ao Manager ADV." },
      { property: "og:title", content: "Entrar — Manager ADV" },
      { property: "og:description", content: "Acesso da equipe CS Lawyers ao Manager ADV." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const router = useRouter();
  const ir = () => router.history.replace(destinoSeguro(redirect));
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) ir(); });
    const { data: sub } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN") ir(); });
    return () => sub.subscription.unsubscribe();
  }, [router, redirect]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: window.location.origin, data: { full_name: nome } } });
        if (error) throw error;
        if (!data.session) setConfirmar(true);
      }
    } catch (err) {
      const m = (err as Error).message;
      toast.error(m.includes("Invalid login") ? "E-mail ou senha incorretos." : m);
    } finally { setCarregando(false); }
  };

  const social = async (p: "google" | "lovable") => {
    const r = await lovable.auth.signInWithOAuth(p, { redirect_uri: window.location.origin });
    if (r.error) toast.error("Não foi possível entrar. Tente novamente.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-soft">
        <p className="font-sans text-lg font-bold tracking-wide">CS LAWYERS | ADVOCACIA</p>
        <p className="text-xs font-semibold tracking-[0.2em] text-primary [font-variant:small-caps]">Brasil • Dubai • Portugal</p>
        <div className="my-4 h-0.5 bg-primary" />
        <h1 className="section-title mb-4 text-xl">{modo === "entrar" ? "Entrar no Manager ADV" : "Criar conta da equipe"}</h1>
        {confirmar ? (
          <p className="rounded bg-secondary p-3 text-sm">Enviamos um link de confirmação para <b>{email}</b>. Abra o e-mail para ativar sua conta.</p>
        ) : (
          <>
            <form onSubmit={enviar} className="space-y-3">
              {modo === "cadastrar" && <div><Label htmlFor="nome">Nome</Label><Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} /></div>}
              <div><Label htmlFor="email">E-mail</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label htmlFor="senha">Senha</Label><Input id="senha" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
              <Button type="submit" className="w-full" disabled={carregando}>{carregando && <Loader2 className="animate-spin" />}{modo === "entrar" ? "Entrar" : "Criar conta"}</Button>
            </form>
            <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />ou<div className="h-px flex-1 bg-border" /></div>
            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={() => social("google")}>Continuar com Google</Button>
              <button type="button" className="lovable-auth-button w-full" onClick={() => social("lovable")}>Continue with Lovable</button>
            </div>
            <button className="mt-4 w-full text-center text-sm text-primary hover:underline" onClick={() => setModo(modo === "entrar" ? "cadastrar" : "entrar")}>
              {modo === "entrar" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
