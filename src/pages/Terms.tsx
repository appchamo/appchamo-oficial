import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";

const Terms = () => {
  const [termsOfUse, setTermsOfUse] = useState("");
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["terms_of_use", "privacy_policy"]);
      if (data) {
        for (const s of data) {
          const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value).replace(/^"|"$/g, "");
          if (s.key === "terms_of_use") setTermsOfUse(val);
          if (s.key === "privacy_policy") setPrivacyPolicy(val);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <AppLayout><main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Carregando...</main></AppLayout>;

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/profile" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Termos e Privacidade</h1>
        </div>

        <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
          <h2 className="text-lg font-semibold text-foreground mb-3">Termos de Uso</h2>
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {termsOfUse || "Nenhum termo de uso cadastrado."}
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-5 shadow-card">
          <h2 className="text-lg font-semibold text-foreground mb-3">Política de Privacidade (LGPD)</h2>
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {privacyPolicy || "Nenhuma política de privacidade cadastrada."}
          </div>
        </div>
      </main>
    </AppLayout>
  );
};

export default Terms;
