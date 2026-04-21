/**
 * Modal bonito de cupom de desconto do profissional.
 *
 * Usado na Home (`CouponProfessionals`) e no perfil público do profissional
 * (`ProfessionalProfile`). Centraliza o visual para um único ponto de edição.
 *
 * Fluxo:
 *   - Se `coupon` vier preenchido: mostra os detalhes.
 *   - Se `coupon` for `undefined`: carrega o melhor cupom ativo via select público
 *     em `professional_coupons` (RLS "Anyone can view active coupons").
 *   - Se `coupon` for `null`: mostra mensagem de "sem cupom disponível".
 *
 * Também observa se o cliente logado tem cupom do app ativo (tabela `coupons`,
 * `coupon_type = 'discount'`, `used = false`) para avisar que o benefício pode
 * ser somado ao cupom do profissional.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Ticket, X, ChevronRight, Sparkles, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface CouponShowcaseData {
  id: string;
  /** Label interno opcional (visível só para o profissional no painel). */
  name?: string | null;
  discount_type: "amount" | "percent";
  discount_value: number;
  min_purchase: number | null;
  max_purchase: number | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  professionalId: string;
  professionalName: string;
  /** Se não informado, o componente carrega o melhor cupom ativo do profissional. */
  coupon?: CouponShowcaseData | null;
  /** Se informado, vira um link "Ver profissional" no final. */
  professionalHref?: string;
  /** Texto do CTA final. Default "Ver profissional". */
  ctaLabel?: string;
}

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function formatCouponShort(c: CouponShowcaseData): string {
  if (c.discount_type === "percent") {
    const n = Number(c.discount_value);
    const rounded = Math.round(n * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}% OFF`;
  }
  return `${formatBRL(Number(c.discount_value))} OFF`;
}

/**
 * Busca o melhor cupom ativo aplicável do profissional. Não usa a RPC
 * `get_best_active_coupon_for_pro` porque ela exige `p_amount` (filtra por
 * min_purchase/max_purchase), e aqui o modal é apresentacional — ainda não
 * existe um valor de compra.
 */
async function fetchBestActiveCoupon(professionalId: string): Promise<CouponShowcaseData | null> {
  const { data, error } = await supabase
    .from("professional_coupons")
    .select(
      "id, name, discount_type, discount_value, min_purchase, max_purchase, max_uses, used_count, expires_at",
    )
    .eq("professional_id", professionalId)
    .eq("active", true);
  if (error) {
    console.warn("[CouponShowcaseDialog] fetch coupon failed:", error);
    return null;
  }
  const now = Date.now();
  const active = ((data ?? []) as CouponShowcaseData[]).filter((c) => {
    if (c.expires_at && new Date(c.expires_at).getTime() <= now) return false;
    if (c.max_uses != null && (c.used_count ?? 0) >= c.max_uses) return false;
    return true;
  });
  if (active.length === 0) return null;
  // "Melhor" = maior percentual primeiro; depois maior valor fixo.
  active.sort((a, b) => {
    const ap = a.discount_type === "percent" ? Number(a.discount_value) : -1;
    const bp = b.discount_type === "percent" ? Number(b.discount_value) : -1;
    if (ap !== bp) return bp - ap;
    const aa = a.discount_type === "amount" ? Number(a.discount_value) : 0;
    const ba = b.discount_type === "amount" ? Number(b.discount_value) : 0;
    return ba - aa;
  });
  return active[0];
}

/** Verifica se o cliente logado tem cupom do app ativo e ainda não usado. */
async function fetchUserAppCouponCount(userId: string): Promise<number> {
  const nowIso = new Date().toISOString();
  const { count, error } = await supabase
    .from("coupons")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("coupon_type", "discount")
    .eq("used", false)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  if (error) {
    return 0;
  }
  return count ?? 0;
}

export function CouponShowcaseDialog({
  open,
  onClose,
  professionalId,
  professionalName,
  coupon: couponProp,
  professionalHref,
  ctaLabel = "Ver profissional",
}: Props) {
  const { user } = useAuth();
  const [internalCoupon, setInternalCoupon] = useState<CouponShowcaseData | null | undefined>(
    couponProp,
  );
  const [appCouponCount, setAppCouponCount] = useState<number>(0);
  const providedExternally = couponProp !== undefined;
  const coupon = providedExternally ? couponProp : internalCoupon;

  // Carrega o melhor cupom ativo se a prop não foi informada.
  useEffect(() => {
    if (providedExternally) return;
    if (!open) return;
    let cancelled = false;
    setInternalCoupon(undefined);
    void fetchBestActiveCoupon(professionalId).then((c) => {
      if (cancelled) return;
      setInternalCoupon(c);
    });
    return () => {
      cancelled = true;
    };
  }, [open, providedExternally, professionalId]);

  useEffect(() => {
    if (!open || !user?.id) {
      setAppCouponCount(0);
      return;
    }
    let cancelled = false;
    void fetchUserAppCouponCount(user.id).then((n) => {
      if (cancelled) return;
      setAppCouponCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  const label = useMemo(() => (coupon ? formatCouponShort(coupon) : null), [coupon]);

  if (!open) return null;

  const isLoading = coupon === undefined;
  const isEmpty = coupon === null;

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
        {/* Cabeçalho laranja com o "carimbo" do cupom */}
        <div className="relative bg-gradient-to-br from-primary via-amber-500 to-primary p-5 text-white">
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] opacity-95">
            <Ticket className="w-4 h-4" /> Cupom de desconto
          </div>
          {isLoading ? (
            <div className="mt-3 h-9 w-40 rounded-md bg-white/25 animate-pulse" aria-hidden />
          ) : isEmpty ? (
            <div className="mt-3 text-xl font-black leading-tight">Nenhum cupom disponível</div>
          ) : (
            <div className="mt-2 text-3xl font-black leading-none drop-shadow-sm">{label}</div>
          )}
          <div className="mt-1 text-sm font-semibold opacity-95">com {professionalName}</div>
        </div>

        <div className="p-5 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              {isEmpty ? "Sem ofertas ativas no momento" : "Detalhes do cupom"}
            </DialogTitle>
          </DialogHeader>

          {isLoading && (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 w-full rounded bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {isEmpty && (
            <p className="text-sm text-muted-foreground leading-snug">
              Este profissional não tem cupons ativos agora. Você ainda pode falar com ele
              normalmente clicando em "Chamar".
            </p>
          )}

          {coupon && (
            <>
              <ul className="text-sm text-foreground space-y-2.5">
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Tipo do desconto</span>
                  <span className="font-semibold">
                    {coupon.discount_type === "percent" ? "Porcentagem" : "Valor fixo"}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-semibold">
                    {coupon.discount_type === "percent"
                      ? `${Number(coupon.discount_value)}%`
                      : formatBRL(Number(coupon.discount_value))}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Compra mínima</span>
                  <span className="font-semibold">
                    {coupon.min_purchase != null
                      ? formatBRL(Number(coupon.min_purchase))
                      : "Sem mínimo"}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Compra máxima</span>
                  <span className="font-semibold">
                    {coupon.max_purchase != null
                      ? formatBRL(Number(coupon.max_purchase))
                      : "Sem teto"}
                  </span>
                </li>
                {coupon.expires_at && (
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Validade</span>
                    <span className="font-semibold">
                      {new Date(coupon.expires_at).toLocaleDateString("pt-BR")}
                    </span>
                  </li>
                )}
              </ul>

              {/* "Como usar" — guia curto do cliente */}
              <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  <Sparkles className="w-3.5 h-3.5" /> Como usar
                </p>
                            <ol className="mt-2 space-y-1.5 text-[13px] text-foreground/90">
                              <li className="flex gap-2">
                                <span className="font-bold text-primary shrink-0">1.</span>
                                <span>
                                  Toque em <strong>Chamar</strong> no perfil para iniciar um atendimento.
                                </span>
                              </li>
                              <li className="flex gap-2">
                                <span className="font-bold text-primary shrink-0">2.</span>
                                <span>
                                  No momento do pagamento, o cupom aparece no total e é aplicado com um toque.
                                </span>
                              </li>
                              <li className="flex gap-2">
                                <span className="font-bold text-primary shrink-0">3.</span>
                                <span>O desconto respeita os limites de compra mínima/máxima do cupom.</span>
                              </li>
                            </ol>
              </div>

              {/* Aviso: cliente pode somar cupom do app ao cupom do profissional */}
              {appCouponCount > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-50">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[12.5px] leading-snug">
                    Você tem <strong>+1 cupom do app</strong> disponível. Dá para usar ele junto
                    com este cupom do profissional na mesma compra.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-snug">
                Máximo por compra: 1 cupom do profissional + 1 cupom do app. O cupom é validado
                automaticamente no pagamento.
              </p>
            </>
          )}

          {professionalHref && (
            <Link
              to={professionalHref}
              onClick={onClose}
              className="mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md hover:shadow-lg active:scale-[0.99] transition-all"
            >
              {ctaLabel}
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CouponShowcaseDialog;
