CREATE TABLE public.projuris_base (
 owner_id uuid PRIMARY KEY,
 carteira jsonb NOT NULL DEFAULT '{}'::jsonb,
 sincronizado_em timestamptz,
 lease_token uuid,
 lease_ate timestamptz,
 erro text
);
GRANT SELECT ON public.projuris_base TO authenticated;
GRANT ALL ON public.projuris_base TO service_role;
ALTER TABLE public.projuris_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY base_read ON public.projuris_base FOR SELECT TO authenticated USING (owner_id = auth.uid() AND (public.has_role(auth.uid(), 'advogada_senior') OR public.has_role(auth.uid(), 'admin')));
CREATE TABLE public.projuris_sync_processos (
 owner_id uuid NOT NULL,
 codigo_processo bigint NOT NULL,
 ultimo_sucesso timestamptz,
 tentativa_em timestamptz,
 erro text,
 falhas integer NOT NULL DEFAULT 0,
 retry_em timestamptz,
 lease_token uuid,
 lease_ate timestamptz,
 atuais jsonb NOT NULL DEFAULT '[]'::jsonb,
 PRIMARY KEY(owner_id,codigo_processo)
);
GRANT SELECT ON public.projuris_sync_processos TO authenticated;
GRANT ALL ON public.projuris_sync_processos TO service_role;
ALTER TABLE public.projuris_sync_processos ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_read ON public.projuris_sync_processos FOR SELECT TO authenticated USING (owner_id = auth.uid() AND (public.has_role(auth.uid(), 'advogada_senior') OR public.has_role(auth.uid(), 'admin')));
CREATE TABLE public.projuris_movimento_versoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 codigo_processo bigint NOT NULL,
 codigo_andamento bigint NOT NULL,
 hash text NOT NULL,
 dados jsonb NOT NULL,
 identificado_em timestamptz NOT NULL DEFAULT now(),
 origem text NOT NULL DEFAULT 'ProJuris API oficial',
 UNIQUE(owner_id,codigo_processo,codigo_andamento,hash)
);
GRANT SELECT ON public.projuris_movimento_versoes TO authenticated;
GRANT SELECT,INSERT ON public.projuris_movimento_versoes TO service_role;
ALTER TABLE public.projuris_movimento_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY versoes_read ON public.projuris_movimento_versoes FOR SELECT TO authenticated USING (owner_id = auth.uid() AND (public.has_role(auth.uid(), 'advogada_senior') OR public.has_role(auth.uid(), 'admin')));
CREATE INDEX projuris_movimentos_cliente ON public.projuris_movimento_versoes(owner_id,codigo_processo,identificado_em DESC);
CREATE FUNCTION public.projuris_claim(p_owner uuid,p_codigo bigint,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 IF p_codigo=0 THEN
  INSERT INTO public.projuris_base(owner_id) VALUES(p_owner) ON CONFLICT DO NOTHING;
  UPDATE public.projuris_base SET lease_token=p_token,lease_ate=now()+interval '10 minutes' WHERE owner_id=p_owner AND (lease_ate IS NULL OR lease_ate<now());
 ELSE
  INSERT INTO public.projuris_sync_processos(owner_id,codigo_processo) VALUES(p_owner,p_codigo) ON CONFLICT DO NOTHING;
  UPDATE public.projuris_sync_processos SET lease_token=p_token,lease_ate=now()+interval '10 minutes',tentativa_em=now() WHERE owner_id=p_owner AND codigo_processo=p_codigo AND (lease_ate IS NULL OR lease_ate<now());
 END IF;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected=1;
END $$;
REVOKE ALL ON FUNCTION public.projuris_claim(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.projuris_claim(uuid,bigint,uuid) TO service_role;
CREATE FUNCTION public.projuris_commit_movimentos(p_owner uuid,p_codigo bigint,p_token uuid,p_movimentos jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 PERFORM 1 FROM public.projuris_sync_processos WHERE owner_id=p_owner AND codigo_processo=p_codigo AND lease_token=p_token AND lease_ate>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease expired'; END IF;
 INSERT INTO public.projuris_movimento_versoes(owner_id,codigo_processo,codigo_andamento,hash,dados)
 SELECT p_owner,p_codigo,(m->>'codigo')::bigint,m->>'hash',m->'dados' FROM jsonb_array_elements(p_movimentos) m ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;
 UPDATE public.projuris_sync_processos SET atuais=(SELECT coalesce(jsonb_agg(m->'dados'),'[]'::jsonb) FROM jsonb_array_elements(p_movimentos) m),ultimo_sucesso=now(),erro=NULL,falhas=0,retry_em=NULL,lease_token=NULL,lease_ate=NULL WHERE owner_id=p_owner AND codigo_processo=p_codigo AND lease_token=p_token;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.projuris_commit_movimentos(uuid,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.projuris_commit_movimentos(uuid,bigint,uuid,jsonb) TO service_role;