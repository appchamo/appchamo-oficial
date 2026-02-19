
# Estatisticas da Home configuraveis pelo Admin

## O que muda
Os 3 cards de estatisticas na home (Profissionais, Servicos feitos, Cupons emitidos) passarao a ser configurados pelo painel admin -- icone, texto e valor (automatico ou manual).

## Como funciona

### 1. Nova tabela `platform_stats`
Criar uma tabela para armazenar os 3 cards com os campos:
- `id` (uuid)
- `icon_name` (text) -- nome do icone Lucide (ex: Users, CheckCircle2, Trophy)
- `label` (text) -- texto exibido embaixo do numero
- `value_mode` (text) -- `auto_professionals`, `auto_services`, `auto_coupons` ou `manual`
- `manual_value` (integer) -- valor fixo quando mode = manual
- `sort_order` (integer) -- ordem de exibicao
- `active` (boolean)
- RLS: leitura publica, gerenciamento restrito a admins

Dados iniciais inseridos na migracao:
1. Icone `Users`, label "Profissionais", mode `auto_professionals`
2. Icone `CheckCircle2`, label "Servicos feitos", mode `auto_services`
3. Icone `Trophy`, label "Cupons emitidos", mode `auto_coupons`

### 2. Componente `PlatformStats.tsx` atualizado
- Busca os registros da tabela `platform_stats` ordenados por `sort_order`
- Para cada card, verifica o `value_mode`:
  - `auto_professionals`: conta profissionais ativos
  - `auto_services`: soma `total_services`
  - `auto_coupons`: conta cupons
  - `manual`: usa `manual_value`
- Renderiza o icone dinamicamente usando o `icon_name` (mesmo mapa de icones usado no CategoriesGrid)

### 3. Secao no Admin (AdminSettings.tsx)
Nova secao "Estatisticas da Home" com 3 blocos editaveis, cada um com:
- Seletor de icone (dropdown com icones Lucide disponiveis)
- Campo de texto para o label
- Seletor de modo (Automatico ou Manual)
- Campo numerico para valor manual (aparece apenas quando modo = manual)
- Campo de ordem

## Detalhes tecnicos

- A tabela `platform_stats` usa RLS com `Anyone can view active` e `Admins can manage`
- O componente reutiliza o `iconMap` ja existente no projeto
- Nenhuma nova dependencia necessaria
