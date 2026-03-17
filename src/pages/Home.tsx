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
import { useRefresh, useIsRefreshing, useTriggerRefresh } from "@/contexts/RefreshContext";
import { Link, useNavigate } from "react-router-dom";
import { Zap, Ticket, CalendarCheck, X, MapPin, Briefcase, Loader2 } from "lucide-react"; 
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import HomeSearchBar from "@/components/home/HomeSearchBar";
import HomeJobsBanner from "@/components/home/HomeJobsBanner";
import HomeWelcome from "@/components/home/HomeWelcome";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"; 
import { usePush } from "@/hooks/usePush"; // ✅ IMPORTAÇÃO DO HOOK DE PUSH
import { toast } from "@/hooks/use-toast";
import { fetchViaCep } from "@/lib/viacep";

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
  const { profile, user, refreshProfile, loading: authLoading } = useAuth();
  const { isFreePlan, callsRemaining, loading: subLoading } = useSubscription();
  const { sections, isVisible, getSection, refresh: refreshLayout, footerText } = useHomeLayout();
  const isRefreshing = useIsRefreshing();
  const triggerRefresh = useTriggerRefresh();
  const navigate = useNavigate();
  // Fallback para user_metadata (ex.: OAuth) enquanto o perfil ainda não carregou
  const nameFromProfile = profile?.full_name?.trim().split(/\s+/)[0];
  const nameFromAuth = (user?.user_metadata?.full_name || user?.user_metadata?.name) as string | undefined;
  const userName = nameFromProfile || nameFromAuth?.trim().split(/\s+/)[0] || "Usuário";
  const [hasUpcomingAppointment, setHasUpcomingAppointment] = useState(false);
  const [appointmentBannerDismissed, setAppointmentBannerDismissed] = useState(() =>
    localStorage.getItem("chamo_appointment_banner_dismissed") === "1"
  );
  
  // ✅ ATIVAÇÃO DO PUSH: Registra o token assim que o perfil carregar
  usePush(profile?.user_id || profile?.id); 

  const [jobCount, setJobCount] = useState(0);
  const [showCoupon, setShowCoupon] = useState(false);
  const [isReady, setIsReady] = useState(false); // ✅ Controle de renderização global
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationCep, setLocationCep] = useState("");
  const [locationCepLoading, setLocationCepLoading] = useState(false);
  const [locationCity, setLocationCity] = useState("");
  const [locationState, setLocationState] = useState("");
  const [locationSaving, setLocationSaving] = useState(false);

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

  useEffect(() => {
    if (!user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from("agenda_appointments")
      .select("id", { count: "exact", head: true })
      .eq("client_id", user.id)
      .in("status", ["pending", "confirmed"])
      .gte("appointment_date", today)
      .then(({ count }) => {
        const has = (count ?? 0) > 0;
        setHasUpcomingAppointment(has);
        if (!has) {
          localStorage.removeItem("chamo_appointment_banner_dismissed");
          setAppointmentBannerDismissed(false);
        }
      });
  }, [user?.id]);

  // ✅ 2. TRANSIÇÃO SUAVE: Espera o layout carregar para liberar a tela (com ou sem login)
  useEffect(() => {
    // Timeout de segurança (fallback caso a internet caia)
    const fallback = setTimeout(() => setIsReady(true), 1200); 
    
    if (sections && sections.length > 0) {
      setIsReady(true);
      clearTimeout(fallback);
    }
    return () => clearTimeout(fallback);
  }, [sections]);

  // ✅ Pós-OAuth: quando o user fica disponível, forçar novo carregamento do layout e dos blocos (sponsors, categorias, featured)
  const [contentSeed, setContentSeed] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => {
      refreshLayout();
      setContentSeed((s) => s + 1);
    }, 400);
    return () => clearTimeout(t);
  }, [user?.id]);

  // ✅ Ao entrar na Home (ex.: após login): refresh como se tivesse voltado da Busca / reaberto o app — garante que a página carregue
  useEffect(() => {
    const t = setTimeout(() => {
      refreshLayout();
      setContentSeed((s) => s + 1);
      supabase.from("job_postings").select("id", { count: "exact", head: true }).eq("active", true).then(({ count }) => setJobCount(count ?? 0));
      if (user?.id) {
        const today = new Date().toISOString().slice(0, 10);
        supabase.from("agenda_appointments").select("id", { count: "exact", head: true }).eq("client_id", user.id).in("status", ["pending", "confirmed"]).gte("appointment_date", today).then(({ count }) => setHasUpcomingAppointment((count ?? 0) > 0));
      }
    }, 350);
    return () => clearTimeout(t);
  }, []);

  // ✅ Pull-to-refresh (e ao fechar tutorial): atualiza layout + força remount das seções (sponsors, featured, categorias) para carregar 100%
  const onRefresh = async () => {
    setContentSeed((s) => s + 1);
    const minDelay = new Promise(r => setTimeout(r, 400));
    await Promise.all([
      refreshLayout(),
      supabase.from("job_postings").select("id", { count: "exact", head: true }).eq("active", true).then(({ count }) => setJobCount(count ?? 0)),
      user?.id ? supabase.from("agenda_appointments").select("id", { count: "exact", head: true }).eq("client_id", user.id).in("status", ["pending", "confirmed"]).gte("appointment_date", new Date().toISOString().slice(0, 10)).then(({ count }) => setHasUpcomingAppointment((count ?? 0) > 0)) : Promise.resolve(),
    ]);
    await minDelay;
  };
  useRefresh(onRefresh);

  const locationLabel = profile?.address_city && profile?.address_state
    ? `${profile.address_city}, ${profile.address_state}`
    : profile?.address_city || profile?.address_state || "Definir localização";

  const welcomeWord = profile?.gender === "female" ? "Bem-vinda" : profile?.gender === "male" ? "Bem-vindo" : "Bem-vindo(a)";

  // Novo cliente (Google/Apple sem cadastro): abre o modal de localização para definir cidade/CEP
  useEffect(() => {
    try {
      if (sessionStorage.getItem("chamo_open_location_modal") !== "1") return;
      sessionStorage.removeItem("chamo_open_location_modal");
      const hasLocation = !!(profile?.address_city && profile?.address_state);
      if (!hasLocation && user?.id) {
        const t = setTimeout(() => setLocationOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, [user?.id, profile?.address_city, profile?.address_state]);

  const handleOpenLocation = () => {
    const zip = (profile?.address_zip || "").replace(/\D/g, "");
    setLocationCep(zip.length === 8 ? `${zip.slice(0, 5)}-${zip.slice(5)}` : "");
    setLocationCity(profile?.address_city || "");
    setLocationState((profile?.address_state || "").toUpperCase().slice(0, 2));
    setLocationOpen(true);
  };

  const handleLocationCepChange = (value: string) => {
    const raw = value.replace(/\D/g, "").slice(0, 8);
    setLocationCep(raw.length === 8 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw);
    if (raw.length === 8) {
      setLocationCepLoading(true);
      setLocationCity("");
      setLocationState("");
      fetchViaCep(raw)
        .then((data) => {
          if (data?.localidade) setLocationCity(data.localidade);
          if (data?.uf) setLocationState(data.uf.toUpperCase());
          if (!data?.localidade && !data?.uf) {
            toast({ title: "CEP não encontrado", variant: "destructive" });
          }
        })
        .catch(() => toast({ title: "Não foi possível buscar o CEP. Tente novamente.", variant: "destructive" }))
        .finally(() => setLocationCepLoading(false));
    } else {
      setLocationCity("");
      setLocationState("");
    }
  };

  const handleSaveLocation = async () => {
    const city = locationCity.trim();
    const state = locationState.trim().toUpperCase().slice(0, 2);
    if (!city || !state) {
      toast({ title: "Digite um CEP válido para buscar cidade e estado.", variant: "destructive" });
      return;
    }
    if (!user?.id) return;
    setLocationSaving(true);
    const cepClean = locationCep.replace(/\D/g, "");
    const payload = {
      address_zip: cepClean.length === 8 ? cepClean : null,
      address_city: city || null,
      address_state: state || null,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("user_id", user.id);
    setLocationSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar localização", variant: "destructive" });
      return;
    }
    await refreshProfile();
    setLocationOpen(false);
    toast({ title: "Localização atualizada! Os profissionais dessa região serão exibidos." });
  };

  const sectionComponents: Record<string, React.ReactNode> = {
    welcome: <HomeWelcome key="welcome" userName={userName} section={getSection("welcome")} />,
    sponsors: <SponsorCarousel key={`sponsors-${contentSeed}`} section={getSection("sponsors")} />,
    jobs: <HomeJobsBanner key="jobs" jobCount={jobCount} section={getSection("jobs")} />,
    search: <HomeSearchBar key={`search-${profile?.address_city}-${profile?.address_state}`} section={getSection("search")} />,
    featured: <FeaturedProfessionals key={`featured-${profile?.address_city}-${profile?.address_state}-${contentSeed}`} section={getSection("featured")} />,
    categories: <CategoriesGrid key={`categories-${contentSeed}`} section={getSection("categories")} />,
    benefits: <BenefitsPanel key="benefits" section={getSection("benefits")} />,
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

  // Só monta o conteúdo (e os fetches) depois da sessão estar pronta — evita getSession() null pós-OAuth
  const contentReady = !authLoading && isReady;

  return (
    <AppLayout>
      {!contentReady ? (
        <HomeSkeleton />
      ) : (
        <main className="relative max-w-screen-lg mx-auto px-4 py-2 flex flex-col gap-4 bg-secondary animate-in fade-in duration-500">
          {/* Overlay de refresh: tela home desfocada + spinner (evita tela preta após tutorial) */}
          {isRefreshing && (
            <div
              className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-200"
              aria-busy="true"
              aria-label="Atualizando"
            >
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Atualizando...</span>
              </div>
            </div>
          )}
          {user && (
            <div className="flex flex-col gap-1.5">
              <p className="text-base font-semibold text-foreground">
                {welcomeWord}, <span className="text-primary">{userName}</span> 👋
              </p>
              <button
                type="button"
                onClick={handleOpenLocation}
                className="flex items-center gap-2 w-fit px-3 py-1.5 rounded-full text-xs font-medium bg-muted/80 hover:bg-muted border border-border/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate max-w-[180px]">{locationLabel}</span>
              </button>
            </div>
          )}

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

          {hasUpcomingAppointment && !appointmentBannerDismissed && (
            <div className="relative flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl p-3.5">
              <button
                type="button"
                onClick={() => {
                  setAppointmentBannerDismissed(true);
                  localStorage.setItem("chamo_appointment_banner_dismissed", "1");
                }}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
              <Link to="/meus-agendamentos" className="flex items-center gap-3 flex-1 min-w-0 pr-6" onClick={() => { setAppointmentBannerDismissed(true); localStorage.setItem("chamo_appointment_banner_dismissed", "1"); }}>
                <CalendarCheck className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Você tem agendamento</p>
                  <p className="text-xs text-muted-foreground">Confira data, horário e opções</p>
                </div>
                <span className="text-xs font-semibold text-primary flex-shrink-0">Ver →</span>
              </Link>
            </div>
          )}

          {sections.filter((s) => s.visible).map((section) => {
            const isJobsEmpty = section.id === "jobs" && jobCount <= 0;
            const isWelcomeCollapsed = section.id === "welcome";
            const minHeight = isWelcomeCollapsed || isJobsEmpty ? "" : (sectionMinHeights[section.id] || "");
            return (
              <div key={section.id} className={`w-full ${minHeight}`}>
                {sectionComponents[section.id]}
                {section.id === "sponsors" && <HomeBanners position="carousel" />}
                {bannerAfter[section.id] && <HomeBanners position={bannerAfter[section.id]} />}
              </div>
            );
          })}

          <HomeBanners position="bottom" />

          {/* Mostra para cliente ou quando perfil ainda não carregou (igual Android no iPhone) */}
          {profile?.user_type !== "professional" && profile?.user_type !== "company" && (
            <Link
              to="/signup-pro"
              className="flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-semibold text-sm transition-colors"
            >
              <Briefcase className="w-5 h-5" />
              Tornar-se profissional
            </Link>
          )}

          <footer className="text-center py-6 pt-6 pb-24 border-t mt-4">
            <p className="text-xs text-muted-foreground">
              {footerText}
            </p>
          </footer>
        </main>
      )}

      {/* Modal de localização: CEP → busca automática cidade/estado */}
      <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" /> Alterar localização
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Digite seu CEP para buscar sua cidade e estado. Os profissionais dessa região serão exibidos.
          </p>
          <div className="space-y-3">
            <div className="relative">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">CEP</label>
              <input
                type="text"
                inputMode="numeric"
                value={locationCep}
                onChange={(e) => handleLocationCepChange(e.target.value)}
                placeholder="00000-000"
                maxLength={9}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono"
              />
              {locationCepLoading && (
                <div className="absolute right-3 top-9 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            {locationCity && locationState && (
              <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{locationCity}</span>, {locationState}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLocationOpen(false)}
              className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveLocation}
              disabled={locationSaving || !locationCity || !locationState || locationCepLoading}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {locationSaving ? "Salvando…" : "Confirmar"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

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