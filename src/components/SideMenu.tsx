import {
  X,
  Home,
  Search,
  Grid3X3,
  FileText,
  MessageSquare,
  Ticket,
  User,
  Briefcase,
  LogOut,
  Crown,
  ShoppingBag,
  UserPlus,
  HelpCircle,
  Wallet,
  ScrollText,
  Calendar,
  CalendarCheck,
  ShieldCheck,
  Image,
  Gift,
  UsersRound,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

type NavProps = {
  onNavigate?: () => void;
  /** Padding extra no rodapé (drawer precisa espaço para a bottom nav) */
  footerPaddingClass: string;
};

/** Lista e rodapé do menu — partilhado entre drawer (mobile) e barra lateral (desktop web). */
function SideMenuNav({ onNavigate, footerPaddingClass }: NavProps) {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { plan } = useSubscription();
  const isBusiness = plan?.id === "business";
  const canPostJobs = profile?.user_type === "company" || profile?.job_posting_enabled === true;

  const sections = [
    {
      items: [
        { icon: Home, label: "Início", path: "/home" },
        { icon: Search, label: "Buscar Profissionais", path: "/search" },
        { icon: Grid3X3, label: "Categorias", path: "/categories" },
        { icon: Briefcase, label: "Vagas de Emprego", path: "/jobs" },
        { icon: Gift, label: "Programa de recompensas", path: "/rewards" },
      ],
    },
    {
      title: "Meus Acessos",
      items: [
        ...(profile?.user_type === "professional" || profile?.user_type === "company"
          ? [
              { icon: Wallet, label: "Carteira", path: "/pro/financeiro" },
              { icon: UsersRound, label: "Comunidade", path: "/home?feed=comunidade" },
              ...(profile?.user_type === "company"
                ? [
                    { icon: Briefcase, label: "Minhas Vagas", path: "/my-jobs" },
                    ...((plan?.id === "vip" || plan?.id === "pro" || plan?.id === "business")
                      ? [{ icon: Image, label: "Fotos de Serviços", path: "/my-services" }]
                      : []),
                  ]
                : [
                    ...(canPostJobs ? [{ icon: Briefcase, label: "Minhas Vagas", path: "/my-jobs" }] : []),
                    ...((plan?.id === "pro" || plan?.id === "vip" || plan?.id === "business")
                      ? [{ icon: Image, label: "Fotos de Serviços", path: "/my-services" }]
                      : []),
                  ]),
              ...(isBusiness ? [{ icon: ShoppingBag, label: "Catálogo de Produtos", path: "/my-catalog" }] : []),
              ...(isBusiness
                ? [
                    { icon: Calendar, label: "Minha agenda", path: "/pro/agenda/calendario" },
                    { icon: Calendar, label: "Configurar agenda", path: "/pro/agenda" },
                  ]
                : []),
            ]
          : []),
        ...(profile?.user_type === "client" && canPostJobs
          ? [{ icon: Briefcase, label: "Minhas Vagas", path: "/my-jobs" }]
          : []),
      ],
    },
    {
      title: "Cliente",
      items: [
        { icon: FileText, label: "Minhas Solicitações", path: "/client/requests" },
        { icon: CalendarCheck, label: "Meus agendamentos", path: "/meus-agendamentos" },
        { icon: MessageSquare, label: "Mensagens", path: "/messages" },
        { icon: Ticket, label: "Meus Cupons", path: "/coupons" },
        { icon: User, label: "Meu Perfil", path: "/profile" },
        ...(profile?.user_type === "professional" || profile?.user_type === "company"
          ? [{ icon: Crown, label: "Planos", path: "/subscriptions" }]
          : []),
        ...(profile?.user_type === "client"
          ? [{ icon: UserPlus, label: "Tornar-se Profissional", path: "/signup-pro" }]
          : []),
        { icon: HelpCircle, label: "Suporte", path: "/support" },
        { icon: ScrollText, label: "Termos de Uso", path: "/terms-of-use" },
        { icon: ShieldCheck, label: "Política de Privacidade", path: "/privacy" },
      ],
    },
  ];

  const handleLogout = async () => {
    onNavigate?.();
    await signOut();
    window.location.href = "/login";
  };

  return (
    <>
      <nav className="p-3 flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {sections.map((section, sIdx) => (
          <div key={sIdx}>
            {section.title && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1">
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const isComunidadeHome = item.path === "/home?feed=comunidade";
              const isActive = isComunidadeHome
                ? location.pathname === "/home" &&
                  new URLSearchParams(location.search).get("feed") === "comunidade"
                : location.pathname === item.path;
              const isTornarSePro = item.path === "/signup-pro";
              const isFinanceiro = item.path === "/pro/financeiro";
              return (
                <Link
                  key={item.path + item.label}
                  to={item.path}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium",
                    isActive && !isFinanceiro && "bg-accent text-accent-foreground",
                    !isActive && !isFinanceiro && "text-foreground hover:bg-muted",
                    isFinanceiro &&
                      "border-2 border-primary/60 bg-primary/12 text-primary font-semibold shadow-sm hover:bg-primary/18",
                    isFinanceiro && isActive && "ring-2 ring-primary/30",
                  )}
                  {...(isTornarSePro ? { "data-onboarding": "tornar-se-pro" } : {})}
                >
                  <item.icon className={cn("w-4 h-4 shrink-0", isFinanceiro && "text-primary")} />
                  {item.label}
                </Link>
              );
            })}
            {sIdx < sections.length - 1 && <div className="border-t my-2" />}
          </div>
        ))}
      </nav>
      <div className={cn("border-t p-3 shrink-0", footerPaddingClass)}>
        <div className="px-3 py-2 mb-2">
          <p className="text-xs font-medium text-foreground truncate">{profile?.email || "—"}</p>
          <p className="text-[10px] text-muted-foreground">
            {profile?.user_type === "professional"
              ? "Profissional"
              : profile?.user_type === "company"
                ? "Empresa"
                : profile
                  ? "Cliente"
                  : "Visitante"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sair
        </button>
      </div>
    </>
  );
}

/** Barra lateral fixa à esquerda — só `lg+` (desktop web); não afeta app nativo nem viewport estreita. */
export function DesktopSidebar() {
  return (
    <aside
      className="hidden lg:flex w-[min(280px,22vw)] min-w-[240px] max-w-[300px] shrink-0 flex-col self-stretch min-h-0 max-h-[100dvh] sticky top-0 border-r border-border bg-card z-20 shadow-sm"
      aria-label="Menu principal"
    >
      <div className="flex items-center px-4 py-4 border-b border-border shrink-0">
        <span className="text-xl font-bold text-gradient">Chamô</span>
      </div>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <SideMenuNav footerPaddingClass="pb-8" />
      </div>
    </aside>
  );
}

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Drawer deslizante à direita — apenas abaixo de `lg` (mobile / tablet estreito). */
const SideMenu = ({ isOpen, onClose }: SideMenuProps) => {
  return (
    <div className="lg:hidden">
      {isOpen && (
        <div
          className="fixed inset-0 bg-foreground/40 z-40 animate-fade-in"
          onClick={onClose}
          aria-hidden
        />
      )}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-72 max-w-[85vw] bg-card z-50 shadow-elevated transition-transform duration-300 flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <span className="text-lg font-bold text-gradient">Chamô</span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <SideMenuNav onNavigate={onClose} footerPaddingClass="pb-16" />
        </div>
      </div>
    </div>
  );
};

export default SideMenu;
