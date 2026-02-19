
-- Add ticket_id to support_messages to link messages to specific tickets
ALTER TABLE public.support_messages ADD COLUMN ticket_id uuid REFERENCES public.support_tickets(id);

-- Create index for faster queries
CREATE INDEX idx_support_messages_ticket_id ON public.support_messages(ticket_id);
