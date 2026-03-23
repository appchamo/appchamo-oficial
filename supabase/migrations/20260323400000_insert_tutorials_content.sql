-- Insere/atualiza tutoriais completos no banco
-- Cobre os fluxos principais: clientes e profissionais

INSERT INTO public.platform_settings (key, value)
VALUES (
  'home_tutorials',
  '{
    "title": "Como usar o Chamô?",
    "subtitle": "Aprenda o básico em poucos passos!",
    "items": [
      {
        "id": "primeiros-passos",
        "icon": "BookOpen",
        "label": "Primeiros passos",
        "path": "/tutorial/primeiros-passos",
        "description": "",
        "steps": [
          "Baixe o app Chamô e crie sua conta com e-mail ou faça login com o Google",
          "Complete seu perfil: adicione foto, nome completo e sua cidade — isso ajuda profissionais a te encontrarem",
          "Na tela inicial você já vê profissionais disponíveis na sua região",
          "Use a busca (lupa) para procurar por nome de profissional ou tipo de serviço, como ''eletricista'' ou ''designer''",
          "Toque em um profissional para ver o perfil completo com fotos, serviços, avaliações e preços",
          "Clique em ''Chat'' para iniciar uma conversa e combinar o serviço diretamente"
        ]
      },
      {
        "id": "como-contratar",
        "icon": "UserCheck",
        "label": "Como contratar",
        "path": "/tutorial/como-contratar",
        "description": "",
        "steps": [
          "Busque o serviço que precisa: use a busca ou explore as categorias na tela inicial",
          "Compare profissionais: veja fotos, descrições, avaliações de outros clientes e preços dos serviços",
          "Toque em ''Chat'' no perfil do profissional para iniciar o atendimento",
          "Converse pelo chat, tire suas dúvidas e combine data, horário e valor do serviço",
          "Solicite um agendamento pelo botão de calendário no chat — o profissional confirma e você recebe notificação",
          "Após o serviço, avalie o profissional de 1 a 5 estrelas — sua avaliação ajuda outros clientes a escolherem"
        ]
      },
      {
        "id": "como-pagar",
        "icon": "CreditCard",
        "label": "Como pagar",
        "path": "/tutorial/como-pagar",
        "description": "",
        "steps": [
          "O pagamento pode ser feito com segurança direto pelo app — sem precisar de dinheiro em espécie",
          "O profissional cria uma cobrança: no chat, toque no ícone de pagamento que ele vai te enviar",
          "Escolha a forma: PIX (aprovado na hora) ou Cartão de crédito (à vista ou parcelado)",
          "Se o profissional configurar ''Com juros do cliente'', as taxas do cartão aparecem separadas — você escolhe confirmar",
          "Após o pagamento, você recebe confirmação no app e o profissional é notificado",
          "Dúvidas ou problemas com pagamento? Acesse Perfil → Suporte para falar com nossa equipe"
        ]
      },
      {
        "id": "para-profissionais",
        "icon": "Briefcase",
        "label": "Sou profissional",
        "path": "/tutorial/para-profissionais",
        "description": "",
        "steps": [
          "Crie sua conta normalmente e acesse Perfil → ''Tornar-me Profissional'' para ativar o modo profissional",
          "Preencha seu perfil completo: foto profissional, especialidades, bio e cidade de atendimento",
          "Adicione seus serviços com fotos, descrição detalhada e preços — isso é o que o cliente vê antes de te contatar",
          "Ative seu status como ''Disponível'' na tela do Painel Profissional para aparecer nas buscas",
          "Responda os chats rapidamente — clientes tendem a escolher quem responde mais rápido",
          "Assine o plano Pro ou Business para liberar mais recursos: agenda, cobranças pelo app, catálogo de produtos e muito mais"
        ]
      },
      {
        "id": "agenda",
        "icon": "Settings",
        "label": "Agenda e horários",
        "path": "/tutorial/agenda",
        "description": "",
        "steps": [
          "No Painel Profissional, acesse ''Minha Agenda'' para configurar seus dias e horários de atendimento",
          "Defina quais dias da semana você trabalha e os horários disponíveis — clientes só podem agendar dentro dessa janela",
          "Quando um cliente solicita agendamento, você recebe notificação e pode aceitar ou recusar",
          "Acesse ''Meus agendamentos'' no Perfil para ver todos os compromissos confirmados",
          "Você pode bloquear horários específicos no calendário para folgas ou compromissos pessoais",
          "Dica: mantenha a agenda sempre atualizada para evitar agendamentos em dias que você não está disponível"
        ]
      },
      {
        "id": "carteira-saque",
        "icon": "Wallet",
        "label": "Carteira e saque",
        "path": "/tutorial/carteira-saque",
        "description": "",
        "steps": [
          "Toda cobrança paga pelo cliente cai automaticamente na sua Carteira dentro do app",
          "Acesse Painel Profissional → ''Carteira'' para ver seu saldo disponível e o histórico de transações",
          "O valor fica disponível após o processamento: PIX é creditado na hora, cartão pode levar alguns dias",
          "Para antecipar recebimentos de cartão, ative a opção ''Receber antecipado'' no momento da cobrança",
          "Em ''Carteira → Taxas'' você vê todas as taxas da plataforma e do cartão para planejar seus preços",
          "Planos Pro e Business têm taxas menores e mais recursos financeiros — vale a pena comparar em Planos e Assinatura"
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();
