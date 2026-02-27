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
import { CheckCircle2, Star } from "lucide-react";

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

// ✅ VARIÁVEL GLOBAL: Fica fora do ciclo de vida do React para nunca perder o valor e bloquear o loop
let globalLastUrl = "";

const AppContent = () => {
  const [session, setSession] = useState<any>(null);
  const [initializing, setInitializing] = useState(true);
  const navigate = useNavigate();

  const handleAuthRedirect = useCallback(async (urlStr: string) => {
    if (!urlStr || !isAuthUrl(urlStr)) return;
    
    // ✅ TRAVA DE SEGURANÇA: Se já processamos essa URL exata, ignora na hora e aborta o loop!
    if (globalLastUrl === urlStr) return;
    globalLastUrl = urlStr; 

    try {
      console.log("🚀 Processando Deep Link:", urlStr);

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
        console.log("🔑 Trocando Auth Code por sessão...");
        
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (error) {
          if (error.message.includes("PKCE") || error.message.includes("verifier")) {
             console.log("⚠️ Código já foi utilizado, ignorando sem travar o app.");
             return;
          }
          throw error;
        }
        
        if (data.session) {
          console.log("✅ Sessão gerada com sucesso via Google!");
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
          console.log("✅ Sessão validada (Token Antigo)!");
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
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      
      setInitializing(false);
      if (Capacitor.isNativePlatform()) {
        await SplashScreen.hide({ fadeOutDuration: 400 });
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setInitializing(false);
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const deviceId = localStorage.getItem("chamo_device_id");
    if (!deviceId) return;

    const channel = supabase
      .channel('device_expulsion')
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'user_devices' },
        async (payload) => {
          if (payload.old?.device_id === deviceId) {
            await supabase.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            alert("Sua sessão foi encerrada por conexão em outro dispositivo.");
            navigate("/login?expelled=true");
          }
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [navigate]);

  // Landing Page Logic
  const isWeb = Capacitor.getPlatform() === 'web';
  const currentPath = window.location.pathname;
  const isRootPath = currentPath === '/' || currentPath === '/index.html';
  const isWebBypassed = localStorage.getItem('chamo_web_bypass') === 'true';

  if (initializing && !isWeb) return null;

  if (isWeb && isRootPath && !isWebBypassed) {
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
        <div className="absolute inset-0 bg-black/20 md:hidden"></div>

        <header className="absolute top-0 left-0 right-0 z-20 container mx-auto p-6 md:px-12 flex justify-between items-center">
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

        <main className="relative z-10 container mx-auto px-6 md:px-12 flex-1 flex flex-col justify-center mt-16 md:mt-0 max-w-7xl">
          <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h1 className="text-5xl md:text-7xl font-bold text-white leading-[1.1] tracking-tight">
              O profissional ideal,<br className="hidden md:block" />
              <span className="text-primary"> na palma da sua mão.</span>
            </h1>

            <div className="space-y-4 pt-2">
               <div className="flex items-center gap-3">
                 <CheckCircle2 className="w-7 h-7 text-[#00E676] fill-[#00E676]/20" />
                 <span className="text-white text-lg md:text-xl font-medium">Contrate, gerencie e pague com segurança</span>
               </div>
               <div className="flex items-center gap-3">
                 <CheckCircle2 className="w-7 h-7 text-[#00E676] fill-[#00E676]/20" />
                 <span className="text-white text-lg md:text-xl font-medium">O ecossistema mais completo do mercado</span>
               </div>
            </div>

            <div className="border border-white/20 bg-black/40 backdrop-blur-md rounded-2xl p-5 w-fit shadow-2xl mt-4">
              <p className="text-white text-sm font-medium mb-2">Seguro e confiável</p>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex text-yellow-400">
                   <Star className="w-5 h-5 fill-current" />
                   <Star className="w-5 h-5 fill-current" />
                   <Star className="w-5 h-5 fill-current" />
                   <Star className="w-5 h-5 fill-current" />
                   <Star className="w-5 h-5 fill-current" />
                </div>
                <span className="text-white font-bold ml-1 text-lg">4.9</span>
              </div>
              <p className="text-white/70 text-sm mt-1">Baseado em +200.000 avaliações</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-6">
              <a href="#" className="flex items-center justify-center gap-3 bg-[#1A1A1A] hover:bg-black text-white px-8 py-4 rounded-2xl transition-all shadow-xl border border-white/5 group">
                <svg viewBox="0 0 512 512" fill="currentColor" className="w-7 h-7 group-hover:-translate-y-1 transition-transform"><path d="M325.3 234.3c-13.6 0-24.7-11.1-24.7-24.7 0-13.6 11.1-24.7 24.7-24.7 13.6 0 24.7 11.1 24.7 24.7 0 13.6-11.1 24.7-24.7 24.7zm-138.6 0c-13.6 0-24.7-11.1-24.7-24.7 0-13.6 11.1-24.7 24.7-24.7 13.6 0 24.7 11.1 24.7 24.7 0 13.6-11.1 24.7-24.7 24.7zm156.4-106.3l35.8-61.9c1.9-3.3.6-7.5-2.8-9.4-3.3-1.9-7.5-.6-9.4 2.8L330.4 122c-21.5-9.9-45.5-15.5-70.9-15.5s-49.4 5.6-70.9 15.5l-36.4-63c-1.9-3.3-6.1-4.7-9.4-2.8-3.3 1.9-4.7 6.1-2.8 9.4l35.8 61.9c-45.5 25.2-76.4 71.9-80.1 126.7h322.9c-3.6-54.8-34.6-101.5-80.1-126.7zM259.5 405.5h-7V297.8h-63.5v107.7h-7v66.3c0 9.1 7.2 16.3 16.3 16.3h37.8c9.1 0 16.3-7.2 16.3-16.3v-66.3h7v-107.7z"/></svg>
                <span className="text-[1.35rem] font-bold tracking-tight">Google Play</span>
              </a>
              <a href="#" className="flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-black px-8 py-4 rounded-2xl transition-all shadow-xl group">
                <svg viewBox="0 0 384 512" fill="currentColor" className="w-7 h-7 group-hover:-translate-y-1 transition-transform"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
                <span className="text-[1.35rem] font-bold tracking-tight">App Store</span>
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
        <Route path="/" element={session ? <Navigate to="/home" /> : <Index />} />
        <Route path="/login" element={!session ? <Login /> : <Navigate to="/home" />} />
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