import AppLayout from "@/components/AppLayout";
import ProfessionalServices from "@/components/ProfessionalServices";
import { ArrowLeft, Briefcase } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const MyServices = () => {
  const { user } = useAuth();
  const { plan } = useSubscription();
  const [proId, setProId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canUseServices = plan?.id === "pro" || plan?.id === "vip" || plan?.id === "business";

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setProId(data?.id ?? null);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-10 flex justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </main>
      </AppLayout>
    );
  }

  if (!canUseServices) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-5">
          <Link to="/pro" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Painel Profissional
          </Link>
          <div className="bg-card border rounded-2xl p-8 text-center">
            <Briefcase className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <h2 className="font-semibold text-foreground mb-1">Serviços disponível nos planos Pro e VIP</h2>
            <p className="text-sm text-muted-foreground mb-4">Faça upgrade do seu plano para adicionar fotos dos seus serviços no perfil.</p>
            <Link to="/subscriptions" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">
              Ver planos
            </Link>
          </div>
        </main>
      </AppLayout>
    );
  }

  if (!proId) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-5">
          <Link to="/pro" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Painel Profissional
          </Link>
          <p className="text-muted-foreground text-center py-10">Perfil profissional não encontrado.</p>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/pro" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Painel Profissional
        </Link>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground">Meus Serviços</h1>
          <p className="text-xs text-muted-foreground">Fotos dos seus trabalhos e serviços exibidas no seu perfil</p>
        </div>
        <ProfessionalServices professionalId={proId} isOwner={true} />
      </main>
    </AppLayout>
  );
};

export default MyServices;
