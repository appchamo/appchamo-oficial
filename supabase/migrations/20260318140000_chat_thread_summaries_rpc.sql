-- Uma única chamada no lugar de N×3 queries na lista de conversas (Messages.tsx)
CREATE OR REPLACE FUNCTION public.get_chat_thread_summaries(_request_ids uuid[], _user_id uuid)
RETURNS TABLE (
  request_id uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    sr.id,
    lm.content,
    lm.created_at,
    COALESCE(
      (
        SELECT count(*)::bigint
        FROM chat_messages m
        WHERE m.request_id = sr.id
          AND m.sender_id IS DISTINCT FROM _user_id
          AND m.created_at > COALESCE(crs.last_read_at, '-infinity'::timestamptz)
      ),
      0
    )
  FROM service_requests sr
  INNER JOIN unnest(_request_ids) AS u(id) ON u.id = sr.id
  LEFT JOIN LATERAL (
    SELECT cm.content, cm.created_at
    FROM chat_messages cm
    WHERE cm.request_id = sr.id
    ORDER BY cm.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN chat_read_status crs
    ON crs.request_id = sr.id AND crs.user_id = _user_id
  WHERE sr.client_id = _user_id
     OR EXISTS (
       SELECT 1 FROM professionals p
       WHERE p.id = sr.professional_id AND p.user_id = _user_id
     );
$$;

REVOKE ALL ON FUNCTION public.get_chat_thread_summaries(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_summaries(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_summaries(uuid[], uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_chat_messages_request_created_desc
  ON public.chat_messages (request_id, created_at DESC);
