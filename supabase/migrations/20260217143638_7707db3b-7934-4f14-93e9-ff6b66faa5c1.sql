-- Enable realtime for professionals and service_requests tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.professionals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;