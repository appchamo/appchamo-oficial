-- Corrige a função de contagem semanal de stories para usar fuso America/Sao_Paulo
-- Semana começa segunda-feira às 00:01 (horário de Brasília) e termina domingo às 23:59

CREATE OR REPLACE FUNCTION public.count_stories_this_week(p_sponsor_id UUID)
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INT
  FROM public.sponsor_stories
  WHERE sponsor_id = p_sponsor_id
    AND (created_at AT TIME ZONE 'America/Sao_Paulo') >=
        date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo');
$$;

-- Também expõe via RPC para o frontend chamar diretamente
CREATE OR REPLACE FUNCTION public.get_sponsor_weekly_used(p_sponsor_id UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT public.count_stories_this_week(p_sponsor_id);
$$;

NOTIFY pgrst, 'reload schema';
