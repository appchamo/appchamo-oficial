
-- Support messages table for chat-style support conversations
CREATE TABLE public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL, -- the customer who owns this thread
  sender_id uuid NOT NULL, -- who sent this specific message (customer or admin)
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own support messages
CREATE POLICY "Users can view own support messages"
ON public.support_messages FOR SELECT
USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- Users can send their own support messages
CREATE POLICY "Users can insert support messages"
ON public.support_messages FOR INSERT
WITH CHECK (auth.uid() = sender_id AND (auth.uid() = user_id OR is_admin(auth.uid())));

-- Admins can manage all support messages
CREATE POLICY "Admins can manage support messages"
ON public.support_messages FOR ALL
USING (is_admin(auth.uid()));

-- Support read status for unread tracking
CREATE TABLE public.support_read_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_user_id uuid NOT NULL, -- which support thread
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, thread_user_id)
);

ALTER TABLE public.support_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own support read status"
ON public.support_read_status FOR ALL
USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- Enable realtime for support messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
