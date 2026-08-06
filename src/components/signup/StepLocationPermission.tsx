import { useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { getDeviceLocation } from "@/lib/deviceLocation";

type Props = {
  /** Chamado após a decisão do usuário. granted=true traz as coordenadas do aparelho. */
  onDone: (granted: boolean, coords?: { lat: number; lng: number }) => void;
  onExitToLogin: () => void | Promise<void>;
};

/**
 * Tela de boas-vindas pedindo a localização (inspirada no onboarding do iFood).
 * Ao tocar em "Permitir localização" dispara o pedido de permissão do aparelho.
 * - Permitiu  → segue com as coordenadas (não pede CEP no cadastro).
 * - Negou/falhou → segue mesmo assim (o cadastro vai pedir o CEP).
 */
export default function StepLocationPermission({ onDone, onExitToLogin }: Props) {
  const [loading, setLoading] = useState(false);

  const handleAllow = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const loc = await getDeviceLocation();
      if (loc.ok) onDone(true, { lat: loc.lat, lng: loc.lng });
      else onDone(false);
    } catch {
      onDone(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px)+0.75rem)]">
      <div className="w-full max-w-sm flex-1 flex flex-col">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-extrabold text-gradient">Chamô</h1>
        </div>

        {/* Ilustração simples (cartão de profissional em destaque) */}
        <div className="mt-6 mb-2">
          <div className="rounded-2xl border bg-card shadow-card p-4 opacity-90">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="h-3 w-2/3 rounded bg-muted mb-2" />
                <div className="h-2.5 w-1/2 rounded bg-muted/70" />
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <h2 className="text-2xl font-extrabold text-foreground mb-2">Permitir localização</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Para encontrar profissionais e serviços disponíveis na sua região.
          </p>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => void handleAllow()}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Obtendo localização…
            </>
          ) : (
            "Permitir localização"
          )}
        </button>

        <button
          type="button"
          onClick={() => onDone(false)}
          disabled={loading}
          className="w-full mt-2 py-2.5 text-sm text-muted-foreground font-medium disabled:opacity-60"
        >
          Agora não
        </button>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Já tem uma conta?{" "}
          <button
            type="button"
            onClick={() => void onExitToLogin()}
            className="text-primary font-bold hover:underline bg-transparent border-none cursor-pointer p-0"
          >
            Entrar
          </button>
        </p>
      </div>
    </div>
  );
}
