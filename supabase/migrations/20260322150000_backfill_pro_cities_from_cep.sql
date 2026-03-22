-- =====================================================================
-- Cria trigger que auto-preenche address_city e address_state
-- a partir do address_zip quando esses campos estiverem vazios.
-- Usa pg_net para chamar a API ViaCEP de forma assíncrona.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Função chamada pelo trigger
CREATE OR REPLACE FUNCTION public.sync_city_from_zip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_zip TEXT;
BEGIN
  -- Só age quando o CEP mudou e a cidade está vazia
  IF NEW.address_zip IS NULL OR NEW.address_zip = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.address_city IS NOT NULL AND NEW.address_city != '' THEN
    RETURN NEW;
  END IF;

  clean_zip := regexp_replace(NEW.address_zip, '[^0-9]', '', 'g');
  IF length(clean_zip) != 8 THEN
    RETURN NEW;
  END IF;

  -- Chama ViaCEP de forma assíncrona (fire-and-forget via pg_net)
  PERFORM net.http_get(
    url := format('https://viacep.com.br/ws/%s/json/', clean_zip)
  );

  RETURN NEW;
END;
$$;

-- Remove trigger anterior se existir
DROP TRIGGER IF EXISTS trg_sync_city_from_zip ON public.profiles;

-- Cria trigger no INSERT e UPDATE do profiles
CREATE TRIGGER trg_sync_city_from_zip
BEFORE INSERT OR UPDATE OF address_zip
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_city_from_zip();

-- =====================================================================
-- Back-fill manual: popula cidade/estado de profiles que já existem
-- com CEP mas sem cidade. Execute este bloco separadamente no SQL Editor
-- após aplicar a migration se quiser forçar o preenchimento imediato.
-- 
-- UPDATE public.profiles
-- SET address_city = viacep_data->>'localidade',
--     address_state = viacep_data->>'uf'
-- FROM (
--   SELECT p.user_id,
--          (SELECT content::json
--           FROM net.http_get(
--             'https://viacep.com.br/ws/' ||
--             regexp_replace(p.address_zip, '[^0-9]', '', 'g') ||
--             '/json/'
--           )) AS viacep_data
--   FROM public.profiles p
--   WHERE p.address_zip IS NOT NULL
--     AND length(regexp_replace(p.address_zip, '[^0-9]', '', 'g')) = 8
--     AND (p.address_city IS NULL OR p.address_city = '')
-- ) AS lookup
-- WHERE public.profiles.user_id = lookup.user_id
--   AND lookup.viacep_data IS NOT NULL;
-- =====================================================================
