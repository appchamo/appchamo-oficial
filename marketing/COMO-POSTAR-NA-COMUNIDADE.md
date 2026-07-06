# Como postar uma arte na Comunidade (perfil oficial Chamô)

Fluxo sob demanda, sem interface. Leva ~1 minuto.

## Passo 1 — Subir a arte no Storage
1. Painel do Supabase → projeto **ChamoBR** → **Storage** → bucket **`community-feed`**.
2. Entra na pasta do perfil oficial (ou cria): `f0e03e07-fb41-4338-931a-ef7ac7ecc698`.
3. **Upload** da imagem (JPG ou PNG). Guarda o nome do arquivo, ex.: `dica-foto.jpg`.

## Passo 2 — Publicar
No Supabase → **SQL Editor**, roda uma linha:

```sql
select public.chamo_publish_community(
  'f0e03e07-fb41-4338-931a-ef7ac7ecc698/dica-foto.jpg',
  'Foto boa no perfil muda tudo. No Chamô, quem tem uma foto de qualidade passa mais confiança e aparece na frente quando o cliente procura. Separa uns minutos hoje e capricha na sua. O cliente confia em quem ele vê trabalhando. Já atualizou a sua?'
);
```

Pronto: publica como o perfil oficial Chamô e notifica os profissionais (respeita quem desativou o sino da comunidade).

## Dicas
- Só quer conferir a URL antes de postar? Passa `true` no final (dry-run, não posta):
  ```sql
  select public.chamo_publish_community('f0e03e07-.../dica-foto.jpg', 'legenda', true);
  ```
- Pode passar também o caminho com o bucket (`community-feed/...`) ou uma URL completa `https://...`.
- A legenda segue o tom do guia de marca: simples, humano, sem travessão. Veja `GUIA-DE-MARCA.md` e o banco de dicas na skill `wiz-content-creator`.
- Segurança: pelo app, só admin consegue chamar. Pelo SQL Editor (service role) sempre funciona.

## Onde ficam as artes prontas
`marketing/artes/` no repositório. É só subir a que quiser no Storage e rodar a linha acima.
