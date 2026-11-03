CREATE FUNCTION public.projuris_salvar_ficha(p_owner uuid,p_codigo bigint,p_ficha jsonb,p_revisao text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.projuris_base SET carteira=jsonb_set(jsonb_set(carteira, '{fichas}', coalesce(carteira->'fichas','{}'::jsonb) || jsonb_build_object(p_codigo::text,p_ficha)), '{revisoes}', coalesce(carteira->'revisoes','{}'::jsonb) || jsonb_build_object(p_codigo::text,p_revisao)) WHERE owner_id=p_owner AND sincronizado_em IS NOT NULL AND lease_token IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Base unavailable or syncing'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.projuris_salvar_ficha(uuid,bigint,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.projuris_salvar_ficha(uuid,bigint,jsonb,text) TO service_role;