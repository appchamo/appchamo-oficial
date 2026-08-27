import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useIAP } from "@/hooks/useIAP";
import { getProductIdForPlan } from "@/lib/iap-config";
import { Check, Loader2, ShieldCheck, Star, Crown, LogOut, Apple, RotateCcw, Building2, Sparkles } from "lucide-react";

interface PlanRow {
  id: string;
  name: string;
  price_monthly: number;
  max_calls: number;
  has_verified_badge: boolean;
  has_featured: boolean;
  has_product_catalog: boolean;
  has_job_postings: boolean;
  has_in_app_support: boolean;
  has_vip_event: boolean;
  sort_order?: number;
}

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const onlyDigits = (s: string) => s.replace(/\D/g, "");

const formatCard = (v: string) =>
  onlyDigits(v).slice(0, 16).replace(/(.{4})/g, "$1 ").trim();

const formatExpiry = (v: string) => {
  const d = onlyDigits(v).slice(0, 4);
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

const featuresOf = (p: PlanRow): string[] => {
  const f: string[] = [];
  f.push(p.max_calls === -1 ? "Pedidos ilimitados" : `${p.max_calls} pedidos/mês`);
  if (p.has_verified_badge) f.push("Selo verificado");
  if (p.has_featured) f.push("Destaque nas buscas");
  if (p.has_product_catalog) f.push("Catálogo de produtos");
  if (p.has_job_postings) f.push("Publicar vagas");
  if (p.has_in_app_support) f.push("Suporte no app");
  if (p.has_vip_event) f.push("Eventos VIP");
  return f;
};

// Planos oferecidos no paywall + qual tem 1º mês grátis (Pro e VIP).
const PLAN_ORDER: Record<string, number> = { pro: 0, vip: 1, business: 2 };
const TRIAL_PLAN_IDS = new Set(["pro", "vip"]);
const RECOMMENDED_ID = "pro";
const planMeta = (id: string) =>
  id === "vip"
    ? { Icon: Crown, accent: "text-amber-500" }
    : id === "business"
    ? { Icon: Building2, accent: "text-violet-600" }
    : { Icon: Star, accent: "text-primary" };

export default function PlanPaywall() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const iap = useIAP();

  // No iOS a assinatura digital TEM que passar pela App Store (Apple IAP).
  // No Android/web usamos cartão (Asaas), como no resto do app.
  const useStoreIAP = Capacitor.getPlatform() === "ios" && iap.isIAPAvailable;

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  // "returning" = já teve plano pago (agora suspenso/vencido): regulariza sem novo mês grátis. (só cartão)
  const [returning, setReturning] = useState(false);
  const [card, setCard] = useState({ number: "", name: "", expiry: "", cvv: "", cpf: "", cep: "", addressNumber: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from("plans").select("*").order("sort_order");
        const list = ((data as PlanRow[]) || [])
          .filter((p) => p.id === "pro" || p.id === "vip" || p.id === "business")
          .sort((a, b) => (PLAN_ORDER[a.id] ?? 9) - (PLAN_ORDER[b.id] ?? 9));
        if (!cancelled) {
          setPlans(list);
          setSelected(list.find((p) => p.id === "pro")?.id || list[0]?.id || null);
        }
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // iOS: carrega os produtos da App Store (preço e disponibilidade vêm da loja).
  useEffect(() => {
    if (useStoreIAP) iap.loadProducts().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useStoreIAP]);

  // Pré-preenche cartão (Android/web) e detecta plano suspenso.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("address_zip, address_number, full_name, cpf")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setCard((c) => ({
          ...c,
          cep: c.cep || onlyDigits(String((data as any).address_zip || "")),
          addressNumber: c.addressNumber || String((data as any).address_number || ""),
          name: c.name || String((data as any).full_name || ""),
          cpf: c.cpf || onlyDigits(String((data as any).cpf || "")),
        }));
      }
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_id, status")
        .eq("user_id", user.id)
        .maybeSingle();
      const planId = String((sub as any)?.plan_id || "");
      const status = String((sub as any)?.status || "").toLowerCase();
      if (planId && planId !== "free" && status !== "active") {
        setReturning(true);
        setSelected((cur) => cur || planId);
      }
    })();
  }, [user]);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === selected) || null, [plans, selected]);
  const selectedHasTrial = selectedPlan ? TRIAL_PLAN_IDS.has(selectedPlan.id) : false;

  // Preço a exibir: no iOS usa o preço da App Store (exigência Apple); senão o do banco.
  const priceLabel = (p: PlanRow): string => {
    if (useStoreIAP) {
      const pid = getProductIdForPlan(p.id, "monthly");
      const prod = iap.products.find((x) => x.identifier === pid);
      if (prod?.priceString) return prod.priceString;
    }
    return brl(p.price_monthly);
  };

  // ─── iOS: assina via App Store ───────────────────────────────────────────
  const handleIapSubscribe = async () => {
    if (!user || !selectedPlan) return;
    setProcessing(true);
    try {
      const result = await iap.purchase(selectedPlan.id as "pro" | "vip" | "business", "monthly");
      if (!result) {
        // Cancelou o diálogo da Apple OU já é assinante → tenta restaurar
        setProcessing(false);
        await handleRestore();
        return;
      }
      if (Capacitor.getPlatform() === "ios") {
        if (result.isActive === false && result.subscriptionState !== "subscribed") {
          throw new Error("A App Store não confirmou uma assinatura ativa. Toque em «Restaurar compras».");
        }
        if (result.subscriptionState === "expired" || result.subscriptionState === "revoked") {
          throw new Error("Esta assinatura está expirada ou revogada na App Store.");
        }
        // StoreKit 2 às vezes não devolve o "receipt" legado — nesse caso usamos
        // a transação assinada (jwsRepresentation). Só falha se não vier nenhum dos dois.
        if (!result.receipt?.trim() && !result.jwsRepresentation?.trim() && !result.transactionId?.trim()) {
          throw new Error("Não foi possível ler o comprovante. Feche o app, abra de novo e toque em «Restaurar compras».");
        }
      }
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        session = refreshed;
      }
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await supabase.functions.invoke("validate_iap_subscription", {
        body: {
          userId: session.user.id,
          planId: result.planId,
          transactionId: result.transactionId,
          productIdentifier: result.productIdentifier,
          receipt: result.receipt ?? undefined,
          jwsRepresentation: result.jwsRepresentation ?? undefined,
          platform: result.platform,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error || (res.data as any)?.error) {
        throw new Error((res.data as any)?.error || "Erro ao ativar a assinatura.");
      }

      await supabase.from("profiles").update({ user_type: selectedPlan.id === "business" ? "company" : "professional" }).eq("user_id", user.id);
      toast({ title: "Plano ativado! 🚀", description: "Sua assinatura foi confirmada pela App Store." });
      window.location.assign("/home");
    } catch (err: any) {
      toast({ title: err?.message || "Erro na compra", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (!user) return;
    setProcessing(true);
    try {
      const results = await iap.restore();
      if (!results.length) {
        toast({ title: "Nenhuma compra encontrada para restaurar.", variant: "destructive" });
        return;
      }
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        session = refreshed;
      }
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const rank = (id: string) => (id === "business" ? 3 : id === "vip" ? 2 : 1);
      const best = [...results].sort((a, b) => rank(a.planId) - rank(b.planId)).pop();
      if (!best) return;

      const res = await supabase.functions.invoke("validate_iap_subscription", {
        body: {
          userId: session.user.id,
          planId: best.planId,
          transactionId: best.transactionId,
          productIdentifier: best.productIdentifier,
          receipt: best.receipt ?? undefined,
          jwsRepresentation: (best as any).jwsRepresentation ?? undefined,
          platform: best.platform,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.error && !(res.data as any)?.error) {
        await supabase.from("profiles").update({ user_type: best.planId === "business" ? "company" : "professional" }).eq("user_id", user.id);
        toast({ title: "Compras restauradas!", description: `Plano ${best.planId} ativado.` });
        window.location.assign("/home");
      } else {
        throw new Error((res.data as any)?.error || "Não foi possível restaurar.");
      }
    } catch (err: any) {
      toast({ title: err?.message || "Erro ao restaurar", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // ─── Android/web: assina via cartão (Asaas) ──────────────────────────────
  const handleCardSubscribe = async () => {
    if (!user || !selectedPlan) return;
    if (!card.number || !card.name || !card.expiry || !card.cvv) {
      toast({ title: "Preencha os dados do cartão", variant: "destructive" });
      return;
    }
    if (onlyDigits(card.number).length < 16) {
      toast({ title: "Número do cartão inválido", variant: "destructive" });
      return;
    }
    if (onlyDigits(card.cpf).length < 11) {
      toast({ title: "CPF do titular obrigatório", variant: "destructive" });
      return;
    }
    if (onlyDigits(card.cep).length !== 8 || !card.addressNumber.trim()) {
      toast({ title: "Informe CEP (8 dígitos) e número do endereço", variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        session = refreshed;
      }
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const { data: prof } = await supabase
        .from("profiles")
        .select("email, phone, cpf, cnpj")
        .eq("user_id", user.id)
        .maybeSingle();

      const expiryParts = card.expiry.split("/");
      const res = await supabase.functions.invoke("create_subscription", {
        body: {
          userId: user.id,
          planId: selectedPlan.id,
          value: Number(selectedPlan.price_monthly) || 0,
          firstMonthFree: !returning && selectedHasTrial,
          holderName: card.name,
          number: onlyDigits(card.number),
          expiryMonth: expiryParts[0],
          expiryYear: `20${expiryParts[1] || ""}`,
          ccv: card.cvv,
          email: (prof as any)?.email || session.user.email || "",
          cpfCnpj: onlyDigits(card.cpf) || onlyDigits(String((prof as any)?.cpf || "")),
          postalCode: onlyDigits(card.cep),
          addressNumber: card.addressNumber.trim(),
          phone: (prof as any)?.phone || "",
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const apiErr = (res.data as any)?.error;
      if (res.error || apiErr) {
        const msg = typeof apiErr === "string" ? apiErr : apiErr ? JSON.stringify(apiErr) : res.error?.message;
        throw new Error(msg || "Não foi possível processar o cartão.");
      }

      toast({
        title: "Plano ativado! 🚀",
        description: returning ? "Pagamento confirmado. Seu plano voltou a funcionar." : "1º mês grátis. A cobrança começa daqui 30 dias.",
      });
      window.location.assign("/home");
    } catch (err: any) {
      toast({ title: err?.message || "Erro ao processar assinatura", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-secondary">
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <div className="mb-6 text-center">
          <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">
            {returning && !useStoreIAP ? "Regularize seu plano" : "Escolha seu plano"}
          </h1>
          {returning && !useStoreIAP ? (
            <p className="mx-auto mt-2 max-w-[19rem] text-sm leading-snug text-muted-foreground [text-wrap:pretty]">
              Seu pagamento não foi confirmado e o plano está suspenso. Atualize o cartão para reativar agora.
            </p>
          ) : (
            <>
              <p className="mx-auto mt-2 max-w-[19rem] text-sm leading-snug text-muted-foreground [text-wrap:pretty]">
                Pra atender clientes no Chamô, você precisa de um plano ativo.
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> 1º mês grátis no Pro e no VIP
              </span>
            </>
          )}
        </div>

        {loadingPlans ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {plans.map((p) => {
                const isSel = selected === p.id;
                const { Icon, accent } = planMeta(p.id);
                const hasTrial = TRIAL_PLAN_IDS.has(p.id);
                const isRecommended = p.id === RECOMMENDED_ID;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p.id)}
                    aria-pressed={isSel}
                    className={`relative w-full rounded-2xl border p-4 pt-5 text-left transition-all ${
                      isSel
                        ? "border-primary bg-primary/[0.04] ring-2 ring-primary shadow-sm"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    {isRecommended && (
                      <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow">
                        Mais escolhido
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                            isSel ? "bg-primary/10" : "bg-muted"
                          }`}
                        >
                          <Icon className={`h-5 w-5 ${accent}`} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-foreground">{p.name}</span>
                            {/* radio visual */}
                            <span
                              className={`ml-0.5 flex h-4 w-4 items-center justify-center rounded-full border ${
                                isSel ? "border-primary bg-primary" : "border-muted-foreground/40"
                              }`}
                            >
                              {isSel && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
                            </span>
                          </div>
                          {hasTrial && (
                            <span className="mt-0.5 inline-block rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                              1º mês grátis
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-extrabold leading-none text-foreground">{priceLabel(p)}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">/mês</div>
                      </div>
                    </div>
                    <ul className="mt-3 grid grid-cols-1 gap-1.5">
                      {featuresOf(p).map((f) => (
                        <li key={f} className="flex items-center gap-1.5 text-xs text-foreground/80">
                          <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" /> {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {useStoreIAP ? (
              // ─── iOS: App Store ───
              <>
                <button
                  type="button"
                  disabled={processing || !selectedPlan}
                  onClick={handleIapSubscribe}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-base font-bold text-primary-foreground shadow-md active:scale-[0.99] disabled:opacity-60"
                >
                  {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Apple className="h-5 w-5" />}
                  {processing
                    ? "Processando..."
                    : selectedPlan
                    ? selectedHasTrial
                      ? `Assinar ${selectedPlan.name} — 1º mês grátis`
                      : `Assinar ${selectedPlan.name}`
                    : "Assinar"}
                </button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Assinatura, teste grátis e renovação gerenciados pela App Store. Cancele em Ajustes → Assinaturas.
                </p>
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleRestore}
                  className="mx-auto mt-3 flex items-center gap-1.5 text-xs font-medium text-primary disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar compras
                </button>
              </>
            ) : (
              // ─── Android / Web: cartão ───
              <>
                <div className="mt-5 rounded-2xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Dados do cartão
                  </div>
                  <div className="space-y-3">
                    <input
                      inputMode="numeric"
                      placeholder="Número do cartão"
                      value={card.number}
                      onChange={(e) => setCard({ ...card, number: formatCard(e.target.value) })}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                    <input
                      placeholder="Nome impresso no cartão"
                      value={card.name}
                      onChange={(e) => setCard({ ...card, name: e.target.value })}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        inputMode="numeric"
                        placeholder="Validade MM/AA"
                        value={card.expiry}
                        onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        inputMode="numeric"
                        placeholder="CVV"
                        value={card.cvv}
                        onChange={(e) => setCard({ ...card, cvv: onlyDigits(e.target.value).slice(0, 4) })}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <input
                      inputMode="numeric"
                      placeholder="CPF do titular"
                      value={card.cpf}
                      onChange={(e) => setCard({ ...card, cpf: onlyDigits(e.target.value).slice(0, 11) })}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        inputMode="numeric"
                        placeholder="CEP"
                        value={card.cep}
                        onChange={(e) => setCard({ ...card, cep: onlyDigits(e.target.value).slice(0, 8) })}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        inputMode="numeric"
                        placeholder="Nº endereço"
                        value={card.addressNumber}
                        onChange={(e) => setCard({ ...card, addressNumber: e.target.value })}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={processing || !selectedPlan}
                  onClick={handleCardSubscribe}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-base font-bold text-primary-foreground shadow-md active:scale-[0.99] disabled:opacity-60"
                >
                  {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  {processing
                    ? "Processando..."
                    : returning
                    ? selectedPlan
                      ? `Pagar e reativar — ${brl(selectedPlan.price_monthly)}`
                      : "Pagar e reativar"
                    : selectedPlan
                    ? selectedHasTrial
                      ? `Ativar ${selectedPlan.name} — 1º mês grátis`
                      : `Ativar ${selectedPlan.name}`
                    : "Ativar plano"}
                </button>

                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  {returning
                    ? `Cobrança de ${selectedPlan ? brl(selectedPlan.price_monthly) : ""} agora. Depois, mensal. Cancele quando quiser no app.`
                    : selectedHasTrial
                    ? `Sem cobrança nos primeiros 30 dias. Depois ${selectedPlan ? brl(selectedPlan.price_monthly) : ""}/mês. Cancele quando quiser no app.`
                    : `Cobrança de ${selectedPlan ? brl(selectedPlan.price_monthly) : ""}/mês. Cancele quando quiser no app.`}
                </p>
              </>
            )}

            <button
              type="button"
              onClick={logout}
              className="mx-auto mt-5 flex items-center gap-1.5 text-xs text-muted-foreground underline"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair da conta
            </button>
          </>
        )}
      </div>
    </div>
  );
}
