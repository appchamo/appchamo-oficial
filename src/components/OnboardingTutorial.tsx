import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMenu } from "@/contexts/MenuContext";
import { Button } from "@/components/ui/button";
import { Menu, LayoutGrid, Ticket, HelpCircle, Sparkles, ArrowLeft, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "chamo_onboarding_done";

const stepsConfig = [
  {
    id: 1,
    type: "modal" as const,
    title: "Bem-vindo ao Chamô!",
    body: "Este é nosso tutorial básico. Clique em **Próximo** para aprender a usar o app.",
    icon: Sparkles,
  },
  {
    id: 2,
    type: "spotlight" as const,
    target: "bottom-nav",
    title: "Barra de navegação",
    body: "Aqui você navega entre **Início**, **Buscar**, **Chat**, **Notificações** e **Perfil**.",
    icon: LayoutGrid,
  },
  {
    id: 3,
    type: "spotlight" as const,
    target: "menu-button",
    title: "Menu",
    body: "Toque nos **três pontinhos** para abrir o menu lateral com mais opções.",
    icon: Menu,
  },
  {
    id: 4,
    type: "modal" as const,
    title: "Menu lateral",
    body: "Aqui estão as abas do menu: **Início**, **Buscar**, **Categorias**, **Meus Cupons**, **Suporte** e muito mais.",
    icon: Menu,
  },
  {
    id: 5,
    type: "spotlight" as const,
    target: "tornar-se-pro",
    title: "Tornar-se Profissional",
    body: "Quer trabalhar com a gente? Toque em **Tornar-se Profissional** para se cadastrar.",
    icon: null,
    clientOnly: false,
  },
  {
    id: 6,
    type: "modal" as const,
    title: "Meus cupons",
    body: "Use **códigos promocionais** para ganhar benefícios e descontos em serviços. Acesse pelo menu em **Meus Cupons**.",
    icon: Ticket,
  },
  {
    id: 7,
    type: "modal" as const,
    title: "Suporte",
    body: "Precisou de ajuda? Abra o **menu** (três pontinhos) e toque em **Suporte** para falar conosco.",
    icon: HelpCircle,
  },
  {
    id: 8,
    type: "modal" as const,
    title: "Tudo pronto!",
    body: "Você já pode explorar o app. Bom uso!",
    icon: Sparkles,
  },
];

function parseBody(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export function OnboardingTutorial() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { openMenu, closeMenu } = useMenu();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(1);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  const isClient = profile?.user_type === "client";

  const stepsToShow = stepsConfig.filter((s) => {
    if (s.clientOnly && !isClient) return false;
    return true;
  });
  const totalSteps = stepsToShow.length;
  const currentStepConfig = stepsToShow.find((s) => s.id === step) ?? stepsToShow[0];
  const currentIndex = stepsToShow.findIndex((s) => s.id === step) + 1;

  const finishTutorial = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
      sessionStorage.removeItem("chamo_oauth_just_landed");
      localStorage.removeItem("chamo_oauth_just_landed");
      window.dispatchEvent(new CustomEvent("chamo-tutorial-dismissed"));
    } catch (_) {}
    setVisible(false);
    closeMenu();
  }, [closeMenu]);

  const goNext = useCallback(() => {
    if (currentIndex >= totalSteps) {
      finishTutorial();
      return;
    }
    const next = stepsToShow[currentIndex];
    if (next) setStep(next.id);
  }, [currentIndex, totalSteps, stepsToShow, finishTutorial]);

  const goPrev = useCallback(() => {
    if (currentIndex <= 1) return;
    const prev = stepsToShow[currentIndex - 2];
    if (prev) {
      setStep(prev.id);
      if (step === 4) closeMenu();
    }
  }, [currentIndex, stepsToShow, step, closeMenu]);

  const skip = useCallback(() => {
    finishTutorial();
  }, [finishTutorial]);

  // Show tutorial only when: user logged in and onboarding not done
  useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch (_) {}
    setVisible(true);
  }, [user]);

  // Step 4: open menu when entering; keep it open until tutorial ends (close only in finishTutorial/skip or when going back to step 3)
  useEffect(() => {
    if (!visible || step !== 4) return;
    openMenu();
  }, [visible, step, openMenu]);

  // Update spotlight rect for spotlight steps
  useEffect(() => {
    if (currentStepConfig?.type !== "spotlight" || !currentStepConfig.target) {
      setSpotlightRect(null);
      return;
    }
    if (currentStepConfig.clientOnly && !isClient) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(`[data-onboarding="${currentStepConfig.target}"]`);
    if (!el) {
      setSpotlightRect(null);
      return;
    }
    const update = () => setSpotlightRect(el.getBoundingClientRect());
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
    };
  }, [currentStepConfig?.type, currentStepConfig?.target, currentStepConfig?.clientOnly, isClient]);

  if (!visible) return null;

  const isSpotlight = currentStepConfig?.type === "spotlight" && currentStepConfig?.target;
  const isTornarSeProStep = currentStepConfig?.target === "tornar-se-pro";
  const Icon = currentStepConfig?.icon;
  const SIDEBAR_WIDTH_PX = 288; // w-72 do SideMenu

  const showBack = currentIndex > 1;
  const modalContent = (
    <div className="space-y-4 text-center">
      {Icon && (
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="w-6 h-6 text-primary" />
          </div>
        </div>
      )}
      <h2 className="text-lg font-semibold text-foreground">{currentStepConfig?.title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {currentStepConfig?.body ? parseBody(currentStepConfig.body) : null}
      </p>
      <div className="flex flex-col gap-2 pt-2">
        <Button onClick={goNext} className="w-full">
          {currentIndex >= totalSteps ? "Começar" : "Próximo"}
        </Button>
        {showBack && (
          <button
            type="button"
            onClick={goPrev}
            className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        )}
        {currentIndex < totalSteps && (
          <button
            type="button"
            onClick={skip}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Pular tutorial
          </button>
        )}
      </div>
    </div>
  );

  const overlay = (
    <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog">
      {/* Backdrop - for spotlight we use a cutout; for modal we use full dim */}
      {isSpotlight && spotlightRect ? (
        <>
          {/* Overlay: no passo "Tornar-se Profissional" não cobre a barra lateral (w-72) para ela continuar visível */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none"
            style={
              isTornarSeProStep
                ? { right: SIDEBAR_WIDTH_PX }
                : { right: 0 }
            }
          />
          {/* Cutout: div no tamanho do alvo com borda; a sombra preenche o resto */}
          <div
            className="absolute rounded-xl border-2 border-primary bg-transparent pointer-events-none"
            style={{
              left: spotlightRect.left,
              top: spotlightRect.top,
              width: spotlightRect.width,
              height: spotlightRect.height,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60" onClick={goNext} />
      )}

      {/* Card: for spotlight, position above target if it's in the bottom half (e.g. bottom nav) so it stays visible */}
      {isSpotlight && spotlightRect ? (
        <div
          className="absolute left-4 right-4 z-10 mx-auto bg-card border rounded-xl shadow-lg p-4 max-w-sm"
          style={
            spotlightRect.top + spotlightRect.height > window.innerHeight * 0.5
              ? { bottom: window.innerHeight - spotlightRect.top + 12 }
              : { top: spotlightRect.top + spotlightRect.height + 12 }
          }
        >
          {Icon && (
            <div className="flex justify-center mb-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
            </div>
          )}
          <h2 className="text-base font-semibold text-foreground text-center">
            {currentStepConfig?.title}
          </h2>
          <p className="text-sm text-muted-foreground text-center mt-1 leading-relaxed">
            {currentStepConfig?.body ? parseBody(currentStepConfig.body) : null}
          </p>
          {isTornarSeProStep && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 gap-2 mt-2"
              onClick={() => {
                closeMenu();
                finishTutorial();
                navigate("/signup-pro");
              }}
            >
              <Briefcase className="w-4 h-4" />
              Tornar-se profissional
            </Button>
          )}
          <div className="flex flex-col gap-2 mt-4">
            <Button onClick={goNext} size="sm">
              {currentIndex >= totalSteps ? "Começar" : "Próximo"}
            </Button>
            {showBack && (
              <button
                type="button"
                onClick={goPrev}
                className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar
              </button>
            )}
            <button
              type="button"
              onClick={skip}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Pular tutorial
            </button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[calc(100%-2rem)] max-w-md bg-card border rounded-xl shadow-lg p-6"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {modalContent}
        </div>
      )}

      {/* Progress dots */}
      <div className="absolute bottom-24 left-0 right-0 flex justify-center gap-1.5">
        {stepsToShow.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "w-2 h-2 rounded-full transition-colors",
              i + 1 === currentIndex ? "bg-primary" : "bg-muted-foreground/40"
            )}
          />
        ))}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

export default OnboardingTutorial;
