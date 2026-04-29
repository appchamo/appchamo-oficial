-- Central "Cupons & Sorteios" do admin: a aba de cupons (sorteio/desconto)
-- distribui em massa por grupo (todos / só profissionais / só clientes) e
-- precisa marcar o source diferente do envio individual ('admin') ou do
-- sorteio aleatório ('admin_random'), para auditoria. Antes desta migration
-- a tentativa de inserir com esses sources caía na coupons_source_check.

ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_source_check;

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_source_check CHECK (
    source = ANY (
      ARRAY[
        'registration'::text,
        'payment'::text,
        'bonus'::text,
        'admin'::text,
        'admin_random'::text,
        'admin_broadcast_all'::text,
        'admin_broadcast_pros'::text,
        'admin_broadcast_clients'::text,
        'referral_signup'::text
      ]
    )
  );

NOTIFY pgrst, 'reload schema';
