import { useNavigate } from "react-router-dom";
import { CheckCircle, Globe, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

const BG_PHOTO = "https://wfxeiuqxzrlnvlopcrwd.supabase.co/storage/v1/object/public/uploads/tutorials/135419.png";

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
  const isNative = Capacitor.isNativePlatform();

  const handleLoginClick = async () => {
    localStorage.removeItem("signup_in_progress");
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleWebAccess = async () => {
    localStorage.removeItem("signup_in_progress");
    await supabase.auth.signOut();
    navigate("/qr-auth");
  };

  // ── No app nativo (iOS/Android): tela simples de login/cadastro ──────────
  if (isNative) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-4 py-4 flex items-center justify-between max-w-screen-lg mx-auto w-full">
          <span className="text-2xl font-extrabold text-gradient tracking-tight">Chamô</span>
          <button onClick={handleLoginClick} className="text-sm font-medium text-primary hover:underline bg-transparent border-none cursor-pointer">
            Entrar
          </button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-4 text-center max-w-md mx-auto gap-6">
          <h1 className="text-3xl font-extrabold text-foreground leading-tight">
            Encontre profissionais de confiança <span className="text-gradient">perto de você</span>
          </h1>
          <p className="text-sm text-muted-foreground">Contrate com segurança e concorra a prêmios mensais.</p>
          <button
            onClick={() => navigate("/home")}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-primary/40 font-semibold text-sm text-primary hover:bg-primary/10 transition-colors"
          >
            Explorar o app sem cadastro
          </button>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => navigate("/signup")}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Criar conta <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleLoginClick}
              className="flex-1 flex items-center justify-center py-3 rounded-xl border font-medium text-sm text-foreground hover:bg-muted transition-colors bg-transparent"
            >
              Entrar
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Desktop / Mobile Web: landing page completa com foto de fundo ─────────
  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{
        backgroundImage: `url("${BG_PHOTO}")`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
      }}
    >
      {/* Overlay gradiente escuro — mais denso à esquerda */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 to-black/30 pointer-events-none" />
      {/* Overlay extra no mobile para legibilidade */}
      <div className="absolute inset-0 bg-black/30 md:hidden pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 w-full px-6 md:px-12 py-5 flex items-center justify-between max-w-screen-xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
            <span className="text-xl text-white font-extrabold">C</span>
          </div>
          <span className="text-2xl font-extrabold text-white tracking-tight">Chamô</span>
        </div>
        <button
          onClick={handleWebAccess}
          className="flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white border border-white/25 hover:border-white/50 px-4 py-2 rounded-full transition-all backdrop-blur-sm bg-white/5 hover:bg-white/10"
        >
          <Globe className="w-4 h-4" />
          Acessar via Web
        </button>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col justify-center px-6 md:px-12 max-w-screen-xl mx-auto w-full py-12 md:py-20">
        <div className="max-w-2xl space-y-8">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-primary/20 border border-primary/40 rounded-full px-4 py-1.5 backdrop-blur-sm w-fit">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-semibold text-primary">O app dos profissionais</span>
          </div>

          {/* Headline */}
          <div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.05] tracking-tight mb-4">
              O profissional ideal,
              <br />
              <span className="text-primary">na palma da sua mão.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/70 leading-relaxed max-w-lg">
              Contrate, gerencie e pague profissionais com segurança — tudo em um só lugar.
            </p>
          </div>

          {/* Highlights */}
          <div className="space-y-3">
            {[
              "Contrate e pague com segurança",
              "O ecossistema mais completo do mercado",
              "Profissionais verificados na sua região",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="text-base md:text-lg text-white/80 font-medium">{item}</span>
              </div>
            ))}
          </div>

          {/* Social proof */}
          <div className="flex items-center gap-4 bg-black/40 backdrop-blur-md border border-white/15 rounded-2xl px-5 py-4 w-fit">
            <div className="flex -space-x-2">
              {["#f97316", "#ea580c", "#c2410c", "#9a3412"].map((c, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-black/40 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: c }}>
                  {["R", "M", "J", "A"][i]}
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-4 h-4 fill-amber-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                ))}
                <span className="text-sm font-bold text-white ml-1">4.9</span>
              </div>
              <p className="text-xs text-white/50">Baseado em +200.000 avaliações</p>
            </div>
          </div>

          {/* Download Buttons */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Baixe o aplicativo</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="https://apps.apple.com/app/chamô/id6742879924"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-6 py-3.5 rounded-2xl font-semibold text-sm transition-all hover:scale-105 active:scale-95 shadow-xl"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", backdropFilter: "blur(10px)" }}
              >
                <AppStoreIcon />
                <div className="text-left">
                  <p className="text-[10px] text-white/60 leading-none">Baixar na</p>
                  <p className="text-sm font-bold text-white leading-tight">App Store</p>
                </div>
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.appchamo.app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-6 py-3.5 rounded-2xl font-semibold text-sm transition-all hover:scale-105 active:scale-95 shadow-xl"
                style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <PlayStoreIcon />
                <div className="text-left">
                  <p className="text-[10px] text-white/80 leading-none">Disponível no</p>
                  <p className="text-sm font-bold text-white leading-tight">Google Play</p>
                </div>
              </a>
            </div>
          </div>

          {/* Explorar sem cadastro */}
          <button
            onClick={() => navigate("/home")}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            Explorar sem cadastro <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-6 md:px-12 py-4 border-t border-white/10 flex items-center justify-between max-w-screen-xl mx-auto">
        <p className="text-xs text-white/30">© 2026 Chamô. Todos os direitos reservados.</p>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/terms-of-use")} className="text-xs text-white/30 hover:text-white/60 transition-colors">Termos</button>
          <button onClick={() => navigate("/privacy")} className="text-xs text-white/30 hover:text-white/60 transition-colors">Privacidade</button>
        </div>
      </footer>
    </div>
  );
};

export default Index;
