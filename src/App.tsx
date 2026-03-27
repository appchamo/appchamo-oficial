import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { SplashScreen } from '@capacitor/splash-screen';
import { CustomSplash, type SplashConfig } from "@/components/CustomSplash";
import { supabase } from "@/integrations/supabase/client"; 
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom";
import { usePrevious } from "@/hooks/usePrevious";
import { isMainAppTabPath, isOverlayStackRoute } from "@/lib/mainAppTabs";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { RefreshProvider } from "@/contexts/RefreshContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import SupportDeskRoute from "@/components/auth/SupportDeskRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import EdgeSwipeBack from "@/components/EdgeSwipeBack";
import MainTabPersistentLayers, { TabRoutePlaceholder } from "@/components/MainTabPersistentLayers";
import RoutesOverlayShell from "@/components/RoutesOverlayShell";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import { syncAppIconBadge } from "@/lib/appBadge";
import { diagLog, diagEnabled } from "@/lib/diag";

// Lazy pages – carregam sob demanda para navegação mais rápida
const Index = lazy(() => import("./pages/Index"));
const SponsorDashboard = lazy(() => import("./pages/SponsorDashboard"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const PostLoginGate = lazy(() => import("./pages/PostLoginGate"));
const HardReload = lazy(() => import("./pages/HardReload"));
const Categories = lazy(() => import("./pages/Categories"));
const CategoryDetail = lazy(() => import("./pages/CategoryDetail"));
const MessageThread = lazy(() => import("./pages/MessageThread"));
const Coupons = lazy(() => import("./pages/Coupons"));
const Jobs = lazy(() => import("./pages/Jobs"));
const RewardsProgram = lazy(() => import("./pages/RewardsProgram"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const MyJobPostings = lazy(() => import("./pages/MyJobPostings"));
const MyCatalog = lazy(() => import("./pages/MyCatalog"));
const MyServices = lazy(() => import("./pages/MyServices"));
const ClientRequests = lazy(() => import("./pages/ClientRequests"));
const ClientDashboard = lazy(() => import("./pages/ClientDashboard"));
const ProfessionalDashboard = lazy(() => import("./pages/ProfessionalDashboard"));
const ProfessionalFinancial = lazy(() => import("./pages/ProfessionalFinancial"));
const ProfessionalProfile = lazy(() => import("./pages/ProfessionalProfile"));
const ProAgenda = lazy(() => import("./pages/ProAgenda"));
const ProAgendaCalendar = lazy(() => import("./pages/ProAgendaCalendar"));
const Community = lazy(() => import("./pages/Community"));
const MeusAgendamentos = lazy(() => import("./pages/MeusAgendamentos"));
const PublicAgenda = lazy(() => import("./pages/PublicAgenda"));
const BecomeProfessional = lazy(() => import("./pages/BecomeProfessional"));
const Support = lazy(() => import("./pages/Support"));
const SupportThread = lazy(() => import("./pages/SupportThread"));
const Terms = lazy(() => import("./pages/Terms"));
const TermsOfUse = lazy(() => import("./pages/TermsOfUse"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const ExclusaoDeConta = lazy(() => import("./pages/ExclusaoDeConta"));
const TutorialDetail = lazy(() => import("./pages/TutorialDetail"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const HowToUse = lazy(() => import("./pages/HowToUse"));
const HowToHire = lazy(() => import("./pages/HowToHire"));
const HowToPay = lazy(() => import("./pages/HowToPay"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const NotFound = lazy(() => import("./pages/NotFound"));
const QrAuthWeb = lazy(() => import("./pages/QrAuthWeb"));
const QrScannerApp = lazy(() => import("./pages/QrScannerApp"));
const JobApply = lazy(() => import("./pages/JobApply"));
const BusinessCheckout = lazy(() => import("./pages/BusinessCheckout"));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings"));
const ProfileSettingsPassword = lazy(() => import("./pages/ProfileSettingsPassword"));
const ProfileSettingsAddress = lazy(() => import("./pages/ProfileSettingsAddress"));
const ProfessionalReports = lazy(() => import("./pages/ProfessionalReports"));

const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminPros = lazy(() => import("./pages/admin/AdminPros"));
const AdminSponsors = lazy(() => import("./pages/admin/AdminSponsors"));
const AdminTransactions = lazy(() => import("./pages/admin/AdminTransactions"));
const AdminWallet = lazy(() => import("./pages/admin/AdminWallet"));
const ProWallet = lazy(() => import("./pages/ProWallet"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminLogs = lazy(() => import("./pages/admin/AdminLogs"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminProfessions = lazy(() => import("./pages/admin/AdminProfessions"));
const AdminBanners = lazy(() => import("./pages/admin/AdminBanners"));
const AdminProtocols = lazy(() => import("./pages/admin/AdminProtocols"));
const AdminSupport = lazy(() => import("./pages/admin/AdminSupport"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminLayoutPage = lazy(() => import("./pages/admin/AdminLayout"));
const SupportDesk = lazy(() => import("./pages/SupportDesk"));
const SupportDeskNotifications = lazy(() => import("./pages/SupportDeskNotifications"));
const AdminTutorials = lazy(() => import("./pages/admin/AdminTutorials"));
const AdminProfiles = lazy(() => import("./pages/admin/AdminProfiles"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
    },
  },
});

const PageFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center" aria-hidden>
    <Loader2 className="w-8 h-8 text-primary animate-spin" />
  </div>
);

const ScrollToTop = () => {
  const { pathname } = useLocation();
  const prevPathname = usePrevious(pathname);
  useEffect(() => {
    const prev = prevPathname;
    // Voltar de rota empilhada (ex.: perfil profissional) para uma aba principal: mantém a posição de scroll da Home.
    if (prev != null && isOverlayStackRoute(prev) && isMainAppTabPath(pathname)) {
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, prevPathname]);
  return null;
};

/** Quando o usuário abre o app tocando numa push (ex.: mensagem), navega para o link (ex.: /messages/threadId). */
const NotificationOpenHandler = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: CustomEvent<{ link: string }>) => {
      const link = e.detail?.link;
      if (link && link.startsWith("/")) navigate(link);
    };
    window.addEventListener("chamo-notification-open", handler as EventListener);
    return () => window.removeEventListener("chamo-notification-open", handler as EventListener);
  }, [navigate]);
  return null;
};

const BackButtonHandler = () => {
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    const handlerPromise = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (pathRef.current === "/home") {
        CapacitorApp.minimizeApp();
        return;
      }
      if (canGoBack) window.history.back();
      else CapacitorApp.minimizeApp();
    });
    return () => {
      handlerPromise.then((h) => h.remove());
    };
  }, []);
  return null;
};

/** Patrocinador sempre fica no painel: se estiver logado como sponsor e em rota que não seja /sponsor/*, redireciona para /sponsor/dashboard */
const SponsorRedirectGuard = () => {
  const { profile, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !profile) return;
    if (profile.user_type !== "sponsor") return;
    const path = location.pathname;
    if (path.startsWith("/sponsor")) return;
    if (path === "/login" || path === "/reset-password") return;
    navigate("/sponsor/dashboard", { replace: true });
  }, [loading, profile, location.pathname, navigate]);

  return null;
};

/** Admin sempre fica no painel: se estiver logado como admin e em rota do app (não admin), redireciona para /admin */
const AdminRedirectGuard = () => {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session?.user) return;
    const email = (session.user.email || "").toLowerCase().trim();
    if (email !== "admin@appchamo.com") return;

    const path = location.pathname;
    if (path.startsWith("/admin")) return;
    if (path === "/login" || path === "/signup" || path === "/reset-password" || path === "/admin/login") return;
    if (path === "/terms-of-use" || path === "/privacy" || path === "/exclusao-de-conta") return;

    navigate("/admin", { replace: true });
  }, [loading, session?.user, location.pathname, navigate]);

  return null;
};

const SPLASH_KEYS = ["splash_logo_url", "splash_bg_color", "splash_animation", "splash_duration_seconds"] as const;
const SPLASH_SHOWN_KEY = "chamo_splash_shown";

/** No Android, cria o canal "default" logo na abertura do app para push em background aparecer. */
/** Redireciona usuário logado: admin → /admin, suporte → /suporte-desk; demais → /home */
const RedirectLoggedIn = () => {
  const { user, profile, loading } = useAuth();
  const email = (user?.email || "").toLowerCase().trim();
  const [signupInProgress, setSignupInProgress] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("signup_in_progress") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSignupInProgress(localStorage.getItem("signup_in_progress") === "true");
    } catch {
      // ignore
    }
  }, []);

  if (email === "admin@appchamo.com") return <Navigate to="/admin" replace />;
  if (email === "suporte@appchamo.com") return <Navigate to="/suporte-desk" replace />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Patrocinador → vai direto pro painel deles
  if (profile?.user_type === "sponsor") return <Navigate to="/sponsor/dashboard" replace />;

  if (signupInProgress) {
    return <Navigate to="/signup" replace />;
  }

  if (!profile) return <Navigate to="/post-login" replace />;
  return <Navigate to="/home" replace />;
};

const AndroidPushChannelInit = () => {
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
      LocalNotifications.createChannel({
        id: "default",
        name: "Notificações",
        importance: 5,
        visibility: 1,
      }).catch(() => {});
    });
  }, []);
  return null;
};

/** No app nativo: ao iniciar, zera o badge logo (evita "1" que vem por padrão ao instalar). Depois a contagem certa é reposta pelo BottomNav ou mantida 0 quando deslogado. */
const AppIconBadgeResetOnLaunch = () => {
  const didReset = useRef(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || didReset.current) return;
    didReset.current = true;
    syncAppIconBadge(0);
  }, []);
  return null;
};

/** No app nativo: quando não há usuário logado, zera o badge do ícone (evita "1" antes de login ou em vários dispositivos). */
const AppIconBadgeClearWhenLoggedOut = () => {
  const { session, loading } = useAuth();
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || loading) return;
    if (session?.user) return;
    syncAppIconBadge(0);
  }, [loading, session?.user]);
  return null;
};

/** No mobile: com sessão ativa, redireciona rotas de auth (/oauth-callback, /login).
 * - Se fluxo veio de "Cadastrar" (signup_in_progress): volta para /signup.
 * - Caso contrário: manda para /home.
 */
const OAuthCallbackRedirectGuard = () => {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || loading) return;
    if (!session?.user) return; 
    const path = location.pathname;
    if (path === "/oauth-callback" || path === "/login") {
      if (profile?.user_type === "sponsor") {
        navigate("/sponsor/dashboard", { replace: true });
        return;
      }
      let fromSignup = false;
      try {
        fromSignup = localStorage.getItem("signup_in_progress") === "true";
      } catch {
        fromSignup = false;
      }
      navigate(fromSignup ? "/signup" : "/home", { replace: true });
    }
  }, [loading, location.pathname, session?.user, profile, navigate]);
  return null;
};

/** Prefetch das páginas mais usadas. Mensagens em segundo plano assim que o usuário entra no app. */
const RoutePrefetcher = () => {
  useEffect(() => {
    const prefetch = (fn: () => Promise<unknown>) => {
      fn().catch(() => {});
    };
    // Mensagens carrega em segundo plano logo ao entrar no app, para abrir instantâneo ao clicar
    const t = setTimeout(() => {
      prefetch(() => import("./pages/Messages"));
    }, 200);
    const schedule = typeof requestIdleCallback !== "undefined" ? requestIdleCallback : (cb: () => void) => setTimeout(cb, 500);
    schedule(() => {
      prefetch(() => import("./pages/Home"));
      prefetch(() => import("./pages/Profile"));
      prefetch(() => import("./pages/Search"));
      prefetch(() => import("./pages/Categories"));
      prefetch(() => import("./pages/Notifications"));
    });
    return () => clearTimeout(t);
  }, []);
  return null;
};

const AppContent = () => {
  const { session, loading } = useAuth();
  const [splashConfig, setSplashConfig] = useState<SplashConfig | null>(null);
  const [showCustomSplash, setShowCustomSplash] = useState(false);
  const hasShownSplashRef = useRef(false);

  useEffect(() => {
    if (!diagEnabled()) return;
    const onErr = (e: ErrorEvent) => diagLog("error", "window.error", e.message || "error", { filename: e.filename, lineno: e.lineno, colno: e.colno });
    const onRej = (e: PromiseRejectionEvent) => diagLog("error", "window.unhandledrejection", "unhandledrejection", { reason: String((e as any).reason ?? "") });
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    diagLog("info", "app", "diagnóstico ligado", { path: window.location.pathname, search: window.location.search });
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  useEffect(() => {
    if (loading) {
      setShowCustomSplash(false);
      return;
    }
    // Usuário já logado (ex.: voltou do OAuth): não mostrar splash, ir direto para o app
    if (session?.user) {
      try {
        sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");
      } catch (_) {}
      setShowCustomSplash(false);
      return;
    }
    // Só na abertura do app: uma vez por sessão (sessionStorage sobrevive a remounts)
    if (hasShownSplashRef.current) return;
    try {
      if (sessionStorage.getItem(SPLASH_SHOWN_KEY) === "1") return;
    } catch (_) {}
    hasShownSplashRef.current = true;
    try {
      sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");
    } catch (_) {}
    setShowCustomSplash(true);
    supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", SPLASH_KEYS)
      .then(({ data }) => {
        const map: SplashConfig = {};
        data?.forEach((r: { key: string; value: unknown }) => {
          if (SPLASH_KEYS.includes(r.key as any)) map[r.key as keyof SplashConfig] = r.value as string;
        });
        // Cache-bust da imagem do splash para mobile pegar alterações do admin
        const url = map.splash_logo_url?.trim();
        if (url) {
          const sep = url.includes("?") ? "&" : "?";
          map.splash_logo_url = `${url}${sep}v=${Date.now()}`;
        }
        setSplashConfig(Object.keys(map).length ? map : null);
      });
  }, [loading, session?.user]);

  const handleSplashFinish = useCallback(async () => {
    setShowCustomSplash(false);
    if (Capacitor.isNativePlatform()) {
      await SplashScreen.hide({ fadeOutDuration: 500 });
    }
  }, []);

  // No mobile: quando pulamos o CustomSplash (usuário já logado), esconder o splash nativo senão a tela "não carrega"
  useEffect(() => {
    if (loading || showCustomSplash) return;
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
    }
  }, [loading, showCustomSplash]);

  if (loading) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(160deg, #f97316 0%, #ea580c 55%, #c2410c 100%)" }}
      >
        {/* Círculos decorativos de fundo */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute top-1/3 left-8 w-16 h-16 rounded-full bg-white/10" />

        {/* Logo */}
        <div className="relative flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-2xl border-2 border-white/20">
            <img src="/icon-512.png" alt="Chamô" className="w-full h-full object-cover" />
          </div>
          <div className="text-center">
            <p className="text-white font-black text-3xl tracking-tight leading-none">Chamô</p>
            <p className="text-white/70 text-sm font-medium mt-1">Conectando você a quem resolve</p>
          </div>
        </div>

        {/* Spinner */}
        <div className="absolute bottom-20 flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-white/30 border-t-white animate-spin" style={{ borderWidth: 3 }} />
          <p className="text-white/60 text-xs font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (showCustomSplash) {
    return <CustomSplash config={splashConfig} onFinish={handleSplashFinish} />;
  }

  return (
    <>
      <OAuthCallbackRedirectGuard />
      <Suspense fallback={<PageFallback />}>
        <MainTabPersistentLayers />
        <RoutesOverlayShell>
        <Routes>
        <Route path="/" element={session ? <RedirectLoggedIn /> : <Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/oauth-callback" element={<OAuthCallback />} />
        <Route path="/post-login" element={<PostLoginGate />} />
        <Route path="/hard-reload" element={<HardReload />} />
        <Route path="/terms-of-use" element={<TermsOfUse />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/exclusao-de-conta" element={<ExclusaoDeConta />} />

        <Route path="/signup" element={<Signup />} />
        <Route path="/complete-signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/signup-pro" element={<BecomeProfessional />} />

        {/* Rotas públicas (App Store: explorar sem login) */}
        <Route path="/home" element={<TabRoutePlaceholder />} />
        <Route path="/search" element={<TabRoutePlaceholder />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/category/:id" element={<CategoryDetail />} />
        <Route path="/messages" element={<TabRoutePlaceholder />} />
        <Route path="/messages/:threadId" element={<ProtectedRoute><MessageThread /></ProtectedRoute>} />
        <Route path="/notifications" element={<TabRoutePlaceholder />} />
        <Route path="/coupons" element={<ProtectedRoute><Coupons /></ProtectedRoute>} />
        <Route path="/profile" element={<TabRoutePlaceholder />} />
        <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
        <Route path="/rewards" element={<ProtectedRoute><RewardsProgram /></ProtectedRoute>} />
        <Route path="/jobs/:id" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
        <Route path="/jobs/:id/apply" element={<JobApply />} />
        <Route path="/my-jobs" element={<ProtectedRoute><MyJobPostings /></ProtectedRoute>} />
        <Route path="/my-catalog" element={<ProtectedRoute><MyCatalog /></ProtectedRoute>} />
        <Route path="/my-services" element={<ProtectedRoute><MyServices /></ProtectedRoute>} />
        <Route path="/client" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>} />
        <Route path="/client/requests" element={<ProtectedRoute><ClientRequests /></ProtectedRoute>} />
        <Route path="/pro" element={<ProtectedRoute><ProfessionalDashboard /></ProtectedRoute>} />
        <Route path="/pro-dashboard" element={<ProtectedRoute><ProfessionalDashboard /></ProtectedRoute>} />
        <Route path="/pro/financeiro" element={<ProtectedRoute><ProfessionalFinancial /></ProtectedRoute>} />
        <Route path="/pro/carteira" element={<ProtectedRoute><ProWallet /></ProtectedRoute>} />
        <Route path="/pro/agenda" element={<ProtectedRoute><ProAgenda /></ProtectedRoute>} />
        <Route path="/pro/agenda/calendario" element={<ProtectedRoute><ProAgendaCalendar /></ProtectedRoute>} />
        <Route path="/pro/comunidade" element={<ProtectedRoute><Community /></ProtectedRoute>} />
        <Route path="/meus-agendamentos" element={<ProtectedRoute><MeusAgendamentos /></ProtectedRoute>} />
        <Route path="/pro/:id" element={<ProfessionalProfile />} />
        <Route path="/professional/:id" element={<ProfessionalProfile />} />
        <Route path="/agendar/:proKey" element={<PublicAgenda />} />
        <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
        <Route path="/support/:ticketId" element={<ProtectedRoute><SupportThread /></ProtectedRoute>} />
        <Route path="/suporte-desk" element={<SupportDeskRoute><SupportDesk /></SupportDeskRoute>} />
        <Route path="/suporte-desk/notificacoes" element={<SupportDeskRoute><SupportDeskNotifications /></SupportDeskRoute>} />
        <Route path="/terms" element={<ProtectedRoute><Terms /></ProtectedRoute>} />
        <Route path="/tutorial/:id" element={<ProtectedRoute><TutorialDetail /></ProtectedRoute>} />
        <Route path="/how-it-works" element={<ProtectedRoute><HowItWorks /></ProtectedRoute>} />
        <Route path="/how-to-use" element={<ProtectedRoute><HowToUse /></ProtectedRoute>} />
        <Route path="/how-to-hire" element={<ProtectedRoute><HowToHire /></ProtectedRoute>} />
        <Route path="/how-to-pay" element={<ProtectedRoute><HowToPay /></ProtectedRoute>} />
        <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
        <Route path="/profile/settings" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
        <Route path="/profile/settings/senha" element={<ProtectedRoute><ProfileSettingsPassword /></ProtectedRoute>} />
        <Route path="/profile/settings/endereco" element={<ProtectedRoute><ProfileSettingsAddress /></ProtectedRoute>} />
        <Route path="/profile/relatorios" element={<ProtectedRoute><ProfessionalReports /></ProtectedRoute>} />
        <Route path="/checkout/business" element={<BusinessCheckout />} />

        {/* QR Login */}
        <Route path="/qr-auth" element={<QrAuthWeb />} />
        <Route path="/qr-scan" element={<ProtectedRoute><QrScannerApp /></ProtectedRoute>} />

        {/* Painel do Patrocinador */}
        <Route path="/sponsor/dashboard" element={<ProtectedRoute><SponsorDashboard /></ProtectedRoute>} />

        <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/pros" element={<ProtectedRoute><AdminPros /></ProtectedRoute>} />
        <Route path="/admin/sponsors" element={<ProtectedRoute><AdminSponsors /></ProtectedRoute>} />
        <Route path="/admin/transactions" element={<ProtectedRoute><AdminTransactions /></ProtectedRoute>} />
        <Route path="/admin/wallet" element={<ProtectedRoute><AdminWallet /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute><AdminReports /></ProtectedRoute>} />
        <Route path="/admin/coupons" element={<ProtectedRoute><AdminCoupons /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
        <Route path="/admin/logs" element={<ProtectedRoute><AdminLogs /></ProtectedRoute>} />
        <Route path="/admin/categories" element={<ProtectedRoute><AdminCategories /></ProtectedRoute>} />
        <Route path="/admin/professions" element={<ProtectedRoute><AdminProfessions /></ProtectedRoute>} />
        <Route path="/admin/banners" element={<ProtectedRoute><AdminBanners /></ProtectedRoute>} />
        <Route path="/admin/protocols" element={<ProtectedRoute><AdminProtocols /></ProtectedRoute>} />
        <Route path="/admin/enterprise" element={<Navigate to="/admin/protocols" replace />} />
        <Route path="/admin/support" element={<ProtectedRoute><AdminSupport /></ProtectedRoute>} />
        <Route path="/admin/notifications" element={<ProtectedRoute><AdminNotifications /></ProtectedRoute>} />
        <Route path="/admin/layout" element={<ProtectedRoute><AdminLayoutPage /></ProtectedRoute>} />
        <Route path="/admin/tutorials" element={<ProtectedRoute><AdminTutorials /></ProtectedRoute>} />
        <Route path="/admin/profiles" element={<ProtectedRoute><AdminProfiles /></ProtectedRoute>} />

        <Route path="*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />
        </Routes>
        </RoutesOverlayShell>
      </Suspense>
    </>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <RefreshProvider>
              <ScrollToTop />
              <AdminRedirectGuard />
              <SponsorRedirectGuard />
              <AppIconBadgeResetOnLaunch />
              <AppIconBadgeClearWhenLoggedOut />
              <NotificationOpenHandler />
              <AndroidPushChannelInit />
              <RoutePrefetcher />
              <BackButtonHandler />
              <EdgeSwipeBack />
              <ErrorBoundary>
                <AppContent />
              </ErrorBoundary>
            </RefreshProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;