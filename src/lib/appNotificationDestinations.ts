/**
 * Rotas do menu lateral (SideMenu) — usadas no admin ao enviar notificação manual
 * para o utilizador abrir a app nessa página ao tocar na notificação.
 */
export const NOTIFICATION_MENU_DESTINATIONS: { label: string; path: string }[] = [
  { label: "Início", path: "/home" },
  { label: "Buscar Profissionais", path: "/search" },
  { label: "Categorias", path: "/categories" },
  { label: "Vagas de Emprego", path: "/jobs" },
  { label: "Programa de recompensas", path: "/rewards" },

  { label: "Carteira (Financeiro)", path: "/pro/financeiro" },
  { label: "Pedidos na região", path: "/pro/pedidos-abertos" },
  { label: "Comunidade", path: "/home?feed=comunidade" },
  { label: "Minhas Vagas", path: "/my-jobs" },
  { label: "Fotos de Serviços", path: "/my-services" },
  { label: "Catálogo de Produtos", path: "/my-catalog" },
  { label: "Minha agenda (calendário)", path: "/pro/agenda/calendario" },
  { label: "Configurar agenda", path: "/pro/agenda" },

  { label: "Minhas Solicitações", path: "/client/requests" },
  { label: "Pedidos abertos (cliente)", path: "/client/pedidos-abertos" },
  { label: "Meus agendamentos", path: "/meus-agendamentos" },
  { label: "Mensagens", path: "/messages" },
  { label: "Meus Cupons", path: "/coupons" },
  { label: "Meu Perfil", path: "/profile" },
  { label: "Planos", path: "/subscriptions" },
  { label: "Tornar-se Profissional", path: "/signup-pro" },
  { label: "Suporte", path: "/support" },
  { label: "Termos de Uso", path: "/terms-of-use" },
  { label: "Política de Privacidade", path: "/privacy" },
];
