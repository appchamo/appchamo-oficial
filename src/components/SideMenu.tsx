import { X, Home, Search, Grid3X3, FileText, MessageSquare, Ticket, User, Briefcase, LayoutDashboard, LogOut, Crown, ShoppingBag, UserPlus, HelpCircle, DollarSign, ScrollText } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const SideMenu = ({ isOpen, onClose }: SideMenuProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const sections = [
    {
      items: [
        { icon: Home, label: "Início", path: "/home" },
        { icon: Search, label: "Buscar Profissionais", path: "/search" },
        { icon: Grid3X3, label: "Categorias", path: "/categories" },
        { icon: Briefcase, label: "Vagas de Emprego", path: "/jobs" },
      ],
    },
    {
      title: "Meus Acessos",
      items: [
        { icon: LayoutDashboard, label: "Painel do Cliente", path: "/client" },
        ...(profile?.user_type === "professional" || profile?.user_type === "company"
          ? [
              { icon: Briefcase, label: "Painel Profissional", path: "/pro" },
              { icon: DollarSign, label: "Financeiro", path: "/pro/financeiro" },
              ...(profile?.user_type === "company"
                ? [
                    { icon: Briefcase, label: "Minhas Vagas", path: "/my-jobs" },
                    { icon: ShoppingBag, label: "Catálogo de Produtos", path: "/my-catalog" },
                  ]
                : []),
            ]
          : []),
      ],
    },
    {
      title: "Cliente",
      items: [
        { icon: FileText, label: "Minhas Solicitações", path: "/client/requests" },
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
        { icon: ScrollText, label: "Termos e Privacidade", path: "/terms" },
      ],
    },
  ];

  const handleLogout = async () => {
    onClose();
    await signOut();
    navigate("/");
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-foreground/40 z-40 animate-fade-in" onClick={onClose} />}
      <div className={`fixed top-0 right-0 h-full w-72 bg-card z-50 shadow-elevated transition-transform duration-300 flex flex-col ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between p-4 border-b">
          <span className="text-lg font-bold text-gradient">Chamô</span>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>
        <nav className="p-3 flex flex-col gap-1 flex-1 overflow-y-auto">
          {sections.map((section, sIdx) => (
            <div key={sIdx}>
              {section.title && (
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1">{section.title}</p>
              )}
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link key={item.path + item.label} to={item.path} onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${isActive ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
              {sIdx < sections.length - 1 && <div className="border-t my-2" />}
            </div>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="px-3 py-2 mb-2">
            <p className="text-xs font-medium text-foreground">{profile?.email || ""}</p>
            <p className="text-[10px] text-muted-foreground">{profile?.user_type === "professional" ? "Profissional" : profile?.user_type === "company" ? "Empresa" : "Cliente"}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium w-full">
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>
    </>
  );
};

export default SideMenu;
