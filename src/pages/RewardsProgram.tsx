import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Gift, Copy, Loader2, Ticket, Percent, Sparkles, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { buildInviteShareMessage, buildSignupInviteUrl, buildSignupProInviteUrl } from "@/lib/referralInvite";
import { cn } from "@/lib/utils";

const RewardsProgram = () => {
  const { user, profile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setCode(null);
      return;
    }

    const cached = profile?.invite_code?.trim();
    if (cached) {
      setCode(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("invite_code").eq("user_id", user.id).maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        const c = (data as { invite_code?: string } | null)?.invite_code;
        setCode(c?.trim() || null);
      } catch {
        if (!cancelled) {
          toast({ title: "Não foi possível carregar seu código", variant: "destructive" });
          setCode(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.invite_code]);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copiado!` });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const inviteLinkPro = code ? buildSignupProInviteUrl(code) : "";
  const inviteLinkCliente = code ? buildSignupInviteUrl(code) : "";
  const shareMessage = code ? buildInviteShareMessage(code) : "";

  return (
    <AppLayout>
      <main className="mx-auto max-w-lg px-4 py-5 pb-28">
        {/* Hero */}
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-background to-amber-500/[0.08] px-5 py-7 shadow-lg shadow-primary/10">
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-amber-400/15 blur-3xl"
            aria-hidden
          />
          <div className="relative flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/35 ring-4 ring-primary/20">
              <Sparkles className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Indique e ganhe</h1>
            <p className="mt-2 max-w-[280px] text-sm font-medium leading-snug text-muted-foreground">
              Cada amigo no Chamô vira <span className="font-semibold text-primary">cupom no seu bolso</span>. Compartilhe e
              multiplique suas chances no sorteio.
            </p>
          </div>
        </div>

        {/* Destaque: o que você ganha */}
        <section
          className={cn(
            "relative mb-6 overflow-hidden rounded-3xl border-2 border-primary/25 bg-card p-1 shadow-xl shadow-primary/15",
            "before:pointer-events-none before:absolute before:inset-0 before:rounded-[22px] before:bg-gradient-to-br before:from-primary/5 before:to-transparent",
          )}
          aria-labelledby="rewards-heading"
        >
          <div className="relative rounded-[22px] bg-gradient-to-b from-primary/[0.07] to-transparent px-4 pb-5 pt-4">
            <div className="mb-4 flex items-center justify-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              <h2 id="rewards-heading" className="text-base font-bold text-foreground">
                O que você ganha
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div
                className={cn(
                  "group flex flex-col items-center rounded-2xl border border-primary/20 bg-background/80 px-3 py-4 text-center",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.98]",
                )}
              >
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary transition-transform group-hover:scale-110">
                  <Ticket className="h-6 w-6" strokeWidth={2.2} />
                </div>
                <span className="text-2xl font-black tabular-nums text-primary">+1</span>
                <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground">Sorteio</span>
                <span className="mt-1 text-[10px] leading-tight text-muted-foreground">Cupom extra no sorteio mensal</span>
              </div>

              <div
                className={cn(
                  "group flex flex-col items-center rounded-2xl border border-emerald-500/25 bg-background/80 px-3 py-4 text-center",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/45 hover:shadow-md active:scale-[0.98]",
                )}
              >
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 transition-transform group-hover:scale-110 dark:text-emerald-400">
                  <Percent className="h-6 w-6" strokeWidth={2.2} />
                </div>
                <span className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">+1</span>
                <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground">Desconto</span>
                <span className="mt-1 text-[10px] leading-tight text-muted-foreground">Para usar no app</span>
              </div>
            </div>

            <p className="mx-auto mt-4 max-w-[320px] text-center text-sm font-medium leading-relaxed text-foreground">
              Sempre que alguém <strong className="text-primary">concluir o cadastro</strong> com seu código válido, você
              recebe <strong>1 cupom extra para o sorteio</strong> e <strong>1 cupom de desconto</strong> para usar no
              Chamô. Tudo em <strong>Meus cupons</strong>.
            </p>
            <p className="mx-auto mt-2 max-w-[300px] text-center text-xs text-muted-foreground">
              Quem entra com seu convite também aproveita benefícios na hora — todo mundo sai ganhando.
            </p>
          </div>
        </section>

        {/* Código + ações */}
        <div className="rounded-2xl border bg-card p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seu código de convite</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vale para <strong className="font-semibold text-foreground">cliente</strong> ou{" "}
            <strong className="font-semibold text-foreground">profissional</strong> — por link ou digitando no cadastro.
          </p>

          {loading ? (
            <div className="mt-6 flex justify-center py-10">
              <Loader2 className="h-9 w-9 animate-spin text-primary" />
            </div>
          ) : code ? (
            <>
              <div className="relative mt-5 overflow-hidden rounded-2xl bg-gradient-to-r from-muted/80 to-muted/40 p-[1px]">
                <div className="rounded-2xl bg-card px-4 py-6 text-center">
                  <span className="font-mono text-[1.65rem] font-black tracking-[0.18em] text-primary sm:text-3xl">{code}</span>
                </div>
              </div>

              <Button
                type="button"
                size="lg"
                className="mt-4 h-12 w-full rounded-2xl text-base font-bold shadow-md shadow-primary/25 transition-transform active:scale-[0.98]"
                onClick={() => copyText("Código", code)}
              >
                <Copy className="mr-2 h-5 w-5" />
                Copiar código
              </Button>

              <div className="mt-8 border-t border-border/80 pt-6">
                <div className="mb-3 flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-primary" />
                  <p className="text-sm font-bold text-foreground">Mensagem pronta para compartilhar</p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Links de cadastro (cliente e profissional), seu código e um texto curto — pronto para colar no WhatsApp.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="mt-4 h-12 w-full rounded-2xl border-2 border-primary/25 bg-background text-base font-bold text-foreground hover:bg-primary/5 active:scale-[0.98]"
                  onClick={() => copyText("Mensagem para compartilhar", shareMessage)}
                >
                  <Copy className="mr-2 h-5 w-5 text-primary" />
                  Copiar mensagem
                </Button>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Inclui {inviteLinkPro.split("?")[0]} (profissional), {inviteLinkCliente.split("?")[0]} (cliente) e o código.
                </p>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Código indisponível. Tente atualizar o app ou fale com o suporte.</p>
          )}
        </div>
      </main>
    </AppLayout>
  );
};

export default RewardsProgram;
