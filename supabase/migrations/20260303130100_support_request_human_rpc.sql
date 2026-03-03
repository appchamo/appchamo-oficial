-- RPC: cliente marca que quer falar com um atendente humano.
-- Atualiza o ticket e notifica o usuário de suporte.

CREATE OR REPLACE FUNCTION public.request_human_attendant(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _user_id uuid;
  _support_user_id uuid;
BEGIN
  SELECT user_id INTO _user_id
  FROM support_tickets
  WHERE id = _ticket_id;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Ticket não encontrado';
  END IF;

  IF _user_id != auth.uid() THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  UPDATE support_tickets
  SET requested_human_at = now(), updated_at = now()
  WHERE id = _ticket_id AND requested_human_at IS NULL;

  SELECT p.user_id INTO _support_user_id
  FROM profiles p
  WHERE p.email = 'suporte@appchamo.com'
  LIMIT 1;

  IF _support_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, type, link)
    VALUES (
      _support_user_id,
      'Um usuário quer falar com um atendente',
      'Clique para abrir o atendimento no suporte.',
      'support',
      '/suporte-desk'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_human_attendant(uuid) TO authenticated;
