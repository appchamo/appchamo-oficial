# Guia de Marca + Conteúdo — Artes Chamô

Padrão visual e banco de conteúdo para todas as artes (posts, stories, banners) da Chamô.
Este arquivo é a fonte da verdade. Para usar dentro de uma skill, cole o conteúdo abaixo
em **Ajustes › Capacidades** na skill `wiz-content-creator` (ou numa skill de design).

---

## 1. Tipografia
- **Títulos / headlines:** Montserrat **Bold** (ExtraBold quando precisar de mais peso).
- **Subtítulos / textos / legendas:** Montserrat **Regular**.
- **Elementos e etiquetas** (ex.: selo "Dica Chamô", kickers, tags): **Futura Regular**.
  - Futura é paga. Na produção automática usamos **Jost Regular**, clone livre praticamente idêntico. Se tiver a Futura licenciada, é só trocar o arquivo.

## 2. Fundo
Sempre um **degradê suave**, nunca chapado. Duas opções:
1. **Marca (preferida):** laranja escuro → laranja mais claro. `#B74A00` → `#FF8C1C`.
2. **Claro:** branco → cinza leve. `#FFFFFF` → `#E9E9E9`.

## 3. Cores
- Laranja da marca: `#FF7A00` (HSL 30 100% 50%).
- Laranja escuro (degradê / destaque): `#B74A00` a `#E86A00`.
- Texto sobre laranja: branco `#FFFFFF`; destaque em creme `#FFE0C4`.
- Texto sobre claro: títulos `#26201A`, textos cinza `#786C5C`.

## 4. Elemento gráfico
- **Mockup de celular com borrão de movimento**, no canto inferior-direito, levemente
  inclinado (~-13°), saindo da borda, com opacidade ~55%. A tela mostra o app Chamô
  (header laranja + logo C, barra de busca, lista de profissionais).
- Logo: "C" branco com onda de sinal (chamada) no laranja.
- Evitar: elementos de "wifi/ondas" soltos como fundo (ficou fraco).

## 5. Acabamento
- **Grão / ruído** leve por cima da arte (~20%, suave) para dar textura de filme.
- Renderizar em alta (supersample 3x) e reduzir para 1080px; grão aplicado no final.

## 6. Layout base (feed 1080×1080)
- Margem: ~100px.
- Selo "Dica Chamô" (pílula branca) no topo esquerdo.
- Headline grande em 3 linhas curtas, palavra-chave da última linha em creme.
- Subtítulo colado no título (2-3 linhas, entrelinha fechada).
- Rodapé: logo C + "Chamô" + "seu serviço, na palma da mão".
- Gerador de referência no repo: `marketing/gen_arte.py` (a partir do `outputs/gen_dica3.py`).

## 7. Formatos
- Feed quadrado 1080×1080, Story 1080×1920, Retrato 4:5 1080×1350.

---

## 8. Banco de conteúdo — "Dica Chamô"
Tom: simples, humano, como amigo falando. Frases curtas, no máx. 1 emoji.
**Nunca** usar travessão (— –), nem palavra de escritório (otimize, engajamento, propósito),
nem motivacional vazio ("bom dia, dia de conquistas"). Sempre uma ideia só, clara.

### 8.1 Dicas do app (ajudam o pro e o Chamô)
- **Perfil com foto** aparece na frente e passa confiança. → "Foto boa puxa mais cliente."
- **Responder rápido**: notificações ligadas, cliente que espera chama outro.
- **Serviços listados** no perfil: quanto mais claro o que você faz, mais chamada.
- **Avaliação após o serviço**: peça sempre, avaliação boa é sua vitrine.
- **Roleta / cupom** do app: aproveite e ofereça pra fechar mais.
- **Complete o cadastro**: perfil completo = mais visibilidade na busca.

### 8.2 Motivacional (do jeito real, sem clichê)
- "Todo grande profissional começou no primeiro serviço."
- "Sua próxima oportunidade tá a um chamado de distância."
- "Trabalho bem feito hoje é indicação amanhã."

### 8.3 Ideias / novidade
- "Divulgue seu Chamô e apareça na cidade."
- "Novidade no app: cupom pra fechar mais rápido."
- "Cliente novo chegou na sua categoria? Responde na hora."

---

## 9. Arquivos
- Fontes: `marketing/fonts/` — Montserrat (Light/Regular/SemiBold/Bold/ExtraBold), Jost (Light/Regular).
- Artes geradas: `marketing/artes/`.
