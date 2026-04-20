import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Megaphone,
  Ticket,
  ShieldCheck,
  Plus,
  Percent,
  DollarSign,
  Trash2,
  Power,
  PowerOff,
  Loader2,
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * `professional_coupons` é uma tabela nova; ainda não está nos types gerados do
 * Supabase. Em vez de poluir cada chamada com cast, fazemos o proxy aqui.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const couponsTable = () => (supabase as any).from("professional_coupons");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prosTable = () => (supabase as any).from("professionals");

// =====================================================================
// Tipos
// =====================================================================

type DiscountType = "amount" | "percent";

interface ProfessionalCoupon {
  id: string;
  professional_id: string;
  /** Rótulo opcional, só visível para o profissional. */
  name: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase: number | null;
  max_purchase: number | null;
  /** NULL = ilimitado. */
  max_uses: number | null;
  used_count: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

interface ProRecord {
  id: string;
  experience: string | null;
  services: string[] | null;
  bio: string | null;
  category_id: string | null;
  profession_id: string | null;
  cover_image_url: string | null;
}

// =====================================================================
// Helpers
// =====================================================================

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDiscount(c: Pick<ProfessionalCoupon, "discount_type" | "discount_value">): string {
  return c.discount_type === "percent"
    ? `${c.discount_value.toString().replace(/\.00$/, "")}%`
    : BRL.format(Number(c.discount_value));
}

// =====================================================================
// Página principal
// =====================================================================

const ProMarketing = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [proRecord, setProRecord] = useState<ProRecord | null>(null);
  const [loadingPro, setLoadingPro] = useState(true);
  const tabFromUrl = searchParams.get("tab");
  const initialTab = tabFromUrl === "trust" ? "trust" : "coupons";
  const [tab, setTab] = useState<"coupons" | "trust">(initialTab);

  // Apenas profissional/empresa pode acessar.
  useEffect(() => {
    if (!profile) return;
    if (profile.user_type !== "professional" && profile.user_type !== "company") {
      navigate("/home", { replace: true });
    }
  }, [profile, navigate]);

  // Carrega o registro de profissional (campos para Nível de Confiança e id para cupons).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) return;
      setLoadingPro(true);
      const { data, error } = await prosTable()
        .select("id, experience, services, bio, category_id, profession_id, cover_image_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast({
          title: "Não foi possível carregar seu perfil profissional.",
          description: error.message,
          variant: "destructive",
        });
        setProRecord(null);
      } else {
        setProRecord((data as ProRecord | null) ?? null);
      }
      setLoadingPro(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const onTabChange = (v: string) => {
    const next = v === "trust" ? "trust" : "coupons";
    setTab(next);
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  const tabBase =
    "rounded-lg px-2 py-2.5 text-xs font-semibold border-2 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:border-primary/25 data-[state=inactive]:bg-card data-[state=inactive]:text-foreground shadow-sm";

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center shadow-sm">
            <Megaphone className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Marketing</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Atraia mais clientes com cupons e melhore sua reputação completando seu perfil.
        </p>

        <Tabs value={tab} onValueChange={onTabChange} className="w-full">
          <TabsList className="mb-4 w-full h-auto p-1.5 bg-muted/60 rounded-xl grid grid-cols-2 gap-1.5 border border-primary/20">
            <TabsTrigger value="coupons" className={tabBase}>
              <Ticket className="w-3.5 h-3.5 mr-1 shrink-0" />
              Cupons de desconto
            </TabsTrigger>
            <TabsTrigger value="trust" className={tabBase}>
              <ShieldCheck className="w-3.5 h-3.5 mr-1 shrink-0" />
              Nível de confiança
            </TabsTrigger>
          </TabsList>

          <TabsContent value="coupons">
            {loadingPro ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : proRecord ? (
              <CouponsTab professionalId={proRecord.id} />
            ) : (
              <EmptyProState />
            )}
          </TabsContent>

          <TabsContent value="trust">
            {loadingPro ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : proRecord ? (
              <TrustLevelTab pro={proRecord} />
            ) : (
              <EmptyProState />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
};

const EmptyProState = () => (
  <div className="bg-card border rounded-2xl p-6 text-center">
    <p className="text-sm text-muted-foreground">
      Cadastro profissional ainda não encontrado. Conclua seu cadastro para usar o Marketing.
    </p>
  </div>
);

// =====================================================================
// Aba 1 — Cupons de desconto
// =====================================================================

interface CouponsTabProps {
  professionalId: string;
}

const CouponsTab = ({ professionalId }: CouponsTabProps) => {
  const [coupons, setCoupons] = useState<ProfessionalCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await couponsTable()
      .select("*")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar cupons", description: error.message, variant: "destructive" });
    }
    setCoupons(((data as ProfessionalCoupon[] | null) ?? []).map(normalizeCoupon));
    setLoading(false);
  }, [professionalId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleActive = async (c: ProfessionalCoupon) => {
    const { error } = await couponsTable()
      .update({ active: !c.active })
      .eq("id", c.id);
    if (error) {
      toast({ title: "Erro ao atualizar cupom", description: error.message, variant: "destructive" });
      return;
    }
    setCoupons((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)));
  };

  const removeCoupon = async (c: ProfessionalCoupon) => {
    const label = c.name?.trim() || `de ${formatDiscount(c)}`;
    if (!window.confirm(`Excluir o cupom ${label}? Essa ação não pode ser desfeita.`)) return;
    const { error } = await couponsTable().delete().eq("id", c.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setCoupons((prev) => prev.filter((x) => x.id !== c.id));
  };

  const activeCount = coupons.filter((c) => c.active).length;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-primary/10 to-pink-500/10 border border-primary/20 rounded-2xl p-4 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Como funciona</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            O cliente <strong>não digita código</strong>. Quando ele for pagar você, aparece um botão
            <strong> "Aplicar cupom"</strong> com o melhor desconto que você criou. Quem banca é você. Seu
            perfil ganha o destaque <strong className="text-primary">"Contrate com desconto"</strong>{" "}
            sempre que houver pelo menos um cupom ativo.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Meus cupons</p>
          <p className="text-[11px] text-muted-foreground">
            {activeCount} ativo{activeCount === 1 ? "" : "s"} · {coupons.length} no total
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> {showForm ? "Cancelar" : "Novo cupom"}
        </button>
      </div>

      {showForm && (
        <CouponForm
          professionalId={professionalId}
          onCreated={() => {
            setShowForm(false);
            void reload();
          }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="bg-card border rounded-2xl p-6 text-center">
          <Ticket className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Você ainda não criou nenhum cupom.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => (
            <CouponRow
              key={c.id}
              coupon={c}
              onToggleActive={() => void toggleActive(c)}
              onRemove={() => void removeCoupon(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function normalizeCoupon(c: ProfessionalCoupon): ProfessionalCoupon {
  return {
    ...c,
    discount_value: Number(c.discount_value),
    min_purchase: c.min_purchase != null ? Number(c.min_purchase) : null,
    max_purchase: c.max_purchase != null ? Number(c.max_purchase) : null,
  };
}

interface CouponRowProps {
  coupon: ProfessionalCoupon;
  onToggleActive: () => void;
  onRemove: () => void;
}

const CouponRow = ({ coupon, onToggleActive, onRemove }: CouponRowProps) => {
  const expired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
  const exhausted = coupon.max_uses != null && coupon.used_count >= coupon.max_uses;
  const usable = coupon.active && !expired && !exhausted;

  return (
    <div
      className={cn(
        "border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors",
        usable ? "bg-card border-primary/30" : "bg-muted/40 border-border",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-base font-bold text-foreground">
            {coupon.discount_type === "percent" ? (
              <Percent className="w-4 h-4 text-primary" />
            ) : (
              <DollarSign className="w-4 h-4 text-primary" />
            )}
            {formatDiscount(coupon)} de desconto
          </span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-bold",
              usable
                ? "bg-emerald-100 text-emerald-700"
                : expired
                  ? "bg-destructive/10 text-destructive"
                  : exhausted
                    ? "bg-amber-100 text-amber-700"
                    : "bg-muted text-muted-foreground",
            )}
          >
            {usable
              ? "Ativo"
              : expired
                ? "Expirado"
                : exhausted
                  ? "Esgotado"
                  : "Pausado"}
          </span>
        </div>
        {coupon.name?.trim() && (
          <p className="text-xs text-muted-foreground mt-0.5 italic">{coupon.name}</p>
        )}
        <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
          {(coupon.min_purchase != null || coupon.max_purchase != null) && (
            <p>
              {coupon.min_purchase != null && <>Mín.: {BRL.format(coupon.min_purchase)} </>}
              {coupon.max_purchase != null && <>· Máx.: {BRL.format(coupon.max_purchase)}</>}
            </p>
          )}
          <p>
            {coupon.max_uses == null
              ? `Usos: ${coupon.used_count} (ilimitado)`
              : `Usos: ${coupon.used_count}/${coupon.max_uses}`}
            {coupon.expires_at && (
              <> · Expira em {new Date(coupon.expires_at).toLocaleDateString("pt-BR")}</>
            )}
          </p>
        </div>
      </div>
      <div className="flex gap-2 sm:flex-col sm:items-end">
        <button
          type="button"
          onClick={onToggleActive}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            coupon.active
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
          )}
          aria-label={coupon.active ? "Pausar cupom" : "Reativar cupom"}
        >
          {coupon.active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
          {coupon.active ? "Pausar" : "Reativar"}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          aria-label="Excluir cupom"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Excluir
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Formulário de criação de cupom
// ---------------------------------------------------------------------

interface CouponFormProps {
  professionalId: string;
  onCreated: () => void;
}

const CouponForm = ({ professionalId, onCreated }: CouponFormProps) => {
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [minPurchase, setMinPurchase] = useState("");
  const [maxPurchase, setMaxPurchase] = useState("");
  const [usageMode, setUsageMode] = useState<"unlimited" | "single" | "limited">("unlimited");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(discountValue.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor maior que zero.",
        variant: "destructive",
      });
      return;
    }
    if (discountType === "percent" && value > 100) {
      toast({
        title: "Percentual inválido",
        description: "O desconto em % não pode passar de 100.",
        variant: "destructive",
      });
      return;
    }

    const min = minPurchase ? Number(minPurchase.replace(",", ".")) : null;
    const max = maxPurchase ? Number(maxPurchase.replace(",", ".")) : null;
    if (min != null && (!Number.isFinite(min) || min < 0)) {
      toast({ title: "Valor mínimo inválido", variant: "destructive" });
      return;
    }
    if (max != null && (!Number.isFinite(max) || max < 0)) {
      toast({ title: "Valor máximo inválido", variant: "destructive" });
      return;
    }
    if (min != null && max != null && min > max) {
      toast({
        title: "Faixa inválida",
        description: "O valor mínimo precisa ser menor que o máximo.",
        variant: "destructive",
      });
      return;
    }

    let resolvedMaxUses: number | null = null;
    if (usageMode === "single") resolvedMaxUses = 1;
    else if (usageMode === "limited") {
      const n = Number(maxUses);
      if (!Number.isInteger(n) || n < 1) {
        toast({
          title: "Limite inválido",
          description: "Informe um número inteiro de usos (mínimo 1).",
          variant: "destructive",
        });
        return;
      }
      resolvedMaxUses = n;
    }

    setSaving(true);
    try {
      const payload = {
        professional_id: professionalId,
        name: name.trim() ? name.trim() : null,
        discount_type: discountType,
        discount_value: value,
        min_purchase: min,
        max_purchase: max,
        max_uses: resolvedMaxUses,
        active: true,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      const { error } = await couponsTable().insert(payload);
      if (error) {
        toast({ title: "Erro ao criar cupom", description: error.message, variant: "destructive" });
        return;
      }
      toast({
        title: "Cupom criado!",
        description: "Já está disponível para seus clientes aplicarem no checkout.",
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-muted/30 border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";
  const labelCls = "text-[11px] uppercase font-bold text-muted-foreground ml-1";

  return (
    <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-4 space-y-4">
      <div>
        <label className={labelCls}>Nome do cupom (opcional)</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Promo de inverno"
          maxLength={60}
          className={cn(inputCls, "mt-1")}
        />
        <p className="text-[10px] text-muted-foreground mt-1 ml-1">
          Só você vê — o cliente aplica direto no checkout, sem digitar código.
        </p>
      </div>

      <div>
        <label className={labelCls}>Tipo de desconto</label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={() => setDiscountType("percent")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-sm font-semibold transition-colors",
              discountType === "percent"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            <Percent className="w-4 h-4" /> Porcentagem
          </button>
          <button
            type="button"
            onClick={() => setDiscountType("amount")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-sm font-semibold transition-colors",
              discountType === "amount"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            <DollarSign className="w-4 h-4" /> Valor (R$)
          </button>
        </div>
      </div>

      <div>
        <label className={labelCls}>
          {discountType === "percent" ? "Porcentagem (%)" : "Valor (R$)"}
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={discountValue}
          onChange={(e) => setDiscountValue(e.target.value.replace(/[^0-9.,]/g, ""))}
          placeholder={discountType === "percent" ? "10" : "25,00"}
          className={cn(inputCls, "mt-1")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Compra mínima (opc.)</label>
          <input
            type="text"
            inputMode="decimal"
            value={minPurchase}
            onChange={(e) => setMinPurchase(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder="R$"
            className={cn(inputCls, "mt-1")}
          />
        </div>
        <div>
          <label className={labelCls}>Compra máxima (opc.)</label>
          <input
            type="text"
            inputMode="decimal"
            value={maxPurchase}
            onChange={(e) => setMaxPurchase(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder="R$"
            className={cn(inputCls, "mt-1")}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Limite de usos</label>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {(
            [
              { v: "unlimited" as const, label: "Ilimitado" },
              { v: "single" as const, label: "1 compra" },
              { v: "limited" as const, label: "Personalizar" },
            ]
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setUsageMode(o.v)}
              className={cn(
                "py-2 rounded-xl border-2 text-xs font-semibold transition-colors",
                usageMode === o.v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {usageMode === "limited" && (
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="Quantos usos no total?"
            className={cn(inputCls, "mt-2")}
          />
        )}
      </div>

      <div>
        <label className={labelCls}>Expira em (opc.)</label>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className={cn(inputCls, "mt-1")}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Criar cupom
      </button>
    </form>
  );
};

// =====================================================================
// Aba 2 — Nível de confiança
// =====================================================================

interface TrustLevelTabProps {
  pro: ProRecord;
}

interface TrustCriterion {
  key: string;
  label: string;
  helper: string;
  /** Caminho com âncora opcional para guiar o ajuste no perfil. */
  cta?: { label: string; to: string };
  done: boolean;
}

interface TrustLevel {
  /** Cor de fundo Tailwind para a barra. */
  bar: string;
  /** Cor do texto/badge. */
  text: string;
  /** Bordas/anel. */
  ring: string;
  label: string;
  emoji: string;
}

const TRUST_LEVELS: { min: number; level: TrustLevel }[] = [
  { min: 0, level: { bar: "bg-red-500", text: "text-red-600", ring: "ring-red-200", label: "Iniciante", emoji: "🔴" } },
  { min: 17, level: { bar: "bg-orange-500", text: "text-orange-600", ring: "ring-orange-200", label: "Em construção", emoji: "🟠" } },
  { min: 34, level: { bar: "bg-yellow-400", text: "text-yellow-600", ring: "ring-yellow-200", label: "Em progresso", emoji: "🟡" } },
  { min: 51, level: { bar: "bg-green-500", text: "text-green-600", ring: "ring-green-200", label: "Confiável", emoji: "🟢" } },
  { min: 68, level: { bar: "bg-blue-500", text: "text-blue-600", ring: "ring-blue-200", label: "Muito confiável", emoji: "🔵" } },
  { min: 90, level: { bar: "bg-purple-600", text: "text-purple-600", ring: "ring-purple-200", label: "Profissional Top", emoji: "🟣" } },
];

function levelFor(score: number): TrustLevel {
  let chosen = TRUST_LEVELS[0].level;
  for (const t of TRUST_LEVELS) {
    if (score >= t.min) chosen = t.level;
  }
  return chosen;
}

const TrustLevelTab = ({ pro }: TrustLevelTabProps) => {
  const { criteria, score } = useMemo(() => {
    const expLen = (pro.experience ?? "").trim().length;
    const bioLen = (pro.bio ?? "").trim().length;
    const servicesCount = pro.services?.length ?? 0;

    const items: TrustCriterion[] = [
      {
        key: "category",
        label: "Categoria e profissão definidas",
        helper: "Selecione sua categoria e profissão para aparecer nas buscas certas.",
        done: !!pro.category_id && !!pro.profession_id,
        cta: { label: "Editar perfil", to: "/profile" },
      },
      {
        key: "cover",
        label: "Foto de capa",
        helper: "Capriche numa imagem de capa: ela é o primeiro impacto do seu perfil.",
        done: !!pro.cover_image_url,
        cta: { label: "Editar perfil", to: "/profile" },
      },
      {
        key: "experience",
        label: "Experiência bem detalhada (mín. 100 caracteres)",
        helper: `Sua experiência tem ${expLen} caracteres. Conte sobre suas formações, anos atuando e principais clientes.`,
        done: expLen >= 100,
        cta: { label: "Editar perfil", to: "/profile" },
      },
      {
        key: "services",
        label: "Pelo menos 3 serviços cadastrados",
        helper: `Você tem ${servicesCount} serviço${servicesCount === 1 ? "" : "s"}. Adicione pelo menos 3 para mostrar variedade.`,
        done: servicesCount >= 3,
        cta: { label: "Editar perfil", to: "/profile" },
      },
      {
        key: "bio",
        label: "Sobre você (mín. 50 caracteres)",
        helper: `Seu "Sobre" tem ${bioLen} caracteres. Apresente-se de um jeito que cative o cliente.`,
        done: bioLen >= 50,
        cta: { label: "Editar perfil", to: "/profile" },
      },
    ];

    const done = items.filter((i) => i.done).length;
    const pct = Math.round((done / items.length) * 100);
    return { criteria: items, score: pct };
  }, [pro]);

  const level = levelFor(score);
  const pendingCount = criteria.filter((c) => !c.done).length;
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className={cn("bg-card border rounded-2xl p-5 ring-1", level.ring)}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
              Nível de confiança
            </p>
            <p className={cn("text-2xl font-extrabold mt-0.5", level.text)}>
              {level.emoji} {level.label}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingCount === 0
                ? "Perfil 100% configurado. Você atingiu o nível máximo!"
                : `Faltam ${pendingCount} ajuste${pendingCount === 1 ? "" : "s"} para subir de nível.`}
            </p>
          </div>
          <div className={cn("text-3xl font-extrabold tabular-nums", level.text)}>{score}%</div>
        </div>

        {/* Barra de progresso multicolor */}
        <div className="relative h-3 rounded-full overflow-hidden bg-muted">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-orange-500 via-yellow-400 via-green-500 via-blue-500 to-purple-600 transition-all duration-500"
            style={{ width: `${Math.max(2, score)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5 font-medium">
          <span>🔴</span>
          <span>🟠</span>
          <span>🟡</span>
          <span>🟢</span>
          <span>🔵</span>
          <span>🟣</span>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground px-1">O que melhora seu nível</p>
        {criteria.map((c) => (
          <div
            key={c.key}
            className={cn(
              "border rounded-2xl p-3 flex items-start gap-3",
              c.done ? "bg-emerald-50 border-emerald-200" : "bg-card border-border",
            )}
          >
            {c.done ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold",
                  c.done ? "text-emerald-700" : "text-foreground",
                )}
              >
                {c.label}
              </p>
              {!c.done && <p className="text-xs text-muted-foreground mt-0.5">{c.helper}</p>}
            </div>
            {!c.done && c.cta && (
              <button
                type="button"
                onClick={() => navigate(c.cta!.to)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
              >
                {c.cta.label}
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProMarketing;
