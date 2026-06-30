import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, Users, BadgeCheck, Megaphone, 
  CreditCard, Wallet, Ticket, Settings, FileText, LogOut, Grid3X3, Briefcase, Image, Hash, HelpCircle, Bell, LayoutList, BarChart3, BookOpen, UserSearch, Menu, PieChart, Contact
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
  { icon: Users, label: "Usuários", path: "/admin/users" },
  { icon: PieChart, label: "Análise", path: "/admin/analise" },
  { icon: Contact, label: "CRM", path: "/admin/crm" },
  { icon: BadgeCheck, label: "Profissionais", path: "/admin/pros" },
  { icon: Megaphone, label: "Patrocinadores", path: "/admin/sponsors" },
  { icon: CreditCard, label: "Financeiro", path: "/admin/transactions" },
  { icon: Wallet, label: "Carteira / Repasses", path: "/admin/wallet" },
  { icon: BarChart3, label: "Relatórios", path: "/admin/reports" },
  { icon: Ticket, label: "Cupons & Sorteios", path: "/admin/coupons" },
  { icon: Grid3X3, label: "Categorias", path: "/admin/categories" },
  { icon: Briefcase, label: "Profissões", path: "/admin/professions" },
  { icon: Image, label: "Banners", path: "/admin/banners" },
  { icon: Hash, label: "Chamadas", path: "/admin/protocols" },
  { icon: HelpCircle, label: "Suporte", path: "/admin/support" },
  { icon: Bell, label: "Notificações", path: "/admin/notifications" },
  { icon: LayoutList, label: "Layout Home", path: "/admin/layout" },
  { icon: BookOpen, label: "Tutoriais", path: "/admin/tutorials" },
  { icon: UserSearch, label: "Ver Perfis", path: "/admin/profiles" },
  { icon: Settings, label: "Configurações", path: "/admin/settings" },
  { icon: FileText, label: "Logs", path: "/admin/logs" },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
}

const AdminLayout = ({ children, title }: AdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { adminUser, loading } = useAdminAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!adminUser?.id) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", adminUser.id)
        .eq("read", false)
        .is("deleted_at", null);
      setUnreadCount(count ?? 0);
    };
    fetchUnread();
    const channel = supabase
      .channel("admin-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${adminUser.id}` }, fetchUnread)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [adminUser?.id]);

  // ----- Badges de "novidades" por seção (zera ao abrir a página) -----
  const [secCounts, setSecCounts] = useState<Record<string, number>>({});

  const countSince = async (section: string, seenAt: string | null): Promise<number> => {
    const q = (qb: any) => (seenAt ? qb.gt("created_at", seenAt) : qb);
    if (section === "chamadas") {
      const { count } = await q(supabase.from("service_requests").select("*", { count: "exact", head: true }));
      return count ?? 0;
    }
    if (section === "suporte") {
      const { count } = await q(supabase.from("support_tickets").select("*", { count: "exact", head: true }));
      return count ?? 0;
    }
    if (section === "profissionais") {
      const { count } = await q(
        supabase.from("professionals").select("*", { count: "exact", head: true }).eq("profile_status", "pending"),
      );
      return count ?? 0;
    }
    return 0;
  };

  const loadSecCounts = useCallback(async () => {
    if (!adminUser?.id) return;
    const { data: seenRows } = await supabase
      .from("admin_section_seen" as never)
      .select("section, seen_at")
      .eq("admin_user_id", adminUser.id);
    const seenBy: Record<string, string> = {};
    ((seenRows as { section: string; seen_at: string }[]) || []).forEach((r) => { seenBy[r.section] = r.seen_at; });
    const [chamadas, suporte, profissionais] = await Promise.all([
      countSince("chamadas", seenBy["chamadas"] ?? null),
      countSince("suporte", seenBy["suporte"] ?? null),
      countSince("profissionais", seenBy["profissionais"] ?? null),
    ]);
    setSecCounts({ chamadas, suporte, profissionais });
  }, [adminUser?.id]);

  const markSeen = useCallback(async (section: string) => {
    if (!adminUser?.id) return;
    setSecCounts((c) => ({ ...c, [section]: 0 }));
    await supabase.from("admin_section_seen" as never).upsert(
      { admin_user_id: adminUser.id, section, seen_at: new Date().toISOString() } as never,
      { onConflict: "admin_user_id,section" } as never,
    );
  }, [adminUser?.id]);

  // Carrega contadores + atualiza ao chegar novidades (realtime).
  useEffect(() => {
    if (!adminUser?.id) return;
    loadSecCounts();
    const ch = supabase
      .channel("admin-sec-counts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_requests" }, loadSecCounts)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_tickets" }, loadSecCounts)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "professionals" }, loadSecCounts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [adminUser?.id, loadSecCounts]);

  // Ao abrir uma página com badge, marca como visto (zera).
  const SECTION_BY_PATH: Record<string, string> = {
    "/admin/protocols": "chamadas",
    "/admin/support": "suporte",
    "/admin/pros": "profissionais",
  };
  useEffect(() => {
    const section = SECTION_BY_PATH[location.pathname];
    if (section) void markSeen(section);
  }, [location.pathname, markSeen]);

  const badgeFor = (path: string): number => secCounts[SECTION_BY_PATH[path]] ?? 0;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-64 bg-card border-r flex-col flex-shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b">
          <Link to="/admin" className="text-xl font-extrabold text-gradient">Chamô Admin</Link>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {badgeFor(item.path) > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {badgeFor(item.path)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b px-3 md:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg hover:bg-muted transition-colors shrink-0"
              aria-label="Abrir menu de páginas"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-base md:text-lg font-bold text-foreground truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to="/admin/notifications"
              className="relative p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Notificações"
            >
              <Bell className="w-5 h-5 text-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <span className="text-xs text-muted-foreground hidden md:block">{adminUser?.email}</span>
            <button
              onClick={handleLogout}
              className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sair
            </button>
          </div>
        </header>

        {/* Abas: no desktop (md+) faixa horizontal; no tablet/phone menu via Sheet */}
        <nav className="hidden md:flex overflow-x-auto border-b border-border bg-muted/30 gap-1 px-2 py-2.5 scrollbar-hide min-h-[44px] items-center shrink-0">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
                {badgeFor(item.path) > 0 && (
                  <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                    {badgeFor(item.path)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-[280px] sm:max-w-[280px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Páginas do admin</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-0.5 pt-4">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                    {badgeFor(item.path) > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                        {badgeFor(item.path)}
                      </span>
                    )}
                  </Link>
                );
              })}
              <div className="border-t mt-2 pt-2">
                <button
                  onClick={() => { handleLogout(); setMenuOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors w-full"
                >
                  <LogOut className="w-4 h-4" /> Sair
                </button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>

        <main className="flex-1 p-3 md:p-6 overflow-x-hidden safe-area-bottom">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
