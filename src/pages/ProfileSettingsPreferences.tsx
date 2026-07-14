import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";

type PrefKey =
  | "whatsapp_notifications_enabled"
  | "community_notifications_enabled"
  | "updates_notifications_enabled"
  | "chat_notifications_enabled"
  | "email_notifications_enabled";

type Prefs = Record<PrefKey, boolean>;

const DEFAULT_PREFS: Prefs = {
  whatsapp_notifications_enabled: true,
  community_notifications_enabled: true,
  updates_notifications_enabled: true,
  chat_notifications_enabled: true,
  email_notifications_enabled: true,
};

const TOGGLES: { key: PrefKey; label: string; desc: string }[] = [
  { key: "whatsapp_notifications_enabled", label: "WhatsApp", desc: "Receber avisos e novidades no WhatsApp." },
  { key: "community_notifications_enabled", label: "Comunidade", desc: "Novidades e posts da comunidade." },
  { key: "updates_notifications_enabled", label: "Atualizações e novidades", desc: "Avisos sobre novidades do app." },
  { key: "chat_notifications_enabled", label: "Chat / mensagens", desc: "Avisos de novas mensagens no chat." },
  { key: "email_notifications_enabled", label: "E-mail", desc: "Receber comunicados por e-mail." },
];

const ProfileSettingsPreferences = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "whatsapp_notifications_enabled, community_notifications_enabled, updates_notifications_enabled, chat_notifications_enabled, email_notifications_enabled",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        setPrefs({
          whatsapp_notifications_enabled: (data as any).whatsapp_notifications_enabled ?? true,
          community_notifications_enabled: (data as any).community_notifications_enabled ?? true,
          updates_notifications_enabled: (data as any).updates_notifications_enabled ?? true,
          chat_notifications_enabled: (data as any).chat_notifications_enabled ?? true,
          email_notifications_enabled: (data as any).email_notifications_enabled ?? true,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleToggle = async (key: PrefKey) => {
    if (!user) return;
    const next = !prefs[key];
    const prev = prefs[key];
    // Otimista: atualiza a UI imediatamente.
    setPrefs((p) => ({ ...p, [key]: next }));
    const { error } = await supabase
      .from("profiles")
      .update({ [key]: next } as any)
      .eq("user_id", user.id);
    if (error) {
      // Reverte em caso de erro.
      setPrefs((p) => ({ ...p, [key]: prev }));
      toast({ title: "Erro ao salvar preferência", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <Link
          to="/profile/settings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Configurações
        </Link>

        <h1 className="text-xl font-bold text-foreground mb-1">Preferências de notificação</h1>
        <p className="text-sm text-muted-foreground mb-6">Escolha como você quer receber avisos e novidades do Chamô.</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-card p-2 max-w-md divide-y divide-border/60">
            {TOGGLES.map((t) => {
              const on = prefs[t.key];
              return (
                <div key={t.key} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground block">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{t.desc}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={t.label}
                    onClick={() => handleToggle(t.key)}
                    className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      on ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        on ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default ProfileSettingsPreferences;
