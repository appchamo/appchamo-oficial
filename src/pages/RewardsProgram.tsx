import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Gift, Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { buildInviteShareMessage, buildSignupProInviteUrl } from "@/lib/referralInvite";

const RewardsProgram = () => {
  const { user, profile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Não chamar refreshProfile aqui: no AuthProvider ela não é memoizada e mudava a cada render,
  // recriando o efeito → loop infinito (tela piscando).
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

  const inviteLink = code ? buildSignupProInviteUrl(code) : "";
  const shareMessage = code ? buildInviteShareMessage(code) : "";

  return (
    <AppLayout>
      <main className="mx-auto max-w-lg px-4 py-5 pb-24">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Programa de recompensas</h1>
            <p className="text-sm text-muted-foreground">Indique profissionais e ganhe comissão na assinatura deles.</p>
          </div>
        </div>

        <Tabs defaultValue="indique" className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="indique" className="text-sm font-semibold">
              Indique e ganhe
            </TabsTrigger>
          </TabsList>
          <TabsContent value="indique" className="mt-4 space-y-6 outline-none">
            <div className="rounded-2xl border bg-card p-5 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seu código de convite</p>
              <p className="mt-1 text-sm text-muted-foreground">Único para sua conta. Compartilhe com quem vai se cadastrar como profissional.</p>

              {loading ? (
                <div className="mt-6 flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : code ? (
                <>
                  <div className="mt-5 rounded-xl bg-muted/60 px-4 py-5 text-center">
                    <span className="font-mono text-3xl font-black tracking-[0.2em] text-primary">{code}</span>
                  </div>
                  <Button
                    type="button"
                    className="mt-4 w-full rounded-xl font-semibold"
                    onClick={() => copyText("Código", code)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar código
                  </Button>

                  <div className="mt-8 border-t pt-6">
                    <p className="text-sm font-semibold text-foreground">Convite com link e mensagem</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Envie um link já com seu código para a pessoa — ao copiar, vem um texto pronto para colar no WhatsApp ou em qualquer app.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-4 w-full rounded-xl font-semibold border border-border"
                      onClick={() => copyText("Mensagem de convite", shareMessage)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar link de convite
                    </Button>
                    <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                      Inclui o link {inviteLink.split("?")[0]} com seu código e uma sugestão de mensagem.
                    </p>
                  </div>

                  <div className="mt-6 rounded-xl bg-primary/5 p-4 text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Como funciona:</strong> quando alguém usar seu código ao se cadastrar como profissional e, depois,
                    assinar um plano pago pela <strong className="text-foreground">primeira vez</strong>, você recebe <strong className="text-primary">5%</strong> do valor
                    dessa cobrança na sua carteira (é pago só uma vez por pessoa indicada). O valor entra como{" "}
                    <strong className="text-foreground">a receber</strong> e libera para repasse após{" "}
                    <strong className="text-foreground">7 dias</strong>, desde que você tenha perfil profissional ativo.
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Código indisponível. Tente atualizar o app ou entre em contato com o suporte.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
};

export default RewardsProgram;
