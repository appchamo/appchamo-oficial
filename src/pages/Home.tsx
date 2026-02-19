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
import { Zap, Search, Star, BadgeCheck, X, Briefcase } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import HomeSearchBar from "@/components/home/HomeSearchBar";
import HomeJobsBanner from "@/components/home/HomeJobsBanner";
import HomeWelcome from "@/components/home/HomeWelcome";

const Home = () => {
  const { profile } = useAuth();
  const { isFreePlan, callsRemaining, loading: subLoading } = useSubscription();
  const { sections, isVisible, getSection } = useHomeLayout();
  const navigate = useNavigate();
  const userName = profile?.full_name?.split(" ")[0] || "Usuário";
  const [jobCount, setJobCount] = useState(0);

  useEffect(() => {
    supabase.from("job_postings").select("id", { count: "exact", head: true }).eq("active", true).then(({ count }) => {
      setJobCount(count || 0);
    });
  }, []);

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

  // Banner positions mapped after sections
  const bannerAfter: Record<string, string> = {
    welcome: "top",
    sponsors: "below_sponsors",
    search: "below_search",
    featured: "below_featured",
    categories: "below_categories"
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 flex flex-col gap-6 bg-secondary">
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
        <div key={section.id}>
            {sectionComponents[section.id]}
            {bannerAfter[section.id] && <HomeBanners position={bannerAfter[section.id]} />}
          </div>
        )}

        <HomeBanners position="bottom" />

        <footer className="text-center py-6 border-t mt-4">
          <p className="text-xs text-muted-foreground">
            O Chamô atua exclusivamente como intermediário. Não há vínculo empregatício entre a plataforma e os profissionais.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            © 2026 Chamô. Todos os direitos reservados.
          </p>
        </footer>
      </main>
    </AppLayout>);

};

export default Home;