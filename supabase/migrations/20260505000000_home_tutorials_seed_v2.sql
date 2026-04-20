-- Tutoriais da Home: conteúdo alinhado aos IDs que o app já renderiza ("1".."4").
--
-- Por que esta migration:
--   • A migration anterior (20260323400000) usou IDs textuais
--     ("primeiros-passos", "como-contratar"...), mas o frontend
--     (src/components/TutorialsSection.tsx) ainda renderiza IDs "1".."4" no
--     fallback hardcoded — e os links apontam para /tutorial/1, /tutorial/2 etc.
--   • Resultado: TutorialDetail busca id="1" em platform_settings.home_tutorials,
--     não encontra (porque o que está lá é "primeiros-passos") e mostra vazio.
--   • Esta migration sobrescreve home_tutorials com 4 tutoriais usando IDs
--     numéricos, mantendo labels iguais aos do fallback ("Como usar", "Como
--     contratar", "Como pagar", "Assinaturas e saques") para o app continuar
--     funcionando mesmo sem rebuild do client.

INSERT INTO public.platform_settings (key, value)
VALUES (
  'home_tutorials',
  '{
    "title": "Dúvidas sobre como usar o app?",
    "subtitle": "Acesse nossos tutoriais!",
    "items": [
      {
        "id": "1",
        "icon": "BookOpen",
        "label": "Como usar",
        "path": "/tutorial/1",
        "description": "",
        "steps": [
          "Crie sua conta com e-mail, Google ou Apple. No primeiro acesso o app pede CPF, telefone, data de nascimento e cidade — esses dados ajudam a mostrar profissionais perto de você.",
          "Na tela Início você vê profissionais em destaque da sua região, categorias rápidas e atalhos para vagas e tutoriais.",
          "Use a aba Buscar (lupa) para encontrar por nome, profissão ou serviço (ex.: ''eletricista'', ''cabeleireira'', ''designer'').",
          "Toque em qualquer profissional para ver o perfil completo: foto, descrição, serviços oferecidos, preços, avaliações e localização.",
          "Use ''Solicitar serviço'' na Home quando quiser publicar um pedido aberto e deixar profissionais da sua cidade entrarem em contato.",
          "Use a aba Chat para conversar com profissionais que você já contatou. Notificações chegam por push assim que receber resposta.",
          "Em Perfil você gerencia seus dados, formas de pagamento, indicações, suporte e tema claro/escuro do app."
        ]
      },
      {
        "id": "2",
        "icon": "UserCheck",
        "label": "Como contratar",
        "path": "/tutorial/2",
        "description": "",
        "steps": [
          "Encontre o profissional ideal: explore categorias na Home, use a Busca ou abra ''Solicitar serviço'' para receber propostas.",
          "Compare antes de contratar: avaliações, total de serviços feitos, tempo médio de resposta e selo de Verificado indicam quem é mais confiável.",
          "Toque em ''Contratar'' ou ''Chat'' no perfil para abrir uma conversa direta com o profissional.",
          "No chat, descreva o serviço, envie fotos e combine valor, data e local. Você pode pedir orçamento por escrito ali mesmo.",
          "Para agendamento, peça ao profissional que envie um agendamento pelo botão de calendário no chat — você recebe notificação para confirmar.",
          "Quando combinarem o serviço, o profissional pode te enviar uma cobrança pelo app (PIX ou cartão). Toque para pagar com segurança, sem dinheiro em espécie.",
          "Depois do serviço, deixe sua avaliação de 1 a 5 estrelas. Sua nota ajuda outros clientes e melhora o ranking de quem trabalha bem."
        ]
      },
      {
        "id": "3",
        "icon": "CreditCard",
        "label": "Como pagar",
        "path": "/tutorial/3",
        "description": "",
        "steps": [
          "O profissional cria a cobrança no chat — você recebe um card de pagamento com valor, descrição e prazo.",
          "Escolha PIX para pagamento instantâneo (aprovado em segundos) ou Cartão de crédito (à vista ou parcelado, conforme o profissional permitir).",
          "Se o profissional ativar ''juros do cliente'', as taxas de parcelamento aparecem destacadas antes de você confirmar — você decide se aceita.",
          "PIX: o app gera QR Code e código copia-e-cola. Pague pelo seu banco e a confirmação chega automática nos dois lados.",
          "Cartão: cadastre o cartão (com segurança, processado pelo gateway Asaas) e confirme. Pode usar mais de um cartão salvo.",
          "Após pagar você recebe comprovante no chat e nas notificações. O profissional é avisado na hora.",
          "Pagou e algo deu errado (serviço não entregue, valor errado)? Acesse Perfil → Suporte para abrir chamado — analisamos o caso."
        ]
      },
      {
        "id": "4",
        "icon": "Wallet",
        "label": "Assinaturas e saques",
        "path": "/tutorial/4",
        "description": "",
        "steps": [
          "Para profissionais: acesse Perfil → Planos e Assinatura para conhecer os planos Free, Pro, VIP e Business — cada um libera mais recursos (mais chamadas, agenda, vitrine de produtos, prioridade nos destaques).",
          "Pague o plano por cartão (cobrança mensal automática via Asaas) ou pelo App Store/Google Play se estiver no celular. A renovação é automática até você cancelar.",
          "Cancelar assinatura: Perfil → Planos e Assinatura → Cancelar. Você continua usando o plano até o fim do período já pago, depois volta automaticamente para o Free.",
          "Profissionais com plano ativo podem cobrar clientes pelo app. Todo valor recebido cai na sua Carteira dentro do app (Painel Profissional → Carteira).",
          "Acesse Carteira para ver saldo disponível, saldo a liberar (cartão ainda em compensação) e histórico completo de cobranças.",
          "Para sacar: peça transferência para sua chave PIX cadastrada. PIX cai na hora; cartão sem antecipação leva o prazo padrão da operadora.",
          "Antecipação de cartão: ative ''Receber antecipado'' no momento da cobrança e o valor fica disponível mais rápido (com taxa de antecipação informada antes)."
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();
