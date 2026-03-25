import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Calendar, Clock, Sparkles, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import AgendaBookingDialog from "@/components/AgendaBookingDialog";
import { Loader2 } from "lucide-react";

interface ProPublic {
  id: string;
  user_id: string;
  agenda_enabled: boolean;
  verified: boolean;
  rating: number;
  total_reviews: number;
  category_name: string;
  profession_name: string;
  full_name: string;
  avatar_url: string | null;
  user_type: string;
}

export default function PublicAgenda() {
  const { proKey } = useParams<{ proKey: string }>();
  const [pro, setPro] = useState<ProPublic | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    if (!proKey) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proKey);
    const base = supabase
      .from("professionals")
      .select(
        "id, user_id, agenda_enabled, verified, rating, total_reviews, category_id, profession_id, categories(name), professions:profession_id(name)",
      );
    const { data: row, error } = await (isUUID ? base.eq("id", proKey) : base.eq("slug", proKey)).maybeSingle();

    if (error || !row) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const { data: mainProfile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, user_type")
      .eq("user_id", row.user_id)
      .maybeSingle();

    let profileData = mainProfile;
    if (!profileData) {
      const { data: pub } = await supabase
        .from("profiles_public" as never)
        .select("full_name, avatar_url, user_type")
        .eq("user_id", row.user_id)
        .maybeSingle();
      profileData = pub as typeof mainProfile;
    }

    const { data: sub } = await supabase.from("subscriptions").select("plan_id").eq("user_id", row.user_id).maybeSingle();

    setPlanId(sub && (sub as { plan_id: string }).plan_id ? (sub as { plan_id: string }).plan_id : null);
    setPro({
      id: row.id,
      user_id: row.user_id,
      agenda_enabled: !!(row as { agenda_enabled?: boolean }).agenda_enabled,
      verified: !!(row as { verified?: boolean }).verified,
      rating: Number((row as { rating?: number }).rating) || 0,
      total_reviews: Number((row as { total_reviews?: number }).total_reviews) || 0,
      category_name: ((row as { categories?: { name?: string } }).categories?.name as string) || "Serviços",
      profession_name: ((row as { professions?: { name?: string } }).professions?.name as string) || "",
      full_name: profileData?.full_name || "Profissional",
      avatar_url: profileData?.avatar_url ?? null,
      user_type: profileData?.user_type || "professional",
    });
    setLoading(false);
  }, [proKey]);

  useEffect(() => {
    load();
  }, [load]);

  const canBook =
    pro &&
    pro.agenda_enabled &&
    (pro.user_type === "company" || planId === "business");

  const returnPath = proKey ? `/agendar/${proKey}` : "/agendar";

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted/40">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Carregando agenda…</p>
      </div>
    );
  }

  if (notFound || !pro) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 bg-background text-center">
        <Calendar className="w-14 h-14 text-muted-foreground/40 mb-4" />
        <h1 className="text-lg font-bold text-foreground mb-2">Agenda não encontrada</h1>
        <p className="text-sm text-muted-foreground mb-6">Confira o link ou abra o perfil no app Chamô.</p>
        <Button asChild className="rounded-xl">
          <Link to="/">Ir ao início</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-primary/[0.07] via-background to-muted/30">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Chamô
          </Link>
          <Button variant="outline" size="sm" className="rounded-full text-xs" asChild>
            <Link to={`/professional/${proKey}`}>Ver perfil</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-8 pb-16">
        <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-card shadow-elevated">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-amber-500/10 pointer-events-none" />
          <div className="relative p-6 sm:p-8 text-center">
            <div className="mx-auto mb-4 relative w-28 h-28">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-amber-500 opacity-90 blur-md scale-110" />
              <div className="relative w-full h-full rounded-full ring-4 ring-background shadow-lg overflow-hidden bg-muted">
                {pro.avatar_url ? (
                  <img src={pro.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-primary/40">
                    {pro.full_name.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-extrabold text-foreground tracking-tight">{pro.full_name}</h1>
              {pro.verified && (
                <BadgeCheck className="w-6 h-6 text-sky-500 shrink-0" aria-label="Verificado" />
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {pro.profession_name ? `${pro.profession_name} · ` : ""}
              {pro.category_name}
            </p>

            {pro.total_reviews > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/80 text-sm mb-6">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="font-semibold">{pro.rating.toFixed(1)}</span>
                <span className="text-muted-foreground">({pro.total_reviews} avaliações)</span>
              </div>
            )}

            <div className="flex items-start gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/10 text-left mb-6">
              <div className="rounded-xl bg-primary/15 p-2.5 shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Agende em poucos toques</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Escolha o serviço, data e horário. Na confirmação, faça login ou cadastro — você volta para esta tela.
                </p>
              </div>
            </div>

            {canBook ? (
              <Button
                size="lg"
                className="w-full rounded-2xl text-base font-bold h-14 shadow-lg shadow-primary/25"
                onClick={() => setDialogOpen(true)}
              >
                <Calendar className="w-5 h-5 mr-2" />
                Agendar horário
              </Button>
            ) : (
              <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/40 p-5 text-center">
                <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">Agenda indisponível no momento</p>
                <p className="text-xs text-muted-foreground mt-1">
                  O profissional pode estar com a agenda desativada ou o link está desatualizado.
                </p>
                <Button variant="outline" className="mt-4 rounded-xl" asChild>
                  <Link to={`/professional/${proKey}`}>Abrir perfil completo</Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-8 px-4">
          Agendamento pelo app <span className="font-semibold text-primary">Chamô</span> — profissionais verificados e chat com o prestador.
        </p>
      </main>

      {canBook && (
        <AgendaBookingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          professionalId={pro.id}
          professionalName={pro.full_name}
          professionalUserId={pro.user_id}
          professionalAvatarUrl={pro.avatar_url}
          loginRedirectPath={returnPath}
        />
      )}
    </div>
  );
}
