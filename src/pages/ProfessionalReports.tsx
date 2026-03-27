import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Eye, MousePointerClick, Phone, CalendarCheck, Search } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyProfessionalAnalytics, type ProfessionalAnalyticsPayload } from "@/lib/proAnalytics";
import { Loader2 } from "lucide-react";

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

const ProfessionalReports = () => {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<ProfessionalAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const isPro = profile?.user_type === "professional" || profile?.user_type === "company";

  useEffect(() => {
    if (!isPro || authLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const row = await fetchMyProfessionalAnalytics();
      if (!cancelled) {
        setData(row);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPro, authLoading]);

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
        <p className="text-sm text-muted-foreground mb-6">
          Resumo de como seu perfil aparece e como os clientes interagem com você no Chamô.
        </p>

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
