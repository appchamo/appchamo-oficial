import { useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom"; 
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";

// Importação do Capacitor Core para detectar a plataforma
import { Capacitor } from "@capacitor/core";

// 👇 ADICIONADO: Ícones para a Landing Page
import { Smartphone, CheckCircle2, ShieldCheck, Trophy } from "lucide-react";

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

// 🛠️ FUNÇÃO DE REDIRECIONAMENTO "ANTI-CONGELAMENTO"
const handleAuthRedirect = async (urlStr: string) => {
  console.log('🚨 [VIGIA] Iniciando processamento de URL:', urlStr);
  try {
    const urlObj = new URL(urlStr);
    
    // Captura parâmetros tanto do hash (#) quanto da query (?)
    const paramsStr = urlObj.hash ? urlObj.hash.substring(1) : urlObj.search.substring(1);
    const params = new URLSearchParams(paramsStr);
    
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (accessToken && refreshToken) {
      console.log('🔥 [VIGIA] Tokens identificados. Limpando rota...');
      
      // 1. Limpa a URL visível para não confundir o React Router
      window.history.replaceState(null, "", "/");

      // 2. Injeta a sessão no Supabase
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!error) {
        console.log('✅ [VIGIA] Sessão injetada. Aguardando persistência...');
        
        // 3. O "PULO DO GATO": Delay de 500ms para o Android salvar o token no banco interno
        setTimeout(() => {
          window.location.assign("/home");
        }, 500);
        
      } else {
        console.error('❌ [VIGIA] Erro ao validar sessão:', error.message);
      }
    }
  } catch (err) {
    console.error('Erro fatal no processamento do Deep Link:', err);
  }
};

const isAuthUrl = (url: string) => {
  return url.includes('com.chamo.app://') || 
         url.includes('appchamo.com') || 
         url.includes('supabase.co');
};

// 🍎 PONTE DIRETA DO IPHONE
window.addEventListener('iosDeepLink', (event: any) => {
  const url = event.detail;
  if (isAuthUrl(url)) handleAuthRedirect(url);
});

// 🚀 OUVINTE GLOBAL CAPACITOR (Android)
CapacitorApp.addListener('appUrlOpen', (event: any) => {
  console.log('🚨 [VIGIA] Link capturado via App:', event.url);
  if (isAuthUrl(event.url)) handleAuthRedirect(event.url);
});

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

const App = () => {
  // EFEITO PARA NOTIFICAÇÕES PUSH
  useEffect(() => {
    const initPush = async () => {
      try {
        const permStatus = await PushNotifications.requestPermissions();
        if (permStatus.receive === 'granted') await PushNotifications.register();
      } catch (e) {
        console.log("Notificações só funcionam no celular nativo.");
      }
    };
    initPush();
  }, []);

  // VIGIA DE EXPULSÃO
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
            alert("Sua sessão foi encerrada porque você se conectou em outro dispositivo.");
            window.location.href = "/login?expelled=true";
          }
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // COLD START
  useEffect(() => {
    const checkColdStart = async () => {
      const launchUrl = await CapacitorApp.getLaunchUrl();
      if (launchUrl?.url && isAuthUrl(launchUrl.url)) {
        console.log('🧊 [COLD START] Processando link de abertura...');
        handleAuthRedirect(launchUrl.url);
      }
    };
    checkColdStart();
  }, []);

  // =========================================================================
  // 🛡️ TRAVA DE SEGURANÇA WEB (LANDING PAGE ESTILO HOTMART)
  // =========================================================================
  const isWeb = Capacitor.getPlatform() === 'web';
  const currentPath = window.location.pathname;
  const currentHash = window.location.hash;
  const currentSearch = window.location.search;
  
  // Exceções: Libera o Painel Admin e os Links de Recuperação de Senha do Supabase
  const isAdminRoute = currentPath.startsWith('/admin');
  const isPasswordRecovery = currentHash.includes("type=recovery") || currentSearch.includes("type=recovery");

  if (isWeb && !isAdminRoute && !isPasswordRecovery) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 overflow-hidden font-sans">
        {/* 1. Navbar Simples */}
        <header className="container mx-auto p-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
             <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-xl text-primary-foreground font-extrabold">C</span>
             </div>
             <span className="text-2xl font-extrabold text-foreground tracking-tight">Chamô</span>
          </div>
        </header>

        {/* 2. Hero Section */}
        <main className="container mx-auto px-6 pt-10 md:pt-20 flex flex-col-reverse md:flex-row items-center gap-12">
          
          {/* Coluna da Esquerda */}
          <div className="flex-1 text-center md:text-left space-y-8">
            <h1 className="text-4xl md:text-6xl font-extrabold text-foreground leading-tight">
              O profissional ideal, <br className="hidden md:block" />
              <span className="text-primary bg-primary/10 px-2 rounded-lg inline-block mt-2 md:mt-0">na palma da sua mão.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto md:mx-0 leading-relaxed">
              Segurança, rapidez e os melhores profissionais da sua região. 
              Baixe o Chamô e resolva seu problema hoje mesmo.
            </p>

            {/* Botões de Download */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-4">
              <a 
                href="#" // ⚠️ COLOQUE O LINK DA PLAY STORE AQUI NO FUTURO
                className="flex items-center gap-3 bg-foreground text-background px-6 py-4 rounded-2xl hover:bg-foreground/90 transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                <Smartphone className="w-8 h-8" />
                <div className="text-left">
                  <p className="text-xs font-medium opacity-80">Disponível no</p>
                  <p className="text-lg font-bold">Google Play</p>
                </div>
              </a>
               <a 
                href="#" // ⚠️ COLOQUE O LINK DA APP STORE AQUI NO FUTURO
                className="flex items-center gap-3 bg-white/50 text-foreground border-2 border-foreground/10 px-6 py-4 rounded-2xl hover:bg-white transition-all shadow-md hover:shadow-lg hover:-translate-y-1 backdrop-blur-sm"
              >
                <Smartphone className="w-8 h-8" />
                <div className="text-left">
                  <p className="text-xs font-medium opacity-80">Baixar na</p>
                  <p className="text-lg font-bold">App Store</p>
                </div>
              </a>
            </div>

             {/* Features (Prova Social) */}
             <div className="flex items-center justify-center md:justify-start gap-6 pt-6 text-sm font-medium text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <span>Pagamento Seguro</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span>Profissionais Verificados</span>
                </div>
             </div>
          </div>

          {/* Coluna da Direita (Mockup de Celular CSS) */}
          <div className="flex-1 relative w-full max-w-md md:max-w-lg lg:max-w-xl">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-primary/20 blur-3xl rounded-full -z-10 opacity-70"></div>
            
            <div className="relative mx-auto border-gray-800 bg-gray-800 border-[14px] rounded-[2.5rem] h-[600px] w-[300px] shadow-2xl ring-1 ring-gray-900/5">
                <div className="h-[32px] w-[3px] bg-gray-800 absolute -start-[17px] top-[72px] rounded-s-lg"></div>
                <div className="h-[46px] w-[3px] bg-gray-800 absolute -start-[17px] top-[124px] rounded-s-lg"></div>
                <div className="h-[46px] w-[3px] bg-gray-800 absolute -start-[17px] top-[176px] rounded-s-lg"></div>
                <div className="h-[64px] w-[3px] bg-gray-800 absolute -end-[17px] top-[142px] rounded-e-lg"></div>
                <div className="rounded-[2rem] overflow-hidden w-full h-full bg-background flex flex-col items-center justify-center relative">
                  <div className="absolute top-0 inset-x-0 h-6 bg-black w-40 mx-auto rounded-b-xl z-20"></div>
                  
                  {/* Conteúdo dentro da tela de mentira */}
                  <Trophy className="w-24 h-24 text-primary mb-4 animate-pulse" />
                  <h3 className="text-xl font-bold">Chamô App</h3>
                  <p className="text-sm text-muted-foreground mt-2 px-6 text-center">Sua melhor experiência no app.</p>
                </div>
            </div>
          </div>
        </main>
      </div>
    );
  }
  // =========================================================================

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <BackButtonHandler />
          <AuthProvider>
            <Routes>
              {/* ===== PUBLIC ===== */}
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/complete-signup" element={<Signup />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/signup-pro" element={<BecomeProfessional />} />

              {/* ===== PROTECTED ===== */}
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

              {/* ===== ADMIN PROTECTED ===== */}
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
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;