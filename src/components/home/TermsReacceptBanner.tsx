/**
 * Banner de re-aceite de Termos/Privacidade.
 *
 * Fluxo:
 *  1. Busca versão vigente em `platform_settings`
 *     - cliente        → terms_version
 *     - profissional   → terms_version_professional
 *  2. Se `profile.accepted_terms_version` já existe e é diferente da
 *     versão vigente, mostra um card destacado no topo da Home.
 *  3. "Ler e aceitar"  → dialog com os textos atuais + 2 botões:
 *       · "Aceitar os novos termos" — grava accepted_terms_version +
 *         accepted_terms_at no profile e fecha o dialog.
 *       · "Recusar" — abre dialog secundário explicando que para seguir
 *         sem aceitar é preciso excluir a conta; botão "Excluir conta"
 *         chama edge function `admin-manage` (action: delete_own_account).
 *
 *  O banner some automaticamente quando as versões passam a ser iguais.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { clearLocalChamoSession } from "@/lib/localChamoSessionClear";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SettingsMap = Record<string, string>;

const SETTINGS_KEYS = [
  "terms_version",
  "terms_version_professional",
  "terms_of_use",
  "terms_of_use_professional",
  "privacy_policy",
  "privacy_policy_professional",
];

function parseValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value).replace(/^"|"$/g, "");
  } catch {
    return String(value);
  }
}

export default function TermsReacceptBanner() {
  const { user, profile, refreshProfile } = useAuth();
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [open, setOpen] = useState(false);
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isPro = profile?.user_type === "professional" || profile?.user_type === "company";

  useEffect(() => {
    if (!user?.id || !profile) {
      setSettings(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", SETTINGS_KEYS);
      if (cancelled || !data) return;
      const map: SettingsMap = {};
      for (const row of data) map[row.key] = parseValue(row.value);
      setSettings(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.accepted_terms_version, profile]);

  const currentVersion = useMemo(() => {
    if (!settings) return "";
    return (isPro ? settings.terms_version_professional : settings.terms_version) || "";
  }, [settings, isPro]);

  const termsText = useMemo(() => {
    if (!settings) return "";
    return (isPro ? settings.terms_of_use_professional : settings.terms_of_use) || "";
  }, [settings, isPro]);

  const privacyText = useMemo(() => {
    if (!settings) return "";
    return (isPro ? settings.privacy_policy_professional : settings.privacy_policy) || "";
  }, [settings, isPro]);

  const acceptedVersion = (profile?.accepted_terms_version || "").trim();
  // Mostra o banner se o usuário já concluiu o cadastro (signup_completed_at) e:
  //  - a versão aceita difere da versão vigente (versão antiga), ou
  //  - o aceite foi explicitamente invalidado pelo admin (accepted_terms_version = null).
  const needsReaccept =
    !!user?.id &&
    !!profile &&
    !!profile.signup_completed_at &&
    !!currentVersion &&
    acceptedVersion !== currentVersion;

  if (!needsReaccept) return null;

  const handleAccept = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          accepted_terms_version: currentVersion,
          accepted_terms_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Novos termos aceitos!", description: "Obrigado por continuar com a gente." });
      setOpen(false);
      void refreshProfile?.(user.id);
    } catch (e: any) {
      toast({
        title: "Erro ao registrar o aceite",
        description: e?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke("admin-manage", {
        body: { action: "delete_own_account" },
      });
      if (res.error) {
        const body = res.data as { error?: string } | null;
        if (body?.error) throw new Error(body.error);
        throw res.error;
      }
      await clearLocalChamoSession();
      toast({ title: "Conta excluída", description: "Até logo!" });
      window.location.replace("/");
    } catch (e: any) {
      toast({
        title: "Erro ao excluir conta",
        description: e?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative w-full overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-50 via-amber-100/60 to-white text-left shadow-md shadow-amber-500/15 active:scale-[0.995] transition-transform dark:from-amber-950/40 dark:via-amber-900/20 dark:to-zinc-900"
        aria-label="Os termos e a política foram atualizados. Tocar para revisar e aceitar."
      >
        <div className="relative flex items-start gap-3 px-4 py-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/90 text-white shadow-sm">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-extrabold text-amber-900 dark:text-amber-100 leading-tight">
              Atualizamos nossos Termos e Política
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-amber-800/90 dark:text-amber-100/90">
              Para continuar usando o Chamô, leia e aceite a nova versão.
            </p>
          </div>
          <span className="self-center rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-sm shrink-0">
            Ação
          </span>
        </div>
      </button>

      {/* Dialog com texto e botões Aceitar/Recusar */}
      <Dialog open={open} onOpenChange={(v) => !saving && setOpen(v)}>
        <DialogContent className="max-w-lg max-h-[88vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              Novos Termos de Uso e Política
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Versão {currentVersion}. Leia com atenção antes de continuar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <section>
              <h3 className="text-sm font-bold text-foreground mb-2">Termos de Uso</h3>
              <div className="text-[13px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {termsText || "Termos de uso não configurados."}
              </div>
            </section>
            <section>
              <h3 className="text-sm font-bold text-foreground mb-2">Política de Privacidade</h3>
              <div className="text-[13px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {privacyText || "Política de privacidade não configurada."}
              </div>
            </section>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Você pode excluir sua conta a qualquer momento em{" "}
              <span className="font-semibold text-foreground">Perfil → Excluir minha conta</span>.
              Ao excluir, os aceites, histórico e dados pessoais são encerrados.
            </p>
          </div>

          <div className="flex flex-col gap-2 px-5 py-4 border-t bg-card">
            <button
              type="button"
              onClick={handleAccept}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Registrando..." : "Aceitar os novos termos"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setRefuseOpen(true);
              }}
              disabled={saving}
              className="inline-flex items-center justify-center w-full rounded-xl border border-border py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              Recusar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de recusa → precisa excluir a conta */}
      <Dialog open={refuseOpen} onOpenChange={(v) => !deleting && setRefuseOpen(v)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4 shrink-0" />
              Ao recusar os termos
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirmação de exclusão de conta após recusa dos termos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-foreground leading-relaxed">
              Para usar o Chamô é necessário concordar com os Termos e a Política vigentes. Se você
              não quiser aceitar, <strong>precisa excluir sua conta</strong>.
            </p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              A exclusão é definitiva: perfil, aceites, mensagens e pagamentos vinculados serão
              encerrados. Obrigações legais de retenção podem permanecer conforme a LGPD.
            </p>
          </div>
          <div className="flex flex-col gap-2 mt-3">
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-destructive py-3 text-sm font-bold text-destructive-foreground shadow-md active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? "Excluindo..." : "Excluir minha conta"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRefuseOpen(false);
                setOpen(true);
              }}
              disabled={deleting}
              className="inline-flex items-center justify-center w-full rounded-xl border border-border py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              Voltar e reler
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
