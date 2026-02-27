import { useEffect, useState, useCallback } from "react";
import { Browser } from "@capacitor/browser";
import { App as CapacitorApp } from "@capacitor/app";
import { SplashScreen } from '@capacitor/splash-screen'; 
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from "react-router-dom"; 
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { CheckCircle2, Star, Loader2 } from "lucide-react";

// Pages
import Index from "./pages/Index";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import Search from "./pages/Search";
import Categories from "./pages/Categories";
import CategoryDetail from "./pages/CategoryDetail";
import Messages from "./pages/Messages";
import MessageThread from "./pages/MessageThread";
import Notifications from "./pages/Notifications";
import Coupons from "./pages/Coupons";
import Profile from "./pages/Profile";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import MyJobPostings from "./pages/MyJobPostings";
import MyCatalog from "./pages/MyCatalog";
import ClientRequests from "./pages/ClientRequests";
import ClientDashboard from "./pages/ClientDashboard";
import ProfessionalDashboard from "./pages/ProfessionalDashboard";
import ProfessionalFinancial from "./pages/ProfessionalFinancial";
import ProfessionalProfile from "./pages/ProfessionalProfile";
import BecomeProfessional from "./pages/BecomeProfessional";
import Support from "./pages/Support";
import SupportThread from "./pages/SupportThread";
import Terms from "./pages/Terms";
import TutorialDetail from "./pages/TutorialDetail";
import HowItWorks from "./pages/HowItWorks";
import HowToUse from "./pages/HowToUse";
import HowToHire from "./pages/HowToHire";
import HowToPay from "./pages/HowToPay";
import Subscriptions from "./pages/Subscriptions";
import NotFound from "./pages/NotFound";
import JobApply from "./pages/JobApply";
import BusinessCheckout from "./pages/BusinessCheckout";

// Admin
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminPros from "./pages/admin/AdminPros";
import AdminSponsors from "./pages/admin/AdminSponsors";
import AdminTransactions from "./pages/admin/AdminTransactions";
import AdminReports from "./pages/admin/AdminReports";
import AdminCoupons from "./pages/admin/AdminCoupons";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminLogs from "./pages/admin/AdminLogs";
import AdminCategories from "./pages/admin/AdminCategories";
import AdminProfessions from "./pages/admin/AdminProfessions";
import AdminBanners from "./pages/admin/AdminBanners";
import AdminEnterprise from "./pages/admin/AdminEnterprise";
import AdminSupport from "./pages/admin/AdminSupport";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminLayoutPage from "./pages/admin/AdminLayout";
import AdminTutorials from "./pages/admin/AdminTutorials";
import AdminProfiles from "./pages/admin/AdminProfiles";

const queryClient = new QueryClient();

const isAuthUrl = (url: string) => {
  return url.includes('com.chamo.app') || 
         url.includes('app.chamo.com') || 
         url.includes('supabase.co');
};

const BackButtonHandler = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else CapacitorApp.minimizeApp();
    });
    return () => { handler.then(h => h.remove()); };
  }, [navigate]);
  return null;
};

let globalLastUrl = "";

const AppContent = () => {
  const [session, setSession] = useState<any>(null);
  const [initializing, setInitializing] = useState(true);
  const navigate = useNavigate();

  const handleAuthRedirect = useCallback(async (urlStr: string) => {
    if (!urlStr || !isAuthUrl(urlStr)) return;
    if (globalLastUrl === urlStr) return;
    globalLastUrl = urlStr; 

    try {
      if (Capacitor.isNativePlatform()) {
        Browser.close().catch(() => {});
      }

      let fixedUrl = urlStr;
      if (fixedUrl.startsWith('com.chamo.app:?')) {
        fixedUrl = fixedUrl.replace('com.chamo.app:?', 'com.chamo.app://?');
      }
      
      fixedUrl = fixedUrl.replace(/#/g, "?");
      const urlObj = new URL(fixedUrl);
      const params = new URLSearchParams(urlObj.search);
      
      let code = params.get('code');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (code) {
        code = code.replace(/[^a-zA-Z0-9-]/g, '');
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (data.session) {
          setSession(data.session);
          localStorage.removeItem("manual_login_intent");
          setTimeout(() => navigate("/home", { replace: true }), 150);
        }
      } else if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error && data.session) {
          setSession(data.session);
          localStorage.removeItem("manual_login_intent");
          setTimeout(() => navigate("/home", { replace: true }), 150);
        }
      }
    } catch (err) {
      console.error('💥 Erro fatal no Deep Link:', err);
    }
  }, [navigate]);

  useEffect(() => {
    let urlListener: any = null;
    const setupListeners = async () => {
      urlListener = await CapacitorApp.addListener('appUrlOpen', (event: any) => {
        handleAuthRedirect(event.url);
      });
      const launchUrl = await CapacitorApp.getLaunchUrl();
      if (launchUrl?.url) {
        handleAuthRedirect(launchUrl.url);
      }
    };
    setupListeners();
    const iosHandler = (event: any) => handleAuthRedirect(event.detail);
    window.addEventListener('iosDeepLink', iosHandler);
    return () => {
      if (urlListener) urlListener.remove();
      window.removeEventListener('iosDeepLink', iosHandler);
    };
  }, [handleAuthRedirect]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Tenta pegar a sessão persistida no Preferences/HD
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
      } catch (err) {
        console.error("Erro ao recuperar sessão:", err);
      } finally {
        setInitializing(false);
        if (Capacitor.isNativePlatform()) {
          await SplashScreen.hide({ fadeOutDuration: 400 });
        }
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("🔔 Auth Change:", event);
      setSession(session);
      if (event === 'SIGNED_OUT') {
        setSession(null);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  // Landing Page Logic
  const isWeb = Capacitor.getPlatform() === 'web';
  const currentPath = window.location.pathname;
  const isRootPath = currentPath === '/' || currentPath === '/index.html';
  const isWebBypassed = localStorage.getItem('chamo_web_bypass') === 'true';

  // 1. Prioridade: Se estiver carregando a sessão, mostra um loader elegante em vez de tela branca
  if (initializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A0B00]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-white/60 mt-4 text-sm font-medium">Carregando Chamô...</p>
      </div>
    );
  }

  // 2. Landing Page para Web
  if (isWeb && isRootPath && !isWebBypassed && !session) {
    return (
      <div 
        className="relative min-h-screen flex flex-col justify-center overflow-hidden font-sans bg-[#1A0B00]"
        style={{
          backgroundImage: 'url("https://wfxeiuqxzrlnvlopcrwd.supabase.co/storage/v1/object/public/uploads/tutorials/135419.png")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-transparent"></div>
        <header className="absolute top-0 left-0 right-0 z-20 container mx-auto p-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
             <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-xl text-primary-foreground font-extrabold">C</span>
             </div>
             <span className="text-3xl font-extrabold text-white tracking-tight">Chamô</span>
          </div>
          <a href="/login" className="text-sm font-semibold text-white/80 hover:text-white transition-colors">
            Acesso Restrito
          </a>
        </header>

        <main className="relative z-10 container mx-auto px-6 flex-1 flex flex-col justify-center max-w-7xl">
          <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h1 className="text-5xl md:text-7xl font-bold text-white leading-[1.1] tracking-tight">
              O profissional ideal,<br className="hidden md:block" />
              <span className="text-primary"> na palma da sua mão.</span>
            </h1>
            <div className="flex flex-col sm:flex-row gap-4 pt-6">
              <a href="/login" className="flex items-center justify-center bg-white text-black px-8 py-4 rounded-2xl font-bold text-lg shadow-xl hover:bg-gray-100 transition-all">
                Começar Agora
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <AuthProvider>
      <BackButtonHandler />
      <Routes>
        <Route path="/" element={session ? <Navigate to="/home" replace /> : <Index />} />
        <Route path="/login" element={session ? <Navigate to="/home" replace /> : <Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/complete-signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/signup-pro" element={<BecomeProfessional />} />

        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
        <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
        <Route path="/category/:id" element={<ProtectedRoute><CategoryDetail /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/messages/:threadId" element={<ProtectedRoute><MessageThread /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/coupons" element={<ProtectedRoute><Coupons /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
        <Route path="/jobs/:id" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
        <Route path="/jobs/:id/apply" element={<JobApply />} />
        <Route path="/my-jobs" element={<ProtectedRoute><MyJobPostings /></ProtectedRoute>} />
        <Route path="/my-catalog" element={<ProtectedRoute><MyCatalog /></ProtectedRoute>} />
        <Route path="/client" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>} />
        <Route path="/client/requests" element={<ProtectedRoute><ClientRequests /></ProtectedRoute>} />
        <Route path="/pro" element={<ProtectedRoute><ProfessionalDashboard /></ProtectedRoute>} />
        <Route path="/pro-dashboard" element={<ProtectedRoute><ProfessionalDashboard /></ProtectedRoute>} />
        <Route path="/pro/financeiro" element={<ProtectedRoute><ProfessionalFinancial /></ProtectedRoute>} />
        <Route path="/pro/:id" element={<ProtectedRoute><ProfessionalProfile /></ProtectedRoute>} />
        <Route path="/professional/:id" element={<ProtectedRoute><ProfessionalProfile /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
        <Route path="/support/:ticketId" element={<ProtectedRoute><SupportThread /></ProtectedRoute>} />
        <Route path="/terms" element={<ProtectedRoute><Terms /></ProtectedRoute>} />
        <Route path="/tutorial/:id" element={<ProtectedRoute><TutorialDetail /></ProtectedRoute>} />
        <Route path="/how-it-works" element={<ProtectedRoute><HowItWorks /></ProtectedRoute>} />
        <Route path="/how-to-use" element={<ProtectedRoute><HowToUse /></ProtectedRoute>} />
        <Route path="/how-to-hire" element={<ProtectedRoute><HowToHire /></ProtectedRoute>} />
        <Route path="/how-to-pay" element={<ProtectedRoute><HowToPay /></ProtectedRoute>} />
        <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
        <Route path="/checkout/business" element={<BusinessCheckout />} />

        <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/pros" element={<ProtectedRoute><AdminPros /></ProtectedRoute>} />
        <Route path="/admin/sponsors" element={<ProtectedRoute><AdminSponsors /></ProtectedRoute>} />
        <Route path="/admin/transactions" element={<ProtectedRoute><AdminTransactions /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute><AdminReports /></ProtectedRoute>} />
        <Route path="/admin/coupons" element={<ProtectedRoute><AdminCoupons /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
        <Route path="/admin/logs" element={<ProtectedRoute><AdminLogs /></ProtectedRoute>} />
        <Route path="/admin/categories" element={<ProtectedRoute><AdminCategories /></ProtectedRoute>} />
        <Route path="/admin/professions" element={<ProtectedRoute><AdminProfessions /></ProtectedRoute>} />
        <Route path="/admin/banners" element={<ProtectedRoute><AdminBanners /></ProtectedRoute>} />
        <Route path="/admin/enterprise" element={<ProtectedRoute><AdminEnterprise /></ProtectedRoute>} />
        <Route path="/admin/support" element={<ProtectedRoute><AdminSupport /></ProtectedRoute>} />
        <Route path="/admin/notifications" element={<ProtectedRoute><AdminNotifications /></ProtectedRoute>} />
        <Route path="/admin/layout" element={<ProtectedRoute><AdminLayoutPage /></ProtectedRoute>} />
        <Route path="/admin/tutorials" element={<ProtectedRoute><AdminTutorials /></ProtectedRoute>} />
        <Route path="/admin/profiles" element={<ProtectedRoute><AdminProfiles /></ProtectedRoute>} />

        <Route path="*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;