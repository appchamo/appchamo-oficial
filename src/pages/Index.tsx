import { useNavigate } from "react-router-dom";
import { CheckCircle, Globe, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

const BG_PHOTO = "https://wfxeiuqxzrlnvlopcrwd.supabase.co/storage/v1/object/public/uploads/tutorials/135419.png";

// ── Redes sociais — substitua os hrefs pelos links reais ──────────────────────
const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/appchamo/",
  whatsapp:  "https://wa.me/5534997092025",
  youtube:   "https://www.youtube.com/@appchamo",
  linkedin:  "https://www.linkedin.com/in/cham%C3%B4-tecnologia-5004533b9/",
};

// ── Avatares reais para prova social ─────────────────────────────────────────
const AVATARS = [
  "https://i.pravatar.cc/40?img=47",
  "https://i.pravatar.cc/40?img=12",
  "https://i.pravatar.cc/40?img=33",
  "https://i.pravatar.cc/40?img=57",
];

/* Badge oficial App Store — ícone Apple preto em fundo branco */
const AppStoreBadge = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 119.66407 40" className="h-[44px] w-auto flex-shrink-0">
    <g>
      <rect rx="5" ry="5" width="119.66407" height="40" fill="#000"/>
      <g fill="#fff">
        {/* Apple logo */}
        <path d="M24.769 20.301c-.03-3.21 2.62-4.77 2.74-4.847-1.497-2.187-3.823-2.486-4.644-2.512-1.964-.2-3.85 1.17-4.847 1.17-.999 0-2.528-1.148-4.16-1.115-2.129.032-4.099 1.25-5.19 3.156-2.228 3.855-.568 9.558 1.594 12.688 1.057 1.536 2.309 3.257 3.957 3.194 1.594-.065 2.195-1.03 4.125-1.03 1.929 0 2.494 1.03 4.19.994 1.712-.028 2.8-1.56 3.853-3.1 1.208-1.783 1.712-3.503 1.744-3.592-.038-.015-3.343-1.28-3.362-5.006z"/>
        <path d="M21.67 11.174c.877-1.062 1.47-2.54 1.308-4.011-1.265.052-2.797.842-3.705 1.903-.812.942-1.525 2.447-1.333 3.889 1.41.11 2.845-.716 3.73-1.781z"/>
        {/* Download on the */}
        <text x="37" y="14" fontSize="7" fontFamily="Arial" letterSpacing="0.5" fill="#fff" opacity="0.8">Download on the</text>
        <text x="37" y="27" fontSize="14" fontFamily="Arial" fontWeight="bold" fill="#fff">App Store</text>
      </g>
    </g>
  </svg>
);

/* Badge oficial Google Play — colorido em fundo preto */
const GooglePlayBadge = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 135 40" className="h-[44px] w-auto flex-shrink-0">
    <rect rx="5" ry="5" width="135" height="40" fill="#000"/>
    {/* Play triangle colorido */}
    <path d="M11 8l18 12L11 32V8z" fill="#ea4335" opacity="0"/>
    <g transform="translate(10,8)">
      <path d="M1 1.27L18.44 12 1 22.73V1.27z" fill="url(#gp-grad)"/>
      <defs>
        <linearGradient id="gp-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00d2ff"/>
          <stop offset="50%" stopColor="#00b876"/>
          <stop offset="100%" stopColor="#ffcc00"/>
        </linearGradient>
      </defs>
      {/* 4 cores do ícone play */}
      <path d="M1 1.27l9.9 9.9L1.5 1.7A.5.5 0 011 1.27z" fill="#4285f4"/>
      <path d="M18.44 12l-7.54 4.53 2.36 2.36L18.44 12z" fill="#ea4335"/>
      <path d="M1 22.73l9.4-9.4-2.36-2.36L1 22.73z" fill="#fbbc04"/>
      <path d="M18.44 12L10.9 7.47 8.54 9.83 18.44 12z" fill="#34a853"/>
      <path d="M1 1.27l9.9 9.9 1.46-1.46L1.5 1.7A.5.5 0 011 1.27zM10.9 13.17l7.54 4.53-5.18-5.18-2.36.65z" fill="rgba(0,0,0,0.15)"/>
    </g>
    <g fill="#fff" fontFamily="Arial">
      <text x="36" y="15" fontSize="7" letterSpacing="0.3" opacity="0.8">GET IT ON</text>
      <text x="36" y="28" fontSize="14" fontWeight="bold">Google Play</text>
    </g>
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
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

  // ── App nativo: tela simples ──────────────────────────────────────────────
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

  // ── Web: landing page ─────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-[#0a0a0a]">

      {/* Foto de fundo — posicionada para mostrar a mulher com celular */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${BG_PHOTO}")`,
          backgroundSize: "cover",
          backgroundPosition: "65% center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Gradiente — forte à esquerda, transparente à direita */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/20 pointer-events-none" />
      {/* Gradiente extra no mobile: cobre mais a imagem para legibilidade */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80 md:hidden pointer-events-none" />

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className="relative z-10 w-full px-5 md:px-12 py-4 flex items-center justify-between max-w-screen-xl mx-auto">

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0">
            <span className="text-lg text-white font-extrabold">C</span>
          </div>
          <span className="text-xl font-extrabold text-white tracking-tight">Chamô</span>
        </div>

        {/* Redes sociais + botão web */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Ícones sociais — visíveis no desktop e mobile */}
          <div className="flex items-center gap-2.5">
            <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors" title="Instagram">
              <InstagramIcon />
            </a>
            <a href={SOCIAL_LINKS.whatsapp} target="_blank" rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors" title="WhatsApp">
              <WhatsAppIcon />
            </a>
            <a href={SOCIAL_LINKS.youtube} target="_blank" rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors" title="YouTube">
              <YouTubeIcon />
            </a>
            <a href={SOCIAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors" title="LinkedIn">
              <LinkedInIcon />
            </a>
          </div>

          {/* Separador */}
          <div className="w-px h-5 bg-white/20 hidden sm:block" />

          {/* Acessar via Web */}
          <button
            onClick={handleWebAccess}
            className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-full transition-all backdrop-blur-sm bg-white/5"
          >
            <Globe className="w-3.5 h-3.5" />
            Acessar via Web
          </button>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col justify-center px-5 md:px-12 max-w-screen-xl mx-auto w-full py-8 md:py-16">
        <div className="max-w-xl space-y-6">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-primary/20 border border-primary/40 rounded-full px-3.5 py-1.5 backdrop-blur-sm w-fit">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold text-primary">O app dos profissionais</span>
          </div>

          {/* Título — máximo 2 linhas */}
          <h1 className="text-[2.6rem] sm:text-5xl md:text-6xl font-extrabold text-white leading-[1.05] tracking-tight">
            O profissional ideal,{" "}
            <span className="text-primary whitespace-nowrap">na palma da sua mão.</span>
          </h1>

          {/* Subtítulo */}
          <p className="text-base md:text-lg text-white/70 leading-relaxed max-w-md">
            Contrate, gerencie e pague profissionais com segurança — tudo em um só lugar.
          </p>

          {/* ── Botões de download — logo abaixo do subtítulo ── */}
          <div className="flex flex-row gap-3 flex-wrap">
            <a
              href="https://apps.apple.com/br/app/cham%C3%B4-app/id6759582451"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-all hover:scale-105 active:scale-95 hover:opacity-90"
            >
              <AppStoreBadge />
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.chamo.app&pcampaignid=web_share"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-all hover:scale-105 active:scale-95 hover:opacity-90"
            >
              <GooglePlayBadge />
            </a>
          </div>

          {/* Benefícios */}
          <div className="space-y-2">
            {[
              "Contrate e pague com segurança",
              "O ecossistema mais completo do mercado",
              "Profissionais verificados na sua região",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-sm md:text-base text-white/80 font-medium">{item}</span>
              </div>
            ))}
          </div>

          {/* Prova social com fotos reais */}
          <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-3 w-fit">
            <div className="flex -space-x-2">
              {AVATARS.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt="Usuário"
                  className="w-8 h-8 rounded-full border-2 border-black/50 object-cover"
                  onError={(e) => {
                    // Fallback se a foto não carregar
                    const target = e.currentTarget;
                    target.style.display = "none";
                    const next = target.nextElementSibling as HTMLElement | null;
                    if (next) next.style.display = "flex";
                  }}
                />
              ))}
            </div>
            <div>
              <div className="flex items-center gap-0.5 mb-0.5">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-3.5 h-3.5 fill-amber-400" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                ))}
                <span className="text-sm font-bold text-white ml-1">4.9</span>
              </div>
              <p className="text-[11px] text-white/50">Baseado em avaliações reais</p>
            </div>
          </div>

          {/* Explorar sem cadastro */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => navigate("/home")}
              className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
            >
              Explorar sem cadastro <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <span className="text-white/20 text-xs">·</span>
            <button
              onClick={handleWebAccess}
              className="sm:hidden flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" /> Acessar via Web
            </button>
          </div>
        </div>
      </main>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 w-full px-5 md:px-12 py-4 border-t border-white/10 flex items-center justify-between max-w-screen-xl mx-auto flex-wrap gap-2">
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
