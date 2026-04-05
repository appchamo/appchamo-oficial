import AppLayout from "@/components/AppLayout";
import BenefitsPanel, { CHAMO_HOME_SILENT_TICKER } from "@/components/BenefitsPanel";
import SponsorCarousel from "@/components/SponsorCarousel";
import FeaturedProfessionals from "@/components/FeaturedProfessionals";
import CategoriesGrid from "@/components/CategoriesGrid";
import TutorialsSection from "@/components/TutorialsSection";
import HomeBanners from "@/components/HomeBanners";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useHomeLayout } from "@/hooks/useHomeLayout";
import { useRefreshAtKey, useIsRefreshing } from "@/contexts/RefreshContext";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Zap, Ticket, X, MapPin, Briefcase, Loader2, AlertTriangle, Landmark, ChevronRight, Crown, Sparkles, Building2, Star, Megaphone } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import HomeSearchBar from "@/components/home/HomeSearchBar";
import HomeOpenRequestCta from "@/components/home/HomeOpenRequestCta";
import HomeJobsBanner from "@/components/home/HomeJobsBanner";
import HomeWelcome from "@/components/home/HomeWelcome";
import HomeAlertCarousel from "@/components/home/HomeAlertCarousel";
import QuickProfessionalsList from "@/components/home/QuickProfessionalsList";
import HomeProCarousel from "@/components/home/HomeProCarousel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"; 
import { usePush } from "@/hooks/usePush"; // ✅ IMPORTAÇÃO DO HOOK DE PUSH
import { toast } from "@/hooks/use-toast";
import { fetchViaCep } from "@/lib/viacep";
import { forwardGeocodeBrazil } from "@/lib/geocode";
import { setHomeLocationCache } from "@/lib/locationUtils";
import { diagLog } from "@/lib/diag";
import { countActiveJobPostings } from "@/lib/jobRegionFilter";
import { Capacitor } from "@capacitor/core";
import { isOverlayStackRoute } from "@/lib/mainAppTabs";
import CommunityFeed from "@/components/community/CommunityFeed";
import HomeLaunchBanner from "@/components/home/HomeLaunchBanner";
import { useLinkedSponsor } from "@/hooks/useLinkedSponsor";
import SponsorPatrocinadorPanel from "@/components/sponsor/SponsorPatrocinadorPanel";
import SponsorLaunchNovidadeModal from "@/components/sponsor/SponsorLaunchNovidadeModal";

const CHAMO_HOME_CLIENT_SIGNUP_PRO_TOP_DISMISSED = "chamo_home_client_signup_pro_top_dismissed";

// ✅ 1. SKELETON LOADING: Mostrado enquanto a tela está processando (Evita o clarão)
const HomeSkeleton = () => (
  <div className="w-full max-w-screen-lg lg:max-w-[1480px] xl:max-w-[1600px] mx-auto px-4 lg:px-8 xl:px-12 py-5 lg:py-8 flex flex-col gap-6 lg:gap-8 w-full animate-in fade-in duration-500">
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
      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 lg:gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square bg-muted rounded-xl lg:rounded-2xl animate-pulse"></div>
        ))}
      </div>
    </div>
  </div>
);

/** No iOS: não monta Sponsors/Featured/Categories até a fila do Supabase esvaziar pós-OAuth (evita 9+ requests paralelos travados). */
function HomeHeavyPlaceholder({ kind, title }: { kind: "sponsors" | "featured" | "categories"; title: string }) {
  if (kind === "sponsors") {
    return (
      <section className="min-h-[160px] lg:min-h-[180px]">
        <h3 className="font-semibold lg:text-lg text-foreground mb-3 lg:mb-4 px-1">{title}</h3>
        <div className="flex gap-4 lg:gap-6 justify-start overflow-hidden pb-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-[72px] h-[72px] lg:w-[84px] lg:h-[84px] rounded-full bg-muted animate-pulse flex-shrink-0"
            />
          ))}
        </div>
        <p className="text-xs lg:text-sm text-muted-foreground px-1 mt-1 lg:mt-2">Carregando…</p>
      </section>
    );
  }
  if (kind === "featured") {
    return (
      <section className="min-h-[250px] lg:min-h-[280px]">
        <h3 className="font-semibold lg:text-lg text-foreground mb-3 lg:mb-4 px-1">{title}</h3>
        <div className="flex gap-3 lg:gap-5 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[140px] lg:w-[168px] rounded-2xl lg:rounded-3xl border bg-card p-3 lg:p-4 space-y-2"
            >
              <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-20 lg:w-24 rounded bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-16 lg:w-20 rounded bg-muted animate-pulse mx-auto" />
            </div>
          ))}
        </div>
        <p className="text-xs lg:text-sm text-muted-foreground px-1 mt-2 lg:mt-3">Carregando profissionais…</p>
      </section>
    );
  }
  return (
    <section className="min-h-[200px] lg:min-h-[240px]">
      <h3 className="font-semibold lg:text-lg text-foreground mb-3 lg:mb-4 px-1">{title}</h3>
      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 lg:gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square rounded-xl lg:rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
      <p className="text-xs lg:text-sm text-muted-foreground px-1 mt-2 lg:mt-3">Carregando categorias…</p>
    </section>
  );
}

const Home = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const homeFeedComunidade = searchParams.get("feed") === "comunidade";
  const { profile, user, refreshProfile, loading: authLoading } = useAuth();
  const { sponsor: linkedSponsor } = useLinkedSponsor(user?.id);

  useEffect(() => {
    if (!user && homeFeedComunidade) {
      setSearchParams({}, { replace: true });
    }
  }, [user, homeFeedComunidade, setSearchParams]);

  /** Links antigos `?feed=comunidade&post=` → página dedicada do post (notificações novas já vêm com `/p/comunidade/:id`). */
  useEffect(() => {
    if (!user?.id) return;
    const post = searchParams.get("post")?.trim();
    if (searchParams.get("feed") !== "comunidade" || !post) return;
    navigate(`/p/comunidade/${encodeURIComponent(post)}`, { replace: true });
  }, [user?.id, searchParams, navigate]);

  useEffect(() => {
    if (!user?.id || !linkedSponsor) return;
    let cancelled = false;
    void (async () => {
      const name = linkedSponsor.name?.trim();
      const avatar = linkedSponsor.logo_url?.trim() || null;
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, display_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || !p || !name) return;
      const dn = (p.display_name || "").trim();
      if (p.full_name === name && dn === name && p.avatar_url === avatar) return;
      await supabase
        .from("profiles")
        .update({
          full_name: name,
          display_name: name,
          avatar_url: avatar,
        })
        .eq("user_id", user.id);
      await refreshProfile();
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, linkedSponsor?.id, linkedSponsor?.name, linkedSponsor?.logo_url, refreshProfile]);
  const { isFreePlan, callsRemaining, loading: subLoading, plan } = useSubscription();
  const isBusiness = plan?.id === "business";
  const { sections, isVisible, getSection, refresh: refreshLayout, footerText } = useHomeLayout();
  const isRefreshing = useIsRefreshing();
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
  const [sponsorNovidadeOpen, setSponsorNovidadeOpen] = useState(false);
  const [sponsorReportsKey, setSponsorReportsKey] = useState(0);
  const [clientSignupProTopDismissed, setClientSignupProTopDismissed] = useState(() => {
    try {
      return localStorage.getItem(CHAMO_HOME_CLIENT_SIGNUP_PRO_TOP_DISMISSED) === "1";
    } catch {
      return false;
    }
  });
  const dismissClientSignupProTop = useCallback(() => {
    try {
      localStorage.setItem(CHAMO_HOME_CLIENT_SIGNUP_PRO_TOP_DISMISSED, "1");
    } catch {
      /* ignore */
    }
    setClientSignupProTopDismissed(true);
  }, []);

  // ✅ ATIVAÇÃO DO PUSH: Registra o token assim que o perfil carregar
  usePush(profile?.user_id || profile?.id); 

  const [needsFiscalSetup, setNeedsFiscalSetup] = useState(false);
  const [earlyAccessModal, setEarlyAccessModal] = useState(false);
  const [earlyAccessDocType, setEarlyAccessDocType] = useState<"cpf" | "cnpj">("cpf");

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

  // Modal de acesso antecipado (VIP ou Business conforme doc_type)
  // Abre DEPOIS do tutorial ser dispensado (ou imediatamente se tutorial não aparecer)
  const openEarlyAccessIfPending = (uid: string) => {
    const storageKey = `early_access_modal_${uid}`;
    if (localStorage.getItem(storageKey) !== "pending") return;
    supabase.from("professionals").select("early_access, doc_type").eq("user_id", uid).maybeSingle().then(({ data }) => {
      if (data?.early_access) {
        setEarlyAccessDocType((data as any).doc_type === "cnpj" ? "cnpj" : "cpf");
        setEarlyAccessModal(true);
        localStorage.setItem(storageKey, "shown");
      } else {
        localStorage.removeItem(storageKey);
      }
    });
  };

  useEffect(() => {
    if (!user?.id || !isPro) return;
    // Aguarda 1s para tutorial ter chance de aparecer primeiro
    const t = window.setTimeout(() => openEarlyAccessIfPending(user.id), 1000);
    return () => clearTimeout(t);
  }, [user?.id, isPro]);

  // Profissional: id + carteira num único efeito (liberta o header da Home assim que o id existe).
  useEffect(() => {
    if (!user?.id || !isPro) {
      setProId(null);
      setWalletBalance(0);
      setWalletLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
      if (cancelled || !pro?.id) return;
      setProId(pro.id);
      const { data } = await supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("professional_id", pro.id)
        .eq("status", "pending");
      if (cancelled) return;
      const total = (data || []).reduce((s, t) => s + Number(t.amount), 0);
      setWalletBalance(total);
      setWalletLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isPro]);

  useEffect(() => {
    const h = () => void checkFiscalSetup();
    window.addEventListener("chamo-fiscal-complete", h);
    return () => window.removeEventListener("chamo-fiscal-complete", h);
  }, [checkFiscalSetup]);

  const [jobCount, setJobCount] = useState(0);

  /** Contador de vagas ativas no app inteiro (sem filtro por localização do perfil). */
  const refreshJobCount = useCallback(async () => {
    const n = await countActiveJobPostings(supabase);
    setJobCount(n);
  }, []);

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
    void refreshJobCount();

    const justSignedUp = localStorage.getItem("just_signed_up");
    if (justSignedUp === "true") {
      const timer = setTimeout(() => {
        setShowCoupon(true);
        localStorage.removeItem("just_signed_up"); 
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [refreshJobCount]);

  useEffect(() => {
    if (location.pathname !== "/home") return;
    void refreshJobCount();
  }, [location.pathname, refreshJobCount]);

  useEffect(() => {
    const onJobsChanged = () => void refreshJobCount();
    window.addEventListener("chamo-job-postings-changed", onJobsChanged);
    return () => window.removeEventListener("chamo-job-postings-changed", onJobsChanged);
  }, [refreshJobCount]);

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

    const proRowPromise = supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();

    const [clientRes, proRowRes] = await Promise.all([asClient, proRowPromise]);
    const proRow = proRowRes.data;
    const asPro = proRow?.id
      ? supabase
          .from("agenda_appointments")
          .select("id", { count: "exact", head: true })
          .eq("professional_id", proRow.id)
          .in("status", base.status)
          .gte("appointment_date", base.date)
      : null;

    const proRes = asPro ? await asPro : { count: 0 };
    const clientCount = clientRes.count ?? 0;
    const proCount = (proRes as { count?: number }).count ?? 0;
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

  /** Saldo (pro), vagas e painel de benefícios/sorteio — sem remontar a página (evita “piscada” ao voltar do perfil). */
  const silentRefreshHomeTicker = useCallback(async () => {
    try {
      window.dispatchEvent(new Event(CHAMO_HOME_SILENT_TICKER));
    } catch {
      /* ignore */
    }

    const jobPromise = refreshJobCount();

    const walletPromise = (async () => {
      if (!user?.id || !isPro) return;
      const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
      if (!pro?.id) return;
      const { data } = await supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("professional_id", pro.id)
        .eq("status", "pending");
      const total = (data || []).reduce((s, t) => s + Number((t as { amount: number }).amount), 0);
      setWalletBalance(total);
      setWalletLoaded(true);
    })();

    await Promise.all([jobPromise, walletPromise]);
  }, [user?.id, isPro, refreshJobCount]);

  const homeNavPathRef = useRef<string | null>(null);
  useEffect(() => {
    const cur = location.pathname;
    const prev = homeNavPathRef.current;
    homeNavPathRef.current = cur;
    if (cur !== "/home") return;
    if (prev != null && prev !== "/home" && isOverlayStackRoute(prev)) {
      void silentRefreshHomeTicker();
    }
  }, [location.pathname, silentRefreshHomeTicker]);

  // Voltar para a Home não refaz fetch aqui — só pull-to-refresh (useRefreshAtKey("/home")) ou montagem inicial.
  // A Home fica montada em cache (HomePersistentLayer); pathname global muda mesmo com display:none.

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

  // Nativo: liberta patrocinadores/destaque no próximo frame (perfil já estabilizou em useAuth).
  // O efeito abaixo ainda força “ready” quando user_id do perfil bate com a sessão.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setHeavySectionsReady(true);
      return;
    }
    setHeavySectionsReady(false);
    const id = requestAnimationFrame(() => setHeavySectionsReady(true));
    return () => cancelAnimationFrame(id);
  }, [user?.id]);

  // Se rAF não correr (edge), não ficar no skeleton indefinidamente.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const failsafe = window.setTimeout(() => setHeavySectionsReady(true), 2200);
    return () => clearTimeout(failsafe);
  }, []);

  // Assim que o perfil bate com a sessão (pós-troca Google ↔ Apple), liberta sponsors/featured/categorias.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (user?.id && profile?.user_id === user.id) {
      setHeavySectionsReady(true);
    }
  }, [user?.id, profile?.user_id]);

  // Pós-login: atualiza layout e contagens sem esperar 450ms (percepção mais rápida na 1ª entrada).
  useEffect(() => {
    const run = () => {
      refreshLayout();
      if (!Capacitor.isNativePlatform()) {
        setContentSeed((s) => s + 1);
      }
      void refreshJobCount();
      if (user?.id) void fetchUpcomingAppointments();
    };
    const t = window.setTimeout(run, 0);
    return () => clearTimeout(t);
  }, [user?.id, refreshLayout, fetchUpcomingAppointments, refreshJobCount]);

  // Fechou o tutorial: libera seções pesadas + abre modal de early access se pendente
  useEffect(() => {
    const onDismiss = () => {
      if (!window.location.pathname.includes("home")) return;
      if (Capacitor.isNativePlatform()) {
        setHeavySectionsReady(true);
      }
      setTimeout(() => setContentSeed((s) => s + 1), 600);
      // Abre modal de early access após fechar tutorial (com pequeno delay visual)
      if (user?.id) setTimeout(() => openEarlyAccessIfPending(user.id), 800);
    };
    window.addEventListener("chamo-tutorial-dismissed", onDismiss);
    return () => window.removeEventListener("chamo-tutorial-dismissed", onDismiss);
  }, [user?.id]);

  // ✅ Pull-to-refresh (e ao fechar tutorial): atualiza layout + força remount das seções (sponsors, featured, categorias) para carregar 100%
  const onRefresh = async () => {
    if (Capacitor.isNativePlatform()) setHeavySectionsReady(true);
    setContentSeed((s) => s + 1);
    const minDelay = new Promise((r) => setTimeout(r, 400));
    await Promise.all([
      silentRefreshHomeTicker(),
      refreshLayout(),
      user?.id ? fetchUpcomingAppointments() : Promise.resolve(),
    ]);
    await minDelay;
  };
  useRefreshAtKey("/home", onRefresh);

  const locationLabel = profile?.address_city && profile?.address_state
    ? `${profile.address_city}, ${profile.address_state}`
    : profile?.address_city || profile?.address_state || "Definir localização";

  const needsLocationSetup = !profile?.address_city || !profile?.address_state;

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
    } catch {
      void 0;
    }
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
    const payload: Record<string, string | number | null> = {
      address_zip: cepClean.length === 8 ? cepClean : null,
      address_city: city || null,
      address_state: state || null,
    };
    try {
      const geo = await forwardGeocodeBrazil({
        cep: cepClean.length === 8 ? cepClean : null,
        city,
        state,
      });
      if (geo) {
        payload.latitude = geo.lat;
        payload.longitude = geo.lng;
      }
    } catch {
      void 0;
    }
    const { error } = await supabase.from("profiles").update(payload).eq("user_id", user.id);
    setLocationSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar localização", variant: "destructive" });
      return;
    }
    await refreshProfile();
    setHomeLocationCache(city, state);
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
    sponsors: (
      <SponsorCarousel
        key={`sponsors-${contentSeed}-${linkedSponsor?.id ?? "none"}`}
        section={getSection("sponsors")}
        pinnedSponsorId={linkedSponsor?.id ?? null}
      />
    ),
    jobs: null,
    search: (
      <div key={`search-${profile?.address_city}-${profile?.address_state}`} className="flex flex-col gap-3 w-full">
        <HomeOpenRequestCta />
        <HomeSearchBar section={getSection("search")} />
      </div>
    ),
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
    search: "min-h-[132px]",
    featured: "min-h-[250px]",
    categories: "min-h-[300px]",
    benefits: "min-h-[200px]",
    tutorials: "min-h-[220px]"
  };

  // Só monta o conteúdo (e os fetches) depois da sessão estar pronta — evita getSession() null pós-OAuth
  const contentReady = !authLoading && isReady;
  const showClientSignupProEndCta =
    contentReady && !!user && profile?.user_type === "client" && !linkedSponsor;

  return (
    <AppLayout>
      {contentReady ? <HomeLaunchBanner /> : null}
      {!contentReady ? (
        <HomeSkeleton />
      ) : user && homeFeedComunidade ? (
        <div className="w-full max-w-screen-lg lg:max-w-[1480px] xl:max-w-[1600px] mx-auto lg:px-4 xl:px-6 2xl:px-8 lg:py-3">
          <CommunityFeed variant="embedded" />
          {showClientSignupProEndCta ? (
            <div className="mt-8 px-4 pb-4 max-w-screen-lg mx-auto">
              <Link
                to="/signup-pro"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition-[transform,box-shadow] hover:shadow-lg hover:shadow-primary/25 active:scale-[0.99]"
              >
                <Briefcase className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2.25} />
                Tornar-se profissional
                <ChevronRight className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className="w-full max-w-screen-lg lg:max-w-[1480px] xl:max-w-[1600px] mx-auto px-4 lg:px-8 xl:px-12 py-2 lg:py-6 flex flex-col gap-4 lg:gap-6 bg-secondary transition-opacity duration-300"
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
            <div className="flex flex-col gap-3">
              {profile?.user_type === "client" && !linkedSponsor && !clientSignupProTopDismissed ? (
                <div className="relative -mt-0.5 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/[0.09] via-primary/[0.03] to-transparent px-4 pt-3.5 pb-3 pr-10 shadow-sm ring-1 ring-primary/[0.06] dark:from-primary/[0.14] dark:via-primary/[0.06] dark:to-transparent">
                  <button
                    type="button"
                    onClick={dismissClientSignupProTop}
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground active:scale-95"
                    aria-label="Fechar convite para profissional"
                  >
                    <X className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                  <div
                    className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/[0.12] blur-2xl dark:bg-primary/[0.2]"
                    aria-hidden
                  />
                  <div className="relative flex flex-col gap-2.5">
                    <div className="flex items-center justify-center gap-2 px-0.5">
                      <Sparkles className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                      <p className="text-center text-[13px] font-semibold leading-none tracking-tight text-foreground sm:text-sm whitespace-nowrap">
                        Quer oferecer seu serviço?
                      </p>
                    </div>
                    <Link
                      to="/signup-pro"
                      className="flex items-center justify-center gap-2 w-full rounded-full bg-primary py-3 pl-4 pr-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition-[transform,box-shadow] hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
                    >
                      <Briefcase className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2.25} />
                      <span className="flex-1 text-center">Tornar-se profissional</span>
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                    </Link>
                  </div>
                </div>
              ) : null}
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
                </div>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-0.5 -mb-1">
                A região onde você vê profissionais e destaques
              </p>
              {needsLocationSetup ? (
                <button
                  type="button"
                  onClick={handleOpenLocation}
                  className="w-full flex items-start gap-3 bg-amber-50 dark:bg-amber-950/35 border-2 border-amber-400 dark:border-amber-600 rounded-xl p-4 text-left shadow-sm active:scale-[0.99] transition-transform"
                >
                  <MapPin className="w-6 h-6 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-amber-950 dark:text-amber-50">Definir localização</p>
                    <p className="text-xs text-amber-900/90 dark:text-amber-100/85 mt-1 leading-snug">
                      Toque para informar cidade e CEP e ver profissionais e patrocinadores da sua região.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 self-center" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenLocation}
                  className="w-full flex items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3.5 text-left hover:bg-primary/10 active:scale-[0.99] transition-colors shadow-sm"
                >
                  <MapPin className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{locationLabel}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Toque para alterar cidade ou CEP</p>
                  </div>
                  <span className="text-xs font-bold text-primary shrink-0">Alterar</span>
                </button>
              )}
            </div>
          ) : null}

          {user && linkedSponsor && !homeFeedComunidade && (profile?.job_posting_enabled || profile?.user_type === "company") ? (
            <Link
              to="/my-jobs"
              className="flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md shadow-primary/25 mb-2 active:scale-[0.99] transition-transform"
            >
              <Briefcase className="w-5 h-5 shrink-0" />
              Publicar vaga de emprego
            </Link>
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
                {section.id === "sponsors" && linkedSponsor && !homeFeedComunidade ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setSponsorNovidadeOpen(true)}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-primary/35 bg-primary/5 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
                    >
                      <Megaphone className="w-5 h-5 shrink-0" />
                      Lançar novidade
                    </button>
                    <SponsorPatrocinadorPanel
                      key={sponsorReportsKey}
                      sponsorId={linkedSponsor.id}
                    />
                    <Link
                      to="/jobs"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-primary/35 bg-primary/5 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
                    >
                      <Briefcase className="w-5 h-5 shrink-0" />
                      VAGAS DE EMPREGO
                    </Link>
                  </div>
                ) : null}
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
          {profile?.user_type !== "professional" &&
            profile?.user_type !== "company" &&
            profile?.user_type !== "client" &&
            !linkedSponsor && (
            <Link
              to="/signup-pro"
              className="flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-semibold text-sm transition-colors"
            >
              <Briefcase className="w-5 h-5" />
              Tornar-se profissional
            </Link>
          )}

          {showClientSignupProEndCta ? (
            <div className="mt-2">
              <Link
                to="/signup-pro"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 transition-[transform,box-shadow] hover:shadow-lg hover:shadow-primary/25 active:scale-[0.99]"
              >
                <Briefcase className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2.25} />
                Tornar-se profissional
                <ChevronRight className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              </Link>
            </div>
          ) : null}

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
        </div>
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

      {/* ✨ Modal de Acesso Antecipado (VIP ou Business) */}
      <Dialog open={earlyAccessModal} onOpenChange={setEarlyAccessModal}>
        <DialogContent className="max-w-sm p-0 overflow-hidden border-0 rounded-3xl shadow-2xl">
          {earlyAccessDocType === "cnpj" ? (
            /* ── Business ── */
            <>
              <div className="relative bg-gradient-to-br from-violet-600 via-purple-700 to-orange-500 px-6 pt-8 pb-6 text-white text-center overflow-hidden">
                <div className="absolute top-4 left-6 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
                <div className="absolute bottom-4 right-6 w-24 h-24 bg-orange-400/20 rounded-full blur-2xl" />
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
                <div className="space-y-2 text-left bg-white/10 rounded-2xl p-4 mb-4">
                  {["Chamadas ilimitadas de clientes","Aparece em destaque na Home","Fotos de serviços no perfil","Suporte 24h prioritário","Publicar vagas de emprego","Catálogo de produtos","Agenda integrada"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <Star className="w-3.5 h-3.5 text-yellow-300 shrink-0 fill-yellow-300" />
                      <span className="text-white/95">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white/15 border border-white/25 rounded-2xl p-3 mb-2">
                  <p className="text-xs text-white/80 leading-relaxed">
                    🎁 <strong className="text-white">3 meses grátis</strong> — plano Business válido de{" "}
                    <strong className="text-yellow-300">15/04</strong> a <strong className="text-yellow-300">15/07/2026</strong>.
                    Sem cartão de crédito necessário! 🚀
                  </p>
                </div>
              </div>
              <div className="px-6 py-5 bg-card">
                <button onClick={() => setEarlyAccessModal(false)} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-orange-500 text-white font-black text-base tracking-wide shadow-lg hover:opacity-90 active:scale-95 transition-all">
                  Começar agora! 🚀
                </button>
                <p className="text-center text-[10px] text-muted-foreground mt-2">Acesso válido de 15/04 a 15/07/2026 · Sem cartão necessário</p>
              </div>
            </>
          ) : (
            /* ── VIP ── */
            <>
              <div className="relative bg-gradient-to-br from-amber-500 via-orange-500 to-primary px-6 pt-8 pb-6 text-white text-center overflow-hidden">
                <div className="absolute top-4 left-6 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
                <div className="absolute bottom-4 right-6 w-24 h-24 bg-yellow-400/20 rounded-full blur-2xl" />
                <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/15 border-2 border-white/30 mb-4 mx-auto">
                  <Crown className="w-10 h-10 text-yellow-200 drop-shadow-lg" />
                  <span className="absolute -top-1 -right-1 text-lg">⭐</span>
                </div>
                <h2 className="text-2xl font-black mb-1 tracking-tight drop-shadow">Parabéns! 🎉</h2>
                <p className="text-white/90 font-semibold text-base">Você ganhou acesso antecipado ao</p>
                <div className="inline-flex items-center gap-2 mt-2 mb-4 px-4 py-1.5 rounded-full bg-white/20 border border-white/30">
                  <Crown className="w-4 h-4 text-yellow-200" />
                  <span className="font-black text-lg tracking-wide text-yellow-200">Chamô VIP</span>
                </div>
                <div className="space-y-2 text-left bg-white/10 rounded-2xl p-4 mb-4">
                  {["Chamadas ilimitadas de clientes","Aparece em destaque na Home","Fotos de serviços no perfil","Suporte prioritário","Selo de profissional verificado"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <Star className="w-3.5 h-3.5 text-yellow-200 shrink-0 fill-yellow-200" />
                      <span className="text-white/95">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white/15 border border-white/25 rounded-2xl p-3 mb-2">
                  <p className="text-xs text-white/80 leading-relaxed">
                    🎁 <strong className="text-white">3 meses grátis</strong> — plano VIP válido de{" "}
                    <strong className="text-yellow-200">15/04</strong> a <strong className="text-yellow-200">15/07/2026</strong>.
                    Sem cartão de crédito necessário! 🚀
                  </p>
                </div>
              </div>
              <div className="px-6 py-5 bg-card">
                <button onClick={() => setEarlyAccessModal(false)} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-primary text-white font-black text-base tracking-wide shadow-lg hover:opacity-90 active:scale-95 transition-all">
                  Começar agora! 🚀
                </button>
                <p className="text-center text-[10px] text-muted-foreground mt-2">Acesso válido de 15/04 a 15/07/2026 · Sem cartão necessário</p>
              </div>
            </>
          )}
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
              Você ganhou <strong className="text-primary">1 cupom</strong> para o sorteio mensal!
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

      <SponsorLaunchNovidadeModal
        open={sponsorNovidadeOpen}
        onOpenChange={setSponsorNovidadeOpen}
        sponsor={linkedSponsor}
        onPublished={() => setSponsorReportsKey((k) => k + 1)}
      />
    </AppLayout>
  );
};

export default Home;