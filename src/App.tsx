import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>

            {/* ===== PUBLIC ===== */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* 🔥 IMPORTANTE: NÃO PROTEGER signup-pro */}
            <Route path="/signup-pro" element={<BecomeProfessional />} />

            {/* ===== PROTECTED (LOGGED-IN) ===== */}
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

            {/* ===== CATCH ALL ===== */}
            <Route path="*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />

          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
