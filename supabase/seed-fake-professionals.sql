-- =============================================================================
-- Seed: 100 profissionais fake em MG (Triângulo Mineiro e redondezas)
-- Cole este script no SQL Editor do Supabase (Dashboard → SQL Editor) e execute.
--
-- Requer:
--   - Ao menos 1 categoria e 1 profissão ativas no admin.
--   - Se o projeto ainda não tiver nenhum usuário no Auth, crie um qualquer
--     pelo Dashboard (Authentication → Add user) antes de rodar, para existir
--     instance_id em auth.users.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Dados base: 1 cliente + 100 profissionais (nome, cidade, plano, índice)
WITH client_row AS (
  SELECT
    gen_random_uuid() AS id,
    'cliente-seed-avaliacoes@chamo-fake.local' AS email,
    'Cliente Avaliador' AS full_name,
    'client' AS user_type,
    NULL::text AS city,
    'free' AS plan,
    0 AS idx
),
nums AS (SELECT i FROM generate_series(1, 100) AS i),
arr_cidades AS (SELECT ARRAY[
  'Uberlândia','Uberaba','Araxá','Patos de Minas','Araguari',
  'Ituiutaba','Monte Carmelo','Prata','Tupaciguara','Frutal',
  'Campos Altos','São Gotardo','Coromandel','Estrela do Sul','Iraí de Minas',
  'Sacramento','Tapira','Perdizes','Santa Vitória','União de Minas'
] AS arr),
arr_nomes AS (SELECT ARRAY[
  'Carlos Eduardo','Ana Paula','Roberto Silva','Fernanda Lima','Marcos Oliveira',
  'Juliana Costa','Ricardo Santos','Patrícia Alves','Bruno Ferreira','Camila Rocha',
  'Lucas Martins','Amanda Souza','Pedro Henrique','Larissa Dias','Rafael Pereira',
  'Beatriz Nunes','Thiago Carvalho','Mariana Gomes','Felipe Ribeiro','Isabela Castro',
  'Gabriel Lima','Carolina Mendes','Daniel Oliveira','Leticia Araújo','André Barbosa',
  'Natália Correia','Leonardo Pinto','Vanessa Teixeira','Rodrigo Nascimento','Renata Lopes',
  'Gustavo Azevedo','Priscila Moreira','Henrique Cavalcanti','Tatiana Freitas','Eduardo Cardoso',
  'Aline Vasconcelos','Vinícius Rodrigues','Cláudia Farias','Matheus Brito','Adriana Monteiro',
  'Igor Cavalheiro','Bianca Soares','Diego Almeida','Fabiana Cunha','Júlio César',
  'Luciana Barros','Fábio Tavares','Sandra Reis','Alexandre Coelho','Mônica Andrade',
  'Paulo Sérgio','Cristina Machado','Leandro Fonseca','Eliane Campos','Anderson Melo',
  'Simone Barbosa','César Augusto','Rosana Dantas','Maurício Araújo','Luciana Pires',
  'Renato Gomes','Viviane Costa','Sérgio Nogueira','Regina Lemos','Wellington Dias',
  'Cintia Rocha','Flávio Martins','Helena Souza','Gilberto Oliveira','Lúcia Ferreira',
  'Hugo Pereira','Márcia Silva','Oscar Santos','Célia Ribeiro','Nelson Carvalho',
  'Débora Alves','Pablo Mendes','Sônia Castro','Raul Gomes','Tânia Nascimento',
  'Fábio Júnior','Rita Lima','Wagner Pinto','Sílvia Freitas','Caio Rodrigues',
  'Lorena Teixeira','Bruno Henrique','Michele Araújo','Guilherme Soares','Lilian Costa'
] AS arr),
pro_rows AS (
  SELECT
    gen_random_uuid() AS id,
    'seed-pro-' || n.i || '@chamo-fake.local' AS email,
    (SELECT arr[1 + (n.i - 1) % 80] FROM arr_nomes) AS full_name,
    'professional' AS user_type,
    (SELECT arr[((n.i - 1) / 5) % 20 + 1] FROM arr_cidades) AS city,
    (ARRAY['free','pro','vip','business'])[1 + (n.i - 1) % 4] AS plan,
    n.i AS idx
  FROM nums n
),
seed_data AS (
  SELECT * FROM client_row
  UNION ALL
  SELECT * FROM pro_rows
)
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  raw_user_meta_data,
  raw_app_meta_data,
  created_at,
  updated_at
)
SELECT
  s.id,
  (SELECT instance_id FROM auth.users LIMIT 1),
  'authenticated',
  'authenticated',
  s.email,
  crypt('SeedChamo2026!', gen_salt('bf')),
  jsonb_build_object('full_name', s.full_name, 'user_type', s.user_type),
  '{}'::jsonb,
  now(),
  now()
FROM seed_data s;

-- Atualizar perfis: avatar e endereço (só profissionais)
WITH nums AS (SELECT i FROM generate_series(1, 100) AS i),
arr_cidades AS (SELECT ARRAY[
  'Uberlândia','Uberaba','Araxá','Patos de Minas','Araguari',
  'Ituiutaba','Monte Carmelo','Prata','Tupaciguara','Frutal',
  'Campos Altos','São Gotardo','Coromandel','Estrela do Sul','Iraí de Minas',
  'Sacramento','Tapira','Perdizes','Santa Vitória','União de Minas'
] AS arr),
pro_emails AS (
  SELECT 'seed-pro-' || n.i || '@chamo-fake.local' AS email, (SELECT arr[((n.i - 1) / 5) % 20 + 1] FROM arr_cidades) AS city, n.i
  FROM nums n
)
UPDATE public.profiles pr
SET
  avatar_url = 'https://i.pravatar.cc/400?img=' || (pro.i % 70 + 1),
  address_city = pro.city,
  address_state = 'MG',
  address_country = 'Brasil'
FROM pro_emails pro
WHERE pr.email = pro.email;

-- Inserir professionals (1 categoria e 1 profissão ativas)
WITH nums AS (SELECT i FROM generate_series(1, 100) AS i),
bios AS (
  SELECT unnest(ARRAY[
    'Profissional com mais de 10 anos de experiência. Atendimento humanizado e qualidade garantida.',
    'Especialista na área, comprometido com a satisfação do cliente. Atendo na região do Triângulo.',
    'Trabalho com dedicação e pontualidade. Entre em contato para orçamentos sem compromisso.',
    'Foco em resultados e atendimento personalizado. Agende seu horário.',
    'Profissional certificado, pronta para atender você com excelência.',
    'Atendimento de qualidade e preço justo. Experiência e seriedade.',
    'Resolvo seu problema com eficiência. Atendo Uberlândia e região.',
    'Compromisso com o cliente e trabalho bem feito. Solicite um orçamento.',
    'Especialista dedicado. Atendimento rápido e com garantia.',
    'Anos de experiência no mercado. Satisfação do cliente em primeiro lugar.'
  ]) AS bio
),
pros_with_plan AS (
  SELECT pr.user_id, (ARRAY['free','pro','vip','business'])[1 + (n.i - 1) % 4] AS plan, (SELECT bio FROM bios OFFSET (n.i - 1) % 10 LIMIT 1) AS bio
  FROM public.profiles pr
  JOIN nums n ON pr.email = 'seed-pro-' || n.i || '@chamo-fake.local'
),
cat AS (SELECT id FROM public.categories WHERE active = true LIMIT 1),
prof AS (SELECT id FROM public.professions WHERE active = true LIMIT 1)
INSERT INTO public.professionals (user_id, category_id, profession_id, bio, profile_status, active, verified, rating, total_reviews, total_services, availability_status)
SELECT p.user_id, (SELECT id FROM cat), (SELECT id FROM prof), p.bio, 'approved', true, p.plan IN ('vip','business'), 0, 0, 0, 'available'
FROM pros_with_plan p;

-- Atualizar plano na subscription (trigger já criou free)
WITH nums AS (SELECT i FROM generate_series(1, 100) AS i),
pros_plan AS (
  SELECT pr.user_id, (ARRAY['free','pro','vip','business'])[1 + (n.i - 1) % 4] AS plan
  FROM public.profiles pr
  JOIN nums n ON pr.email = 'seed-pro-' || n.i || '@chamo-fake.local'
)
UPDATE public.subscriptions sub
SET plan_id = p.plan, status = 'active', updated_at = now()
FROM pros_plan p
WHERE sub.user_id = p.user_id;

-- Pedidos concluídos (3 por profissional) + avaliações
WITH client_id AS (SELECT user_id AS id FROM public.profiles WHERE email = 'cliente-seed-avaliacoes@chamo-fake.local' LIMIT 1),
pro_ids AS (
  SELECT p.id AS professional_id, p.user_id
  FROM public.professionals p
  JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE pr.email LIKE 'seed-pro-%'
),
inserted_requests AS (
  INSERT INTO public.service_requests (client_id, professional_id, status)
  SELECT (SELECT id FROM client_id), pro_ids.professional_id, 'completed'
  FROM pro_ids, generate_series(1, 3)
  RETURNING id, professional_id, client_id
),
comentarios AS (
  SELECT unnest(ARRAY[
    'Atendimento excelente, muito profissional!',
    'Resolveu meu problema rapidinho, super recomendo.',
    'Pessoa educada e trabalho impecável.',
    'Já chamei outras vezes e sempre atende bem.',
    'Muito bom, preço justo e qualidade.',
    'Recomendo demais, nota 10!',
    'Atendeu no horário combinado, tudo certo.',
    'Ótimo profissional, voltarei a contratar.',
    'Serviço de qualidade, indico.',
    'Muito satisfeito com o resultado.'
  ]) AS comment
)
INSERT INTO public.reviews (request_id, professional_id, client_id, rating, comment)
SELECT
  ir.id,
  ir.professional_id,
  ir.client_id,
  3 + floor(random() * 3)::int,
  (SELECT comment FROM comentarios OFFSET floor(random() * 10)::int LIMIT 1)
FROM inserted_requests ir;

-- Atualizar rating e total_reviews nos professionals
WITH stats AS (
  SELECT
    r.professional_id,
    round((sum(r.rating)::numeric / count(*)), 1) AS avg_rating,
    count(*)::int AS total
  FROM public.reviews r
  JOIN public.professionals p ON p.id = r.professional_id
  JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE pr.email LIKE 'seed-pro-%'
  GROUP BY r.professional_id
)
UPDATE public.professionals pro
SET rating = s.avg_rating, total_reviews = s.total, total_services = s.total, updated_at = now()
FROM stats s
WHERE pro.id = s.professional_id;
