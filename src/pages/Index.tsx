import { useNavigate } from "react-router-dom";
import { Shield, Star, Users, ChevronRight, Smartphone, Globe, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Ícones SVG das lojas (inline para evitar dependência extra)
const AppStoreIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

const PlayStoreIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 20.5v-17c0-.83.94-1.3 1.6-.8l14 8.5c.6.37.6 1.23 0 1.6l-14 8.5c-.66.5-1.6.03-1.6-.8zM5 6.84v10.32L15.03 12 5 6.84z"/>
  </svg>
);

const Index = () => {
  const navigate = useNavigate();

  const handleWebAccess = async () => {
    localStorage.removeItem("signup_in_progress");
    await supabase.auth.signOut();
    navigate("/qr-auth");
  };

  const features = [
    { icon: Shield, label: "Pagamento Seguro", desc: "Pague só quando o serviço for concluído" },
    { icon: Star, label: "Avaliações Reais", desc: "Perfis verificados e avaliados pela comunidade" },
    { icon: Users, label: "Milhares de Profissionais", desc: "Encontre o especialista ideal na sua cidade" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #1a0a00 0%, #2d1200 40%, #1f0d05 100%)" }}>

      {/* Header */}
      <header className="px-5 py-4 flex items-center justify-between max-w-screen-lg mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-white font-black text-sm">C</span>
          </div>
          <span className="text-xl font-black text-white tracking-tight">Chamô</span>
        </div>
        <button
          onClick={handleWebAccess}
          className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-full transition-all"
        >
          <Globe className="w-3.5 h-3.5" />
          Acessar via Web
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 text-center max-w-lg mx-auto gap-8 py-10">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-primary/20 border border-primary/30 rounded-full px-4 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold text-primary">O app dos profissionais</span>
        </div>

        {/* Headline */}
        <div>
          <h1 className="text-4xl font-black text-white leading-tight mb-3">
            O profissional ideal,{" "}
            <span style={{ color: "#f97316" }}>na palma da sua mão.</span>
          </h1>
          <p className="text-white/60 text-sm leading-relaxed max-w-xs mx-auto">
            Contrate, gerencie e pague profissionais com segurança — tudo em um só lugar.
          </p>
        </div>

        {/* Social Proof */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
          <div className="flex -space-x-2">
            {["#f97316", "#ea580c", "#c2410c", "#9a3412"].map((c, i) => (
              <div key={i} className="w-7 h-7 rounded-full border-2 border-black/30 flex items-center justify-center text-[9px] font-bold text-white" style={{ background: c }}>
                {["R", "M", "J", "A"][i]}
              </div>
            ))}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
              ))}
              <span className="text-xs font-bold text-white ml-1">4.9</span>
            </div>
            <p className="text-[10px] text-white/50">+200.000 avaliações</p>
          </div>
        </div>

        {/* Download Buttons */}
        <div className="w-full space-y-3">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">Baixe o aplicativo</p>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            {/* App Store */}
            <a
              href="https://apps.apple.com/app/chamô/id6742879924"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl font-semibold text-sm transition-all active:scale-95 shadow-lg"
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              <AppStoreIcon />
              <div className="text-left">
                <p className="text-[9px] text-white/60 leading-none">Baixar na</p>
                <p className="text-sm font-bold text-white leading-tight">App Store</p>
              </div>
            </a>

            {/* Play Store */}
            <a
              href="https://play.google.com/store/apps/details?id=com.appchamo.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl font-semibold text-sm transition-all active:scale-95 shadow-lg"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <PlayStoreIcon />
              <div className="text-left">
                <p className="text-[9px] text-white/80 leading-none">Disponível no</p>
                <p className="text-sm font-bold text-white leading-tight">Google Play</p>
              </div>
            </a>
          </div>
        </div>

        {/* Explore without account */}
        <button
          onClick={() => navigate("/home")}
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          Explorar sem cadastro <ChevronRight className="w-4 h-4" />
        </button>

        {/* Features */}
        <div className="w-full grid grid-cols-3 gap-3 mt-2">
          {features.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center hover:bg-white/8 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-2">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="text-[10px] font-bold text-white leading-tight mb-0.5">{label}</p>
              <p className="text-[9px] text-white/40 leading-tight hidden sm:block">{desc}</p>
            </div>
          ))}
        </div>

        {/* Highlights */}
        <div className="w-full space-y-2">
          {[
            "Contrate e pague com segurança",
            "O ecossistema mais completo do mercado",
            "Profissionais verificados na sua região",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm text-white/70">{item}</span>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-5 py-4 border-t border-white/10 flex items-center justify-between max-w-screen-lg mx-auto w-full">
        <p className="text-[10px] text-white/30">© 2026 Chamô. Todos os direitos reservados.</p>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/terms-of-use")} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">Termos</button>
          <button onClick={() => navigate("/privacy")} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">Privacidade</button>
        </div>
      </footer>
    </div>
  );
};

export default Index;
