import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { addDays, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  Eye,
  MousePointerClick,
  Phone,
  CalendarCheck,
  Search,
  Loader2,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMyProfessionalAnalytics,
  type ProfessionalAnalyticsPayload,
  type ProfessionalAnalyticsRange,
} from "@/lib/proAnalytics";

type PeriodPreset = "today" | "yesterday" | "d7" | "d14" | "d30" | "lifetime" | "custom";

function dateInputToStartOfDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return startOfDay(new Date(y, m - 1, d));
}

function buildAnalyticsRange(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string,
): ProfessionalAnalyticsRange | null {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  switch (preset) {
    case "today":
      return { from: todayStart, to: tomorrowStart };
    case "yesterday":
      return { from: addDays(todayStart, -1), to: todayStart };
    case "d7":
      return { from: addDays(todayStart, -6), to: tomorrowStart };
    case "d14":
      return { from: addDays(todayStart, -13), to: tomorrowStart };
    case "d30":
      return { from: addDays(todayStart, -29), to: tomorrowStart };
    case "lifetime":
      return null;
    case "custom": {
      const a = dateInputToStartOfDay(customFrom);
      const b = dateInputToStartOfDay(customTo);
      if (!a || !b) {
        return { from: todayStart, to: tomorrowStart };
      }
      let from = a;
      let endDay = b;
      if (endDay < from) {
        const t = from;
        from = endDay;
        endDay = t;
      }
      return { from, to: addDays(endDay, 1) };
    }
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{value.toLocaleString("pt-BR")}</p>
          {hint ? <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

const PRESET_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  d7: "7 dias",
  d14: "14 dias",
  d30: "30 dias",
  lifetime: "Todo período",
  custom: "Personalizado",
};

const ProfessionalReports = () => {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<ProfessionalAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<PeriodPreset>("d7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const isPro = profile?.user_type === "professional" || profile?.user_type === "company";
  const uid = profile?.user_id;

  const range = useMemo(
    () => buildAnalyticsRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const rangeRef = useRef(range);
  rangeRef.current = range;

  const refreshSilently = useCallback(async () => {
    const row = await fetchMyProfessionalAnalytics(rangeRef.current);
    if (row) setData(row);
  }, []);

  useEffect(() => {
    if (!isPro || authLoading) return;
    let cancelled = false;
    setLoading(true);
    void fetchMyProfessionalAnalytics(range).then((row) => {
      if (!cancelled) {
        setData(row);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isPro, authLoading, range]);

  useEffect(() => {
    if (!uid || !isPro || authLoading) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void refreshSilently();
      }, 450);
    };

    const channel = supabase
      .channel(`pro-analytics-live-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "professional_analytics_counters",
          filter: `user_id=eq.${uid}`,
        },
        scheduleReload,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "professional_analytics_events",
          filter: `target_user_id=eq.${uid}`,
        },
        scheduleReload,
      )
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [uid, isPro, authLoading, refreshSilently]);

  useEffect(() => {
    if (!isPro || authLoading) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshSilently();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isPro, authLoading, refreshSilently]);

  if (authLoading) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-16 flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </main>
      </AppLayout>
    );
  }

  if (!isPro) {
    return <Navigate to="/profile" replace />;
  }

  const stats = data ?? {
    profile_views: 0,
    profile_clicks: 0,
    call_clicks: 0,
    appointment_bookings: 0,
    name_searches: 0,
  };

  const periodDescription =
    range == null
      ? "Totais acumulados desde o início da medição."
      : `${format(range.from, "dd/MM/yyyy", { locale: ptBR })} – ${format(addDays(range.to, -1), "dd/MM/yyyy", { locale: ptBR })}`;

  const presetOrder: PeriodPreset[] = ["today", "yesterday", "d7", "d14", "d30", "lifetime", "custom"];

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <Link
          to="/profile"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <h1 className="text-xl font-bold text-foreground mb-1">Relatórios</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Resumo de como seu perfil aparece e como os clientes interagem com você no Chamô.
        </p>

        <p className="text-xs text-muted-foreground mb-2 font-medium">Período</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {presetOrder.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={preset === key ? "default" : "outline"}
              className="rounded-full h-8 text-xs"
              onClick={() => setPreset(key)}
            >
              {PRESET_LABELS[key]}
            </Button>
          ))}
        </div>

        {preset === "custom" ? (
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              De
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Até
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground mb-4 leading-snug">{periodDescription}</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <StatCard
              icon={Eye}
              label="Visualizações"
              value={stats.profile_views}
              hint="Vezes em que seu cartão apareceu em destaque, profissionais próximos ou na busca."
            />
            <StatCard
              icon={MousePointerClick}
              label="Cliques no perfil"
              value={stats.profile_clicks}
              hint="Aberturas do seu perfil a partir de qualquer lugar do app."
            />
            <StatCard
              icon={Phone}
              label="Chamados (CHAMAR)"
              value={stats.call_clicks}
              hint="Toques no botão CHAMAR no seu perfil."
            />
            <StatCard
              icon={CalendarCheck}
              label="Agendamentos solicitados"
              value={stats.appointment_bookings}
              hint="Pedidos de agendamento enviados pela sua agenda online."
            />
            <StatCard
              icon={Search}
              label="Buscas pelo seu nome"
              value={stats.name_searches}
              hint="Quando alguém busca exatamente o nome do seu perfil (ignorando maiúsculas e acentos)."
            />
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default ProfessionalReports;
