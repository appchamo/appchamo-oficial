import { useState, useEffect, useRef, useCallback } from "react";
import { Menu, Clock, Crown, Bell, LogIn, XCircle, CalendarCheck } from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import SideMenu from "./SideMenu";
import { useAuth } from "@/hooks/useAuth";
import { useMenu } from "@/contexts/MenuContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type NextAppt = {
  start_time: string;
  minutesUntil: number;
  link: string;
};

function computeMinutesUntil(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.slice(0, 5).split(":").map(Number);
  const apptMs = new Date(y, mo - 1, d, h, m, 0).getTime();
  return Math.floor((apptMs - Date.now()) / 60000);
}

const Header = () => {
  const { menuOpen, setMenuOpen } = useMenu();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isHomePath = location.pathname === "/home";
  const homeFeedComunidade = searchParams.get("feed") === "comunidade";
  
  const [proStatus, setProStatus] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextAppt, setNextAppt] = useState<NextAppt | null>(null);
  const nextApptDataRef = useRef<{ dateStr: string; timeStr: string; link: string } | null>(null);
  const notifSoundRef = useRef<HTMLAudioElement | null>(null);
  const prevUnreadRef = useRef<number>(0);
  const initialLoadRef = useRef(true);

  // Load notification sound URL
  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "notification_sound_url")
      .single()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "string" && data.value.trim()) {
          const url = data.value.includes("?") ? `${data.value}&_t=${Date.now()}` : `${data.value}?_t=${Date.now()}`;
          notifSoundRef.current = new Audio(url);
          notifSoundRef.current.volume = 0.5;
        } else {
          // Default beep using Web Audio API will be used as fallback
          notifSoundRef.current = null;
        }
      });
  }, []);

  const playNotificationSound = useCallback(() => {
    // iOS: não usar Audio() aqui — no iPhone vira "Now Playing" na tela de bloqueio
    if (Capacitor.getPlatform() === "ios") return;
    if (notifSoundRef.current) {
      notifSoundRef.current.currentTime = 0;
      notifSoundRef.current.play().catch(() => {});
    } else {
      // Simple default beep using AudioContext
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.15;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!user || !profile) return;

    const load = async () => {
      // 1. Pega o status do perfil profissional (para todos os tipos de usuário)
      const { data: pro } = await supabase
        .from("professionals")
        .select("profile_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile.user_type === "client") {
        // Cliente: só armazenar status se for "rejected" (para exibir badge REPROVADO)
        setProStatus(pro?.profile_status === "rejected" ? "rejected" : null);
      } else if (profile.user_type === "professional") {
        setProStatus(pro?.profile_status ?? "pending");
      } else {
        setProStatus(pro?.profile_status ?? null);
      }

      // 2. Pega os dados da assinatura (só para não-clientes)
      if (profile.user_type !== "client") {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("plan_id, status")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (sub) {
          setPlanId(sub.plan_id);
          setSubStatus(sub.status);
          
          const { data: plan } = await supabase
            .from("plans")
            .select("name")
            .eq("id", sub.plan_id)
            .single();
          if (plan) setPlanName(plan.name);
        }
      }
    };
    load();

    // Listener realtime na tabela professionals para detectar aprovação/rejeição em tempo real
    const channel = supabase
      .channel("header-pro-status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "professionals", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newStatus = (payload.new as any)?.profile_status;
          if (newStatus) setProStatus(newStatus);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, profile]);

  useEffect(() => {
    if (!user) return;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false)
        .neq("type", "chat");
      const newCount = count || 0;

      // Play sound if count increased (but not on initial load)
      if (!initialLoadRef.current && newCount > prevUnreadRef.current) {
        playNotificationSound();
      }
      initialLoadRef.current = false;
      prevUnreadRef.current = newCount;
      setUnreadCount(newCount);
    };

    fetchUnread();

    const channel = supabase
      .channel("header-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, playNotificationSound]);

  // Próximo compromisso (< 24h) — para clientes e usuários com agendamentos
  const fetchNextAppt = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Busca como cliente
    const { data: asClient } = await supabase
      .from("agenda_appointments")
      .select("appointment_date, start_time, chat_request_id")
      .eq("client_id", user.id)
      .in("status", ["pending", "confirmed"])
      .gte("appointment_date", today)
      .lte("appointment_date", tomorrow)
      .order("appointment_date").order("start_time")
      .limit(10);

    const rows = asClient || [];
    // Filtra apenas os que estão dentro das próximas 24h e ainda não começaram
    for (const r of rows) {
      const mins = computeMinutesUntil(r.appointment_date, r.start_time);
      if (mins > 0 && mins <= 24 * 60) {
        const link = r.chat_request_id ? `/messages/${r.chat_request_id}` : "/meus-agendamentos";
        nextApptDataRef.current = { dateStr: r.appointment_date, timeStr: r.start_time.slice(0, 5), link };
        setNextAppt({ start_time: r.start_time.slice(0, 5), minutesUntil: mins, link });
        return;
      }
    }
    nextApptDataRef.current = null;
    setNextAppt(null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchNextAppt();
    // Re-busca a cada 5 minutos
    const fetchInterval = setInterval(fetchNextAppt, 5 * 60 * 1000);
    // Atualiza o contador a cada 1 minuto
    const tickInterval = setInterval(() => {
      if (!nextApptDataRef.current) return;
      const { dateStr, timeStr, link } = nextApptDataRef.current;
      const mins = computeMinutesUntil(dateStr, timeStr);
      if (mins > 0 && mins <= 24 * 60) {
        setNextAppt({ start_time: timeStr, minutesUntil: mins, link });
      } else {
        nextApptDataRef.current = null;
        setNextAppt(null);
      }
    }, 60 * 1000);
    return () => { clearInterval(fetchInterval); clearInterval(tickInterval); };
  }, [user?.id, fetchNextAppt]);

  const isPro = profile && profile.user_type !== "client";

  // Regra de Exibição dos Selos
  const showRejectedBadge = !isPro && proStatus === "rejected";
  const showPendingBadge = isPro && (proStatus === "pending" || (planId !== "free" && subStatus && subStatus.toUpperCase() !== "ACTIVE"));
  const showPlanBadge = isPro && proStatus === "approved" && (!subStatus || subStatus.toUpperCase() === "ACTIVE" || planId === "free") && planName;

  const handleVipOrPlanosClick = () => {
    if (user) {
      navigate("/subscriptions");
    } else {
      navigate("/login", { state: { from: "/subscriptions" } });
    }
  };

  return (
    <>
      <header className="relative z-30 flex-shrink-0 bg-card/90 backdrop-blur-md border-b border-secondary">
        <div className="flex items-center justify-between gap-2 px-4 py-3 max-w-screen-lg mx-auto min-w-0">
          <div className="truncate min-w-0 flex-1 flex items-center">
            {user && isHomePath ? (
              <div
                className="inline-flex p-0.5 rounded-full bg-muted/90 border border-border/70 shadow-inner"
                role="tablist"
                aria-label="Alternar Início ou Comunidade"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!homeFeedComunidade}
                  onClick={() => setSearchParams({}, { replace: true })}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                    !homeFeedComunidade
                      ? "bg-card text-primary shadow-sm ring-1 ring-black/5"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Início
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={homeFeedComunidade}
                  onClick={() => setSearchParams({ feed: "comunidade" }, { replace: true })}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-bold transition-all max-w-[110px] truncate",
                    homeFeedComunidade
                      ? "bg-card text-primary shadow-sm ring-1 ring-black/5"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Comunidade
                </button>
              </div>
            ) : user ? (
              <span className="text-lg font-bold text-primary">Chamô</span>
            ) : (
              <span className="text-lg font-bold text-foreground truncate">
                Explorar <span className="text-primary">Chamô</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            
            {/* Selo REPROVADO (cliente com cadastro profissional rejeitado) */}
            {showRejectedBadge && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/30">
                <XCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-[11px] font-semibold text-destructive">Reprovado</span>
              </div>
            )}

            {/* Selo Em Análise (Aparece para perfil pendente ou pagamento aguardando aprovação) */}
            {showPendingBadge && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 animate-pulse">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[11px] font-semibold text-amber-700">Em análise</span>
              </div>
            )}
            
            {/* Não logado: botão "Entrar" no mesmo lugar do VIP (como na landing). Logado (só pro/empresa): VIP/Planos — cliente não vê para não cair na tela "exclusivo para profissionais" */}
            {!user && (
              <button
                onClick={() => navigate("/login", { state: { from: location.pathname } })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">Entrar</span>
              </button>
            )}
            {user && isPro && (
              <button
                type="button"
                onClick={handleVipOrPlanosClick}
                aria-label="Ver planos e assinatura VIP"
                className="flex items-center gap-1 max-w-[7.5rem] sm:max-w-[9rem] px-2 py-1.5 rounded-xl border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 active:scale-95 transition-all touch-manipulation"
              >
                <Crown className="w-3 h-3 flex-shrink-0 text-primary" />
                <span className="text-[11px] font-bold leading-none truncate">
                  {showPlanBadge ? planName : "Planos"}
                </span>
              </button>
            )}

            {/* Próximo compromisso — aparece < 24h antes */}
            {user && nextAppt && (() => {
              const mins = nextAppt.minutesUntil;
              const isUrgent = mins <= 60;
              const isSoon = mins <= 180;
              const label = mins < 60
                ? `Em ${mins}min`
                : `${nextAppt.start_time}`;
              const colorClasses = isUrgent
                ? "bg-rose-500/10 border-rose-400/40 text-rose-600"
                : isSoon
                ? "bg-amber-500/10 border-amber-400/40 text-amber-700"
                : "bg-emerald-500/10 border-emerald-400/40 text-emerald-700";
              const iconColor = isUrgent ? "text-rose-500" : isSoon ? "text-amber-500" : "text-emerald-500";
              return (
                <button
                  onClick={() => navigate(nextAppt.link)}
                  title={`Próximo compromisso às ${nextAppt.start_time}`}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-xl border text-[11px] font-bold transition-all active:scale-95 ${colorClasses} ${isUrgent ? "animate-pulse" : ""}`}
                >
                  <CalendarCheck className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
                  <span className="leading-none">{label}</span>
                </button>
              );
            })()}

            {user && (
              <button
                onClick={() => navigate("/notifications")}
                className="relative p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Notificações"
              >
                <Bell className="w-5 h-5 text-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setMenuOpen(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Abrir menu"
              data-onboarding="menu-button"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>
      </header>
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default Header;