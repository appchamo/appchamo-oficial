-- Script para corrigir localização dos usuários (profiles).
-- Executar no Supabase: SQL Editor → colar e rodar.
--
-- Regra: todos em Patrocínio, MG; exceto "Tiago Silva" em São Paulo, SP.

-- 1) Tiago Silva → São Paulo, SP
UPDATE profiles
SET
  address_city = 'São Paulo',
  address_state = 'SP'
WHERE full_name ILIKE '%Tiago Silva%';

-- 2) Demais usuários → Patrocínio, MG
UPDATE profiles
SET
  address_city = 'Patrocínio',
  address_state = 'MG'
WHERE full_name NOT ILIKE '%Tiago Silva%'
   OR full_name IS NULL;

-- Opcional: conferir resultado
-- SELECT full_name, address_city, address_state FROM profiles ORDER BY full_name;
