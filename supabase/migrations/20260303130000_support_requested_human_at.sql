-- Ticket fica "vermelho" no suporte quando o cliente pede atendente humano.
-- O atendente ao abrir o ticket limpa requested_human_at.

ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS requested_human_at timestamptz;

COMMENT ON COLUMN public.support_tickets.requested_human_at IS 'Preenchido quando o cliente pede para falar com um atendente; limpo quando o suporte acessa o ticket.';
