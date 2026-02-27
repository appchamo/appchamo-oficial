import AppLayout from "@/components/AppLayout";
import BenefitsPanel from "@/components/BenefitsPanel";
import SponsorCarousel from "@/components/SponsorCarousel";
import FeaturedProfessionals from "@/components/FeaturedProfessionals";
import CategoriesGrid from "@/components/CategoriesGrid";
import TutorialsSection from "@/components/TutorialsSection";
import HomeBanners from "@/components/HomeBanners";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useHomeLayout } from "@/hooks/useHomeLayout";
import { Link, useNavigate } from "react-router-dom";
import { Zap, Ticket } from "lucide-react"; 
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import HomeSearchBar from "@/components/home/HomeSearchBar";
import HomeJobsBanner from "@/components/home/HomeJobsBanner";
import HomeWelcome from "@/components/home/HomeWelcome";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"; 
import { usePush } from "@/hooks/usePush"; // ✅ IMPORTAÇÃO DO HOOK DE PUSH

// ✅ 1. SKELETON LOADING: Mostrado enquanto a tela está processando (Evita o clarão)
const HomeSkeleton = () => (
  <div className="max-w-screen-lg mx-auto px-4 py-5 flex flex-col gap-6 w-full animate-in fade-in duration-500">
    {/* Welcome Header */}
    <div className="flex items-center gap-3 animate-pulse pt-2">
      <div className="w-12 h-12 bg-muted rounded-full"></div>
      <div className="space-y-2 flex-1">
        <div className="h-4 w-32 bg-muted rounded"></div>
        <div className="h-3 w-24 bg-muted rounded"></div>
      </div>
    </div>
    {/* Jobs / Search */}
    <div className="h-24 w-full bg-muted rounded-2xl animate-pulse"></div>
    {/* Sponsors */}
    <div className="space-y-3">
      <div className="h-4 w-24 bg-muted rounded animate-pulse"></div>
      <div className="h-32 w-full bg-muted rounded-2xl animate-pulse"></div>
    </div>
    {/* Categories */}
    <div className="space-y-3">
      <div className="h-4 w-32 bg-muted rounded animate-pulse"></div>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square bg-muted rounded-xl animate-pulse"></div>
        ))}
      </div>
    </div>
  </div>
);

const Home = () => {
  const { profile } = useAuth();
  const { isFreePlan, callsRemaining, loading: subLoading } = useSubscription();
  const { sections, isVisible, getSection } = useHomeLayout();
  const navigate = useNavigate();
  const userName = profile?.full_name?.split(" ")[0] || "Usuário";
  
  // ✅ ATIVAÇÃO DO PUSH: Registra o token assim que o perfil carregar
  usePush(profile?.user_id || profile?.id); 

  const [jobCount, setJobCount] = useState(0);
  const [showCoupon, setShowCoupon] = useState(false);
  const [isReady, setIsReady] = useState(false); // ✅ Controle de renderização global

  useEffect(() => {
    supabase.from("job_postings").select("id", { count: "exact", head: true }).eq("active", true).then(({ count }) => {
      setJobCount(count || 0);
    });

    const justSignedUp = localStorage.getItem("just_signed_up");
    if (justSignedUp === "true") {
      const timer = setTimeout(() => {
        setShowCoupon(true);
        localStorage.removeItem("just_signed_up"); 
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // ✅ 2. TRANSIÇÃO SUAVE: Espera o layout carregar para liberar a tela
  useEffect(() => {
    // Timeout de segurança (fallback caso a internet caia)
    const fallback = setTimeout(() => setIsReady(true), 1200); 
    
    if (sections && sections.length > 0 && profile) {
      setIsReady(true);
      clearTimeout(fallback);
    }
    return () => clearTimeout(fallback);
  }, [sections, profile]);

  const sectionComponents: Record<string, React.ReactNode> = {
    welcome: <HomeWelcome key="welcome" userName={userName} section={getSection("welcome")} />,
    sponsors: <SponsorCarousel key="sponsors" />,
    jobs: <HomeJobsBanner key="jobs" jobCount={jobCount} section={getSection("jobs")} />,
    search: <HomeSearchBar key="search" section={getSection("search")} />,
    featured: <FeaturedProfessionals key="featured" />,
    categories: <CategoriesGrid key="categories" />,
    benefits: <BenefitsPanel key="benefits" />,
    tutorials: <TutorialsSection key="tutorials" />
  };

  const bannerAfter: Record<string, string> = {
    welcome: "top",
    sponsors: "below_sponsors",
    search: "below_search",
    featured: "below_featured",
    categories: "below_categories"
  };

  // ✅ 3. RESERVA DE ESPAÇO: Evita que os componentes empurrem uns aos outros ("Piscada")
  const sectionMinHeights: Record<string, string> = {
    welcome: "min-h-[60px]",
    sponsors: "min-h-[160px]",
    jobs: "min-h-[90px]",
    search: "min-h-[60px]",
    featured: "min-h-[250px]",
    categories: "min-h-[300px]",
    benefits: "min-h-[200px]",
    tutorials: "min-h-[220px]"
  };

  return (
    <AppLayout>
      {!isReady ? (
        <HomeSkeleton />
      ) : (
        <main className="max-w-screen-lg mx-auto px-4 py-5 flex flex-col gap-6 bg-secondary animate-in fade-in duration-500">
          {!subLoading && isFreePlan && profile?.user_type !== "client" && callsRemaining <= 1 &&
          <Link to="/subscriptions" className="flex items-center gap-3 bg-accent border border-primary/20 rounded-xl p-3.5 hover:border-primary/40 transition-all">
              <Zap className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {callsRemaining <= 0 ? "Limite atingido!" : "Última chamada gratuita!"}
                </p>
                <p className="text-xs text-muted-foreground">Faça upgrade para chamadas ilimitadas</p>
              </div>
              <span className="text-xs font-semibold text-primary">Upgrade →</span>
            </Link>
          }

          {sections.filter((s) => s.visible).map((section) =>
            <div key={section.id} className={`w-full ${sectionMinHeights[section.id] || ""}`}>
              {sectionComponents[section.id]}
              {bannerAfter[section.id] && <HomeBanners position={bannerAfter[section.id]} />}
            </div>
          )}

          <HomeBanners position="bottom" />

          <footer className="text-center py-6 border-t mt-4">
            <p className="text-xs text-muted-foreground">
              © 2026 Chamô. Todos os direitos reservados.
            </p>
          </footer>
        </main>
      )}

      {/* Modal de Cupom */}
      <Dialog open={showCoupon} onOpenChange={setShowCoupon}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="text-center">🎉 Parabéns!</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
              <Ticket className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm text-foreground font-medium">
              Você ganhou <strong className="text-primary">1 cupom</strong> para o sorteio!
            </p>
          </div>
          <button
            onClick={() => setShowCoupon(false)}
            className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
          >
            Entendi!
          </button>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Home;