-- Campo sexo/gênero no cadastro: male, female, prefer_not_say
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text;

COMMENT ON COLUMN public.profiles.gender IS 'male = Masculino, female = Feminino, prefer_not_say = Prefiro não informar';
