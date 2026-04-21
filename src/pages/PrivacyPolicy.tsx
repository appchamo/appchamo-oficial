import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";

const PrivacyPolicy = () => {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "privacy_policy")
        .maybeSingle();
      if (data?.value != null) {
        const val = typeof data.value === "string" ? data.value : JSON.stringify(data.value).replace(/^"|"$/g, "");
        setContent(val);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Carregando...</main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="flex items-center gap-3 mb-4">
          <Link to={user ? "/profile" : "/"} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Política de Privacidade</h1>
        </div>

        <div className="bg-card border rounded-2xl p-5 shadow-card">
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {content || "Nenhuma política de privacidade cadastrada."}
          </div>
        </div>

        <p className="mt-4 px-1 text-[11.5px] leading-relaxed text-muted-foreground">
          Você pode excluir sua conta a qualquer momento em{" "}
          <span className="font-semibold text-foreground">Perfil → Excluir minha conta</span>. Ao
          excluir, todo o conteúdo vinculado (aceites, histórico, perfil e dados pessoais) é
          encerrado e esta política deixa de se aplicar a você, ressalvadas as obrigações legais
          de retenção previstas na LGPD e demais normas aplicáveis.
        </p>
      </main>
    </AppLayout>
  );
};

export default PrivacyPolicy;
