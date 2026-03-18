import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

/** Modal de um único termo (Uso ou Privacidade): texto rolável; só habilita "Aceitar" quando rolar até o fim. */
const TermsScrollModal = ({
  open,
  onClose,
  onAccept,
  title,
  content,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  title: string;
  content: string;
  loading: boolean;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 30;
    setScrolledToBottom(isAtBottom);
  }, []);

  useEffect(() => {
    if (!open) setScrolledToBottom(false);
  }, [open]);

  useEffect(() => {
    if (!open || loading || !content) return;
    const t = setTimeout(() => checkScroll(), 100);
    return () => clearTimeout(t);
  }, [open, loading, content, checkScroll]);

  const handleAcceptClick = () => {
    if (!scrolledToBottom) {
      toast({ title: "Leia por completo os termos antes de aceitar.", variant: "destructive" });
      return;
    }
    onAccept();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={checkScroll}
              className="flex-1 min-h-[200px] max-h-[50vh] overflow-y-auto border rounded-xl px-3 py-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
            >
              {content || "Nenhum texto cadastrado."}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Arraste até o final para habilitar o botão Aceitar.</p>
            <button
              type="button"
              onClick={handleAcceptClick}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors mt-2 ${
                scrolledToBottom
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              Aceitar
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

type TermsVariant = "client" | "professional";

export const TermsDialogFromAdmin = ({
  open,
  onClose,
  onAccept,
  variant = "client",
}: {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  variant?: TermsVariant;
}) => {
  const [termsOfUse, setTermsOfUse] = useState("");
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [step, setStep] = useState<"use" | "privacy" | null>(null);

  useEffect(() => {
    if (!open) return;
    const isPro = variant === "professional";
    const keys = isPro
      ? ["terms_of_use_professional", "privacy_policy_professional"]
      : ["terms_of_use", "privacy_policy"];
    setStep("use");
    setTermsOfUse("");
    setPrivacyPolicy("");
    setLoadingTerms(true);
    supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", keys)
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar termos (platform_settings):", error);
          setLoadingTerms(false);
          return;
        }
        if (data && data.length > 0) {
          const parseVal = (v: unknown): string => {
            if (v == null) return "";
            if (typeof v === "string") return v;
            const str = JSON.stringify(v);
            return str.replace(/^"|"$/g, "");
          };
          for (const s of data) {
            const val = parseVal(s.value);
            if (s.key === (isPro ? "terms_of_use_professional" : "terms_of_use")) setTermsOfUse(val);
            if (s.key === (isPro ? "privacy_policy_professional" : "privacy_policy")) setPrivacyPolicy(val);
          }
        }
        setLoadingTerms(false);
      });
  }, [open, variant]);

  const handleAcceptUse = () => {
    if (privacyPolicy && privacyPolicy.trim()) {
      setStep("privacy");
    } else {
      onAccept();
      onClose();
    }
  };

  const handleAcceptPrivacy = () => {
    onAccept();
    onClose();
  };

  const openUse = open && step === "use";
  const openPrivacy = open && step === "privacy";

  return (
    <>
      <TermsScrollModal
        open={openUse}
        onClose={onClose}
        onAccept={handleAcceptUse}
        title="Termos de Uso"
        content={termsOfUse}
        loading={loadingTerms}
      />
      <TermsScrollModal
        open={openPrivacy}
        onClose={onClose}
        onAccept={handleAcceptPrivacy}
        title="Política de Privacidade (LGPD)"
        content={privacyPolicy}
        loading={false}
      />
    </>
  );
};
