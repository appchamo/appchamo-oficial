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
import { useRefresh, useIsRefreshing } from "@/contexts/RefreshContext";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Zap, Ticket, X, MapPin, Briefcase, Loader2, AlertTriangle, Landmark, ChevronRight, Crown, Sparkles, Building2, Star } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import HomeSearchBar from "@/components/home/HomeSearchBar";
import HomeJobsBanner from "@/components/home/HomeJobsBanner";
import HomeWelcome from "@/components/home/HomeWelcome";
import HomeAlertCarousel from "@/components/home/HomeAlertCarousel";
import QuickProfessionalsList from "@/components/home/QuickProfessionalsList";
import HomeProCarousel from "@/components/home/HomeProCarousel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"; 
import { usePush } from "@/hooks/usePush"; // ✅ IMPORTAÇÃO DO HOOK DE PUSH
import { toast } from "@/hooks/use-toast";
import { fetchViaCep } from "@/lib/viacep";
import { diagLog } from "@/lib/diag";
import { Capacitor } from "@capacitor/core";

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

/** No iOS: não monta Sponsors/Featured/Categories até a fila do Supabase esvaziar pós-OAuth (evita 9+ requests paralelos travados). */
function HomeHeavyPlaceholder({ kind, title }: { kind: "sponsors" | "featured" | "categories"; title: string }) {
  if (kind === "sponsors") {
    return (
      <section className="min-h-[160px]">
        <h3 className="font-semibold text-foreground mb-3 px-1">{title}</h3>
        <div className="flex gap-4 justify-start overflow-hidden pb-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-[72px] h-[72px] rounded-full bg-muted animate-pulse flex-shrink-0" />
          ))}
        </div>
        <p className="text-xs text-muted-foreground px-1 mt-1">Carregando…</p>
      </section>
    );
  }
  if (kind === "featured") {
    return (
      <section className="min-h-[250px]">
        <h3 className="font-semibold text-foreground mb-3 px-1">{title}</h3>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-[140px] rounded-2xl border bg-card p-3 space-y-2">
              <div className="w-14 h-14 rounded-full bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-20 rounded bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-16 rounded bg-muted animate-pulse mx-auto" />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground px-1 mt-2">Carregando profissionais…</p>
      </section>
    );
  }
  return (
    <section className="min-h-[200px]">
      <h3 className="font-semibold text-foreground mb-3 px-1">{title}</h3>
      <div className="grid grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <p className="text-xs text-muted-foreground px-1 mt-2">Carregando categorias…</p>
    </section>
  );
}

const Home = () => {
  const { profile, user, refreshProfile, loading: authLoading } = useAuth();
  const location = useLocation();
  const { isFreePlan, callsRemaining, loading: subLoading, plan } = useSubscription();
  const isBusiness = plan?.id === "business";
  const { sections, isVisible, getSection, refresh: refreshLayout, footerText } = useHomeLayout();
  const isRefreshing = useIsRefreshing();
  const navigate = useNavigate();
  // Fallback para user_metadata (ex.: OAuth) enquanto o perfil ainda não carregou
  const nameFromProfile = profile?.full_name?.trim().split(/\s+/)[0];
  const nameFromAuth = (user?.user_metadata?.full_name || user?.user_metadata?.name) as string | undefined;
  const userName = nameFromProfile || nameFromAuth?.trim().split(/\s+/)[0] || "Usuário";
  const isPro = profile?.user_type === "professional" || profile?.user_type === "company";
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [proId, setProId] = useState<string | null>(null);
  const [hasUpcomingAppointment, setHasUpcomingAppointment] = useState(false);
  const [appointmentBannerDismissed, setAppointmentBannerDismissed] = useState(() =>
    localStorage.getItem("chamo_appointment_banner_dismissed") === "1"
  );
  
  // ✅ ATIVAÇÃO DO PUSH: Registra o token assim que o perfil carregar
  usePush(profile?.user_id || profile?.id); 

  const [needsFiscalSetup, setNeedsFiscalSetup] = useState(false);
  const [earlyAccessModal, setEarlyAccessModal] = useState(false);

  const checkFiscalSetup = useCallback(async () => {
    if (!user?.id || profile?.user_type === "client") {
      setNeedsFiscalSetup(false);
      return;
    }
    try {
      const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
      if (!pro?.id) {
        setNeedsFiscalSetup(false);
        return;
      }
      const { data: fd, error } = await supabase
        .from("professional_fiscal_data")
        .select("fiscal_registration_completed_at")
        .eq("professional_id", pro.id)
        .maybeSingle();
      if (error) {
        setNeedsFiscalSetup(false);
        return;
      }
      setNeedsFiscalSetup(!fd?.fiscal_registration_completed_at);
    } catch {
      setNeedsFiscalSetup(false);
    }
  }, [user?.id, profile?.user_type]);

  useEffect(() => {
    const t = window.setTimeout(() => void checkFiscalSetup(), 200);
    return () => clearTimeout(t);
  }, [checkFiscalSetup]);

  // Modal de acesso antecipado Business (promoção de lançamento)
  useEffect(() => {
    if (!user?.id || !isPro) return;
    const storageKey = `early_access_modal_${user.id}`;
    if (localStorage.getItem(storageKey) !== "pending") return;
    // Verifica se o profissional tem early_access ativo
    supabase.from("professionals").select("early_access").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data?.early_access) {
        setEarlyAccessModal(true);
        localStorage.setItem(storageKey, "shown");
      } else {
        localStorage.removeItem(storageKey);
      }
    });
  }, [user?.id, isPro]);

  // Busca saldo da carteira para profissionais
  useEffect(() => {
    if (!user?.id || !isPro) return;
    const fetchWallet = async () => {
      const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
      if (!pro?.id) return;
      setProId(pro.id);
      const { data } = await supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("professional_id", pro.id)
        .eq("status", "pending");
      const total = (data || []).reduce((s, t) => s + Number(t.amount), 0);
      setWalletBalance(total);
      setWalletLoaded(true);
    };
    fetchWallet();
  }, [user?.id, isPro]);

  useEffect(() => {
    const h = () => void checkFiscalSetup();
    window.addEventListener("chamo-fiscal-complete", h);
    return () => window.removeEventListener("chamo-fiscal-complete", h);
  }, [checkFiscalSetup]);

  const [jobCount, setJobCount] = useState(0);
  const [showCoupon, setShowCoupon] = useState(false);
  const [isReady, setIsReady] = useState(false); // ✅ Controle de renderização global
  const [contentSeed, setContentSeed] = useState(0);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationCep, setLocationCep] = useState("");
  const [locationCepLoading, setLocationCepLoading] = useState(false);
  const [locationCity, setLocationCity] = useState("");
  const [locationState, setLocationState] = useState("");
  const [locationSaving, setLocationSaving] = useState(false);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);
  /** Nativo: só monta fetches pesados após janela (evita travar WebView com muitos .from() ao mesmo tempo). */
  const [heavySectionsReady, setHeavySectionsReady] = useState(() => !Capacitor.isNativePlatform());

  // Observação: no iOS pós-OAuth, supabase.auth.getSession() pode travar.
  // O hard reload 1x após SIGNED_IN (em useAuth) resolve de forma confiável.

  useEffect(() => {
    diagLog("info", "home", "render state", { authLoading, isReady, userId: user?.id ?? null });
  }, [authLoading, isReady, user?.id]);

  // iOS WebView: reload de estabilização pós-OAuth/login feito aqui (fase do skeleton),
  // antes de qualquer conteúdo ou modal aparecer para o usuário.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const graceUntil = parseInt(sessionStorage.getItem("chamo_hang_reload_grace_until") || "0", 10);
      const postOAuthWarmup = Date.now() < graceUntil;
      const oauthJustLanded = sessionStorage.getItem("chamo_oauth_just_landed") === "1";
      if (
        (postOAuthWarmup || oauthJustLanded) &&
        sessionStorage.getItem("chamo_featured_reload_after_oauth") !== "1"
      ) {
        sessionStorage.setItem("chamo_featured_reload_after_oauth", "1");
        diagLog("info", "home", "reload de estabilização pós-OAuth (skeleton phase)");
        window.location.reload();
      }
    } catch { /* ignore */ }
  }, []);

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

  const fetchUpcomingAppointments = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;
    const today = new Date().toISOString().slice(0, 10);
    const base = { status: ["pending", "confirmed"] as const, date: today };

    const asClient = supabase
      .from("agenda_appointments")
      .select("id", { count: "exact", head: true })
      .eq("client_id", user.id)
      .in("status", base.status)
      .gte("appointment_date", base.date);

    const { data: proRow } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
    const asPro = proRow?.id
      ? supabase
          .from("agenda_appointments")
          .select("id", { count: "exact", head: true })
          .eq("professional_id", proRow.id)
          .in("status", base.status)
          .gte("appointment_date", base.date)
      : null;

    const [clientRes, proRes] = await Promise.all([
      asClient,
      asPro ? asPro : Promise.resolve({ count: 0 }),
    ]);
    const clientCount = clientRes.count ?? 0;
    const proCount = (proRes as { count?: number })?.count ?? 0;
    const has = clientCount > 0 || proCount > 0;
    setHasUpcomingAppointment(has);
    if (!has) {
      localStorage.removeItem("chamo_appointment_banner_dismissed");
      setAppointmentBannerDismissed(false);
    }
    return has;
  }, [user?.id]);

  useEffect(() => {
    fetchUpcomingAppointments();
  }, [fetchUpcomingAppointments]);

  // Ao voltar para a Home (ex.: após cancelar um agendamento), revalida e mostra o alerta de novo se ainda houver agendamentos
  useEffect(() => {
    if (location.pathname !== "/home" || !user?.id) return;
    fetchUpcomingAppointments().then((has) => {
      if (has) setAppointmentBannerDismissed(false);
    });
  }, [location.pathname, user?.id, fetchUpcomingAppointments]);

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

  // Nativo: abre janela antes de montar Sponsors/Featured/Categories.
  // Delay reduzido para 600ms (era 1600ms) — WebView já está estabilizado nesse ponto.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setHeavySectionsReady(true);
      return;
    }
    setHeavySectionsReady(false);
    const ms = user?.id ? 600 : 300;
    const t = setTimeout(() => setHeavySectionsReady(true), ms);
    return () => clearTimeout(t);
  }, [user?.id]);

  // ✅ Pós-OAuth: no web remonta seções; no nativo NÃO dar contentSeed cedo (disparava 3× montagem + trava).
  useEffect(() => {
    const t = setTimeout(() => {
      refreshLayout();
      if (!Capacitor.isNativePlatform()) {
        setContentSeed((s) => s + 1);
      }
      supabase.from("job_postings").select("id", { count: "exact", head: true }).eq("active", true).then(({ count }) => setJobCount(count ?? 0));
      if (user?.id) fetchUpcomingAppointments();
    }, 450);
    return () => clearTimeout(t);
  }, [user?.id]);

  // Fechou o tutorial: libera seções pesadas + um remount limpo no nativo
  useEffect(() => {
    const onDismiss = () => {
      if (!window.location.pathname.includes("home")) return;
      if (Capacitor.isNativePlatform()) {
        setHeavySectionsReady(true);
      }
      setTimeout(() => setContentSeed((s) => s + 1), 600);
    };
    window.addEventListener("chamo-tutorial-dismissed", onDismiss);
    return () => window.removeEventListener("chamo-tutorial-dismissed", onDismiss);
  }, []);

  // ✅ Pull-to-refresh (e ao fechar tutorial): atualiza layout + força remount das seções (sponsors, featured, categorias) para carregar 100%
  const onRefresh = async () => {
    if (Capacitor.isNativePlatform()) setHeavySectionsReady(true);
    setContentSeed((s) => s + 1);
    const minDelay = new Promise(r => setTimeout(r, 400));
    await Promise.all([
      refreshLayout(),
      supabase.from("job_postings").select("id", { count: "exact", head: true }).eq("active", true).then(({ count }) => setJobCount(count ?? 0)),
      user?.id ? fetchUpcomingAppointments() : Promise.resolve(),
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

  // Checa se o cadastro está incompleto
  // Considera nome do OAuth (user_metadata) como válido para não gerar falso-positivo
  useEffect(() => {
    if (!profile || !user) return;
    const dbName   = (profile.full_name || "").trim();
    const metaName = ((user.user_metadata?.full_name || user.user_metadata?.name) as string | undefined)?.trim() || "";
    const effectiveName = dbName || metaName;

    const missingName  = !effectiveName;
    const missingPhone = !(profile.phone || "").trim();
    const missingDoc   = profile.user_type === "company" && !(profile.cpf || "").trim() && !(profile.cnpj || "").trim();
    const needs = missingName || missingPhone || missingDoc;
    setNeedsProfileCompletion(needs);
    try {
      localStorage.setItem("chamo_profile_needs_completion", needs ? "1" : "0");
    } catch {
      // ignore
    }

    // Se tem nome no OAuth mas não no DB, sincroniza silenciosamente
    if (!dbName && metaName) {
      supabase.from("profiles").update({ full_name: metaName }).eq("user_id", user.id).then(() => {
        refreshProfile?.();
      });
    }
  }, [profile?.full_name, profile?.phone, profile?.cpf, profile?.cnpj, profile?.user_type, user?.id]);

  const sectionComponents: Record<string, React.ReactNode> = {
    welcome: <HomeWelcome key="welcome" userName={userName} section={getSection("welcome")} />,
    sponsors: <SponsorCarousel key={`sponsors-${contentSeed}`} section={getSection("sponsors")} />,
    jobs: null,
    search: <HomeSearchBar key={`search-${profile?.address_city}-${profile?.address_state}`} section={getSection("search")} />,
    featured: <FeaturedProfessionals key={`featured-${contentSeed}`} section={getSection("featured")} />,
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
        <main
          className="max-w-screen-lg mx-auto px-4 py-2 flex flex-col gap-4 bg-secondary animate-in fade-in duration-500 transition-opacity duration-300"
          style={{ opacity: isRefreshing ? 0.7 : 1 }}
        >
          {user && isPro && proId ? (
            /* ── Carrossel: Carteira + Agenda (só monta quando proId está pronto) ── */
            <HomeProCarousel
              profile={profile}
              userName={userName}
              welcomeWord={welcomeWord}
              locationLabel={locationLabel}
              onLocationClick={handleOpenLocation}
              walletBalance={walletBalance}
              walletLoaded={walletLoaded}
              professionalId={proId}
            />
          ) : user && isPro ? (
            /* ── Placeholder enquanto proId carrega ── */
            <div
              className="relative overflow-hidden rounded-2xl shadow-lg"
              style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 60%, #c2410c 100%)" }}
            >
              <div className="absolute -top-8 -right-8 w-36 h-36 bg-white/10 rounded-full" />
              <div className="absolute -bottom-6 -left-6 w-28 h-28 bg-white/5 rounded-full" />
              <div className="relative p-5">
                <div className="flex items-center gap-3 mb-4">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={userName} className="w-12 h-12 rounded-full object-cover border-2 border-white/40 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center shrink-0">
                      <span className="text-white font-bold text-xl">{userName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div>
                    <p className="text-white/75 text-xs">{welcomeWord} de volta,</p>
                    <p className="text-white font-bold text-lg">{userName} 👋</p>
                  </div>
                </div>
                <div className="bg-white/15 rounded-xl p-3.5 h-14 animate-pulse" />
              </div>
            </div>
          ) : user ? (
            /* ── Welcome cliente ── */
            <div className="flex items-center gap-3">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={userName} className="w-11 h-11 rounded-full object-cover border border-border shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold text-base">{userName.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-foreground leading-tight">
                  {welcomeWord}, <span className="text-primary">{userName}</span> 👋
                </p>
                <button
                  type="button"
                  onClick={handleOpenLocation}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 hover:text-foreground transition-colors"
                >
                  <MapPin className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">{locationLabel}</span>
                </button>
              </div>
            </div>
          ) : null}

          {user && needsProfileCompletion && (
            <Link
              to="/profile"
              className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl p-3.5"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">Complete seu cadastro</p>
                <p className="text-xs text-amber-800">
                  Preencha seu nome, telefone e, se for empresa, CPF ou CNPJ na tela de perfil.
                </p>
              </div>
            </Link>
          )}

          {user && needsFiscalSetup && (
            <Link
              to="/pro/financeiro"
              className="flex items-start gap-3 bg-primary/10 border-2 border-primary rounded-xl p-3.5 hover:bg-primary/15 transition-colors active:scale-[0.99]"
            >
              <Landmark className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-primary">Cadastro fiscal pendente</p>
                <p className="text-xs text-foreground/90 mt-0.5">
                  Abra o menu lateral → <strong>Financeiro</strong> → aba <strong>Cadastro fiscal</strong>, preencha todos os
                  campos e toque em <strong>Salvar dados fiscais</strong>.
                </p>
                <p className="text-[11px] font-semibold text-primary mt-2">Ir para Financeiro →</p>
              </div>
            </Link>
          )}

          {!subLoading && isFreePlan && profile?.user_type !== "client" && callsRemaining <= 1 &&
          <Link to="/subscriptions" className="flex items-center gap-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-3.5 hover:border-amber-400 transition-all shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Zap className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900">
                  {callsRemaining <= 0 ? "Limite atingido!" : "Última chamada gratuita!"}
                </p>
                <p className="text-xs text-amber-700">Faça upgrade para chamadas ilimitadas</p>
              </div>
              <span className="text-xs font-bold text-primary flex items-center gap-0.5">Upgrade <ChevronRight className="w-3.5 h-3.5" /></span>
            </Link>
          }


          {sections.filter((s) => s.visible).map((section) => {
            const isJobsEmpty = section.id === "jobs" && jobCount <= 0;
            const isWelcomeCollapsed = section.id === "welcome";
            const heavyDefer =
              Capacitor.isNativePlatform() &&
              !heavySectionsReady &&
              (section.id === "sponsors" || section.id === "featured" || section.id === "categories");
            const sec = getSection(section.id);
            const block =
              heavyDefer && section.id === "sponsors" ? (
                <HomeHeavyPlaceholder kind="sponsors" title={sec?.title ?? "Patrocinadores"} />
              ) : heavyDefer && section.id === "featured" ? (
                <HomeHeavyPlaceholder kind="featured" title={sec?.title ?? "Profissionais em destaque"} />
              ) : heavyDefer && section.id === "categories" ? (
                <HomeHeavyPlaceholder kind="categories" title={sec?.title ?? "Categorias"} />
              ) : (
                sectionComponents[section.id]
              );
            // blockIsNull declarado APÓS block para evitar TDZ (Temporal Dead Zone)
            const blockIsNull = block === null || block === undefined;
            const minHeight = isWelcomeCollapsed || isJobsEmpty || blockIsNull ? "" : (sectionMinHeights[section.id] || "");
            return (
              <div key={section.id} className={`w-full ${minHeight}`}>
                {/* Carrossel de alertas aparece ACIMA dos tutoriais */}
                {section.id === "tutorials" && (
                  <div className="mb-3">
                    <HomeAlertCarousel
                      hasAppointment={hasUpcomingAppointment}
                      appointmentDismissed={appointmentBannerDismissed}
                      onDismissAppointment={() => {
                        setAppointmentBannerDismissed(true);
                        localStorage.setItem("chamo_appointment_banner_dismissed", "1");
                      }}
                      appointmentLink={
                        profile?.user_type === "professional" || profile?.user_type === "company"
                          ? "/pro/agenda/calendario"
                          : "/meus-agendamentos"
                      }
                      jobCount={jobCount}
                    />
                  </div>
                )}
                {block}
                {section.id === "sponsors" && <HomeBanners position="carousel" />}
                {bannerAfter[section.id] && <HomeBanners position={bannerAfter[section.id]} />}
                {section.id === "categories" && (
                  <div className="mt-3">
                    <QuickProfessionalsList />
                  </div>
                )}
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

          <footer className="text-center py-6 pt-6 pb-24 border-t mt-4 space-y-3">
            <p className="text-xs text-muted-foreground px-2">
              {footerText}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              <Link to="/terms-of-use" className="text-primary font-semibold hover:underline underline-offset-2">
                Termos de uso
              </Link>
              <Link to="/privacy" className="text-primary font-semibold hover:underline underline-offset-2">
                Política de privacidade
              </Link>
            </div>
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

      {/* ✨ Modal de Acesso Antecipado Business */}
      <Dialog open={earlyAccessModal} onOpenChange={setEarlyAccessModal}>
        <DialogContent className="max-w-sm p-0 overflow-hidden border-0 rounded-3xl shadow-2xl">
          {/* Fundo gradiente premium */}
          <div className="relative bg-gradient-to-br from-violet-600 via-purple-700 to-orange-500 px-6 pt-8 pb-6 text-white text-center overflow-hidden">
            {/* Brilhos decorativos */}
            <div className="absolute top-4 left-6 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute bottom-4 right-6 w-24 h-24 bg-orange-400/20 rounded-full blur-2xl" />
            <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-300/10 rounded-full blur-xl" />

            {/* Ícone de coroa */}
            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/15 border-2 border-white/30 mb-4 mx-auto">
              <Crown className="w-10 h-10 text-yellow-300 drop-shadow-lg" />
              <span className="absolute -top-1 -right-1 text-lg">✨</span>
            </div>

            <h2 className="text-2xl font-black mb-1 tracking-tight drop-shadow">Parabéns! 🎉</h2>
            <p className="text-white/90 font-semibold text-base">Você ganhou acesso antecipado ao</p>
            <div className="inline-flex items-center gap-2 mt-2 mb-4 px-4 py-1.5 rounded-full bg-white/20 border border-white/30">
              <Building2 className="w-4 h-4 text-yellow-300" />
              <span className="font-black text-lg tracking-wide text-yellow-300">Chamô Business</span>
            </div>

            {/* Benefícios */}
            <div className="space-y-2 text-left bg-white/10 rounded-2xl p-4 mb-4">
              {[
                "Chamadas ilimitadas de clientes",
                "Aparece em destaque na Home",
                "Fotos de serviços no perfil",
                "Suporte 24h prioritário",
                "Publicar vagas de emprego",
                "Catálogo de produtos",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm">
                  <Star className="w-3.5 h-3.5 text-yellow-300 shrink-0 fill-yellow-300" />
                  <span className="text-white/95">{item}</span>
                </div>
              ))}
            </div>

            <div className="bg-white/15 border border-white/25 rounded-2xl p-3 mb-5">
              <p className="text-xs text-white/80 leading-relaxed">
                🎁 <strong className="text-white">1 mês grátis</strong> — você tem até{" "}
                <strong className="text-yellow-300">14/04/2026</strong> de acesso total ao Business sem pagar nada.
                Depois disso, basta manter seu plano para continuar crescendo! 🚀
              </p>
            </div>
          </div>

          {/* Botão fora do gradiente */}
          <div className="px-6 py-5 bg-card">
            <button
              onClick={() => setEarlyAccessModal(false)}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-orange-500 text-white font-black text-base tracking-wide shadow-lg hover:opacity-90 active:scale-95 transition-all"
            >
              Começar agora! 🚀
            </button>
            <p className="text-center text-[10px] text-muted-foreground mt-2">
              Acesso válido até 14/04/2026 · Sem cartão de crédito necessário
            </p>
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