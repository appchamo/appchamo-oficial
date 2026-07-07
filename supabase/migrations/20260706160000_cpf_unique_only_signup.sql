-- Remove a unicidade GLOBAL de CPF em profiles.
-- Motivo: no pagamento o cliente pode usar um CPF já cadastrado (ex.: pagar com CPF de terceiro).
-- A unicidade passa a ser garantida SOMENTE no cadastro de conta: a edge function
-- complete-signup checa explicitamente se o CPF/CNPJ já existe em outro perfil e bloqueia.
drop index if exists public.profiles_cpf_unique;
