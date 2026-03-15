import { useState, useEffect, useRef, useCallback } from "react";
import { Menu, Clock, Crown, Bell, LogIn } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import SideMenu from "./SideMenu";
import { useAuth } from "@/hooks/useAuth";
import { useMenu } from "@/contexts/MenuContext";
import { supabase } from "@/integrations/supabase/client";

const Header = () => {
  const { menuOpen, setMenuOpen } = useMenu();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [proStatus, setProStatus] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  
  const [unreadCount, setUnreadCount] = useState(0);
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
    if (profile.user_type === "client") return;

    const load = async () => {
      // 1. Pega o status do perfil
      const { data: pro } = await supabase
        .from("professionals")
        .select("profile_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (pro) setProStatus(pro.profile_status);

      // 2. Pega os dados da assinatura
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
    };
    load();
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

  const isPro = profile && profile.user_type !== "client";
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Usuário";
  const welcomeWord =
    profile?.gender === "female" ? "Bem-vinda" : profile?.gender === "male" ? "Bem-vindo" : "Bem-vindo(a)";

  // Regra de Exibição do Selo
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
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-secondary">
        <div className="flex items-center justify-between px-4 py-3 max-w-screen-lg mx-auto">
          <span className="text-lg font-bold text-foreground truncate max-w-[55%]">
            {user ? (
              <>{welcomeWord}, <span className="text-primary">{firstName}</span> 👋</>
            ) : (
              <>Explorar <span className="text-primary">Chamô</span></>
            )}
          </span>
          <div className="flex items-center gap-2">
            
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
                className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-colors shadow-sm touch-manipulation"
              >
                <Crown className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">{showPlanBadge ? planName : "Planos"}</span>
              </button>
            )}

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