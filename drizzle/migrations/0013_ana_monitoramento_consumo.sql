CREATE TABLE public.ana_consumo_ia (dia date PRIMARY KEY, chamadas integer NOT NULL DEFAULT 0, tokens_entrada bigint NOT NULL DEFAULT 0, tokens_saida bigint NOT NULL DEFAULT 0, bloqueadas integer NOT NULL DEFAULT 0, atualizado_em timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ana_consumo_ia TO service_role;
ALTER TABLE public.ana_consumo_ia ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.ana_monitoramento (id text PRIMARY KEY, estado jsonb NOT NULL DEFAULT '{}'::jsonb, verificado_em timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ana_monitoramento TO service_role;
ALTER TABLE public.ana_monitoramento ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.ana_reservar_chamada_ia(p_limite integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; ok boolean;
BEGIN
  INSERT INTO ana_consumo_ia(dia) VALUES (d) ON CONFLICT DO NOTHING;
  UPDATE ana_consumo_ia SET chamadas=chamadas+1, atualizado_em=now() WHERE dia=d AND chamadas < p_limite RETURNING true INTO ok;
  IF ok IS NULL THEN UPDATE ana_consumo_ia SET bloqueadas=bloqueadas+1, atualizado_em=now() WHERE dia=d; RETURN false; END IF;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.ana_registrar_tokens(p_entrada integer, p_saida integer) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE ana_consumo_ia SET tokens_entrada=tokens_entrada+greatest(p_entrada,0), tokens_saida=tokens_saida+greatest(p_saida,0), atualizado_em=now() WHERE dia=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;
REVOKE ALL ON FUNCTION public.ana_reservar_chamada_ia(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ana_registrar_tokens(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ana_reservar_chamada_ia(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ana_registrar_tokens(integer,integer) TO service_role;