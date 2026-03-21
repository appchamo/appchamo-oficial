-- Função para recarregar o schema cache do PostgREST via NOTIFY
CREATE OR REPLACE FUNCTION public.reload_pgrst_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- Executa imediatamente
SELECT public.reload_pgrst_schema();
