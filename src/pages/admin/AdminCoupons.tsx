import AdminLayout from "@/components/AdminLayout";
import {
  Ticket,
  Trophy,
  Plus,
  Shuffle,
  Search,
  Percent,
  Settings2,
  Trash2,
  Power,
  PowerOff,
  Check,
  User,
  Mail,
  Phone,
  Users,
  Briefcase,
  UserRound,
  Megaphone,
  Calendar,
  X,
  Send,
  Clock,
  AlertTriangle,
  Filter,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type CouponType = "raffle" | "discount";
type DistributeTarget = "individual" | "random" | "all" | "professionals" | "clients";
type RaffleAudience = "all" | "clients" | "professionals";

type SearchedUser = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  user_type: string | null;
};

interface UserCoupon {
  id: string;
  coupon_type: CouponType | string;
  source: string;
  used: boolean;
  discount_percent: number | string | null;
  expires_at: string | null;
  created_at: string;
}

interface Raffle {
  id: string;
  title: string;
  draw_date: string;
  status: string;
  winner_user_id: string | null;
  audience?: string | null;
}

interface CouponCampaign {
  id: string;
  discount_percent: number;
  total_quantity: number;
  used_quantity: number;
  min_purchase_value: number | null;
  max_purchase_value: number | null;
  is_active: boolean;
}

const formatDateBR = (iso?: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

const formatDateTimeBR = (iso?: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sourceLabel = (source: string): string => {
  switch (source) {
    case "registration":
      return "Cadastro";
    case "payment":
      return "Pagamento";
    case "bonus":
      return "Bônus";
    case "admin":
      return "Admin (manual)";
    case "admin_random":
      return "Admin (aleatório)";
    case "admin_broadcast_all":
      return "Admin (todos)";
    case "admin_broadcast_pros":
      return "Admin (profissionais)";
    case "admin_broadcast_clients":
      return "Admin (clientes)";
    case "referral_signup":
      return "Indicação";
    default:
      return source;
  }
};

const userTypeLabel = (t: string | null | undefined): string => {
  if (t === "client") return "Cliente";
  if (t === "professional") return "Profissional";
  if (t === "company") return "Empresa";
  return t || "—";
};

type UserWithCoupons = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  user_type: string | null;
  total: number;
  raffle: number;
  discount: number;
  active: number;
};

type UsersHasCouponFilter = "all" | "with" | "without";
type UsersTypeFilter = "all" | "client" | "professional";
type UsersSortBy = "count_desc" | "count_asc" | "name_asc" | "name_desc";

const AdminCoupons = () => {
  const [activeTab, setActiveTab] = useState<
    "users" | "raffle_coupons" | "discount_coupons" | "auto" | "raffles"
  >("raffle_coupons");

  // ── Aba: Usuários (lista geral com contagem de cupons)
  const [usersList, setUsersList] = useState<UserWithCoupons[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersFetched, setUsersFetched] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersFiltersOpen, setUsersFiltersOpen] = useState(false);
  const [usersTypeFilter, setUsersTypeFilter] = useState<UsersTypeFilter>("all");
  const [usersHasCouponFilter, setUsersHasCouponFilter] = useState<UsersHasCouponFilter>("all");
  const [usersSortBy, setUsersSortBy] = useState<UsersSortBy>("count_desc");

  // Dialog: cupons de um usuário (visão consolidada raffle + discount)
  const [userCouponsDialog, setUserCouponsDialog] = useState<UserWithCoupons | null>(null);
  const [userCouponsAll, setUserCouponsAll] = useState<UserCoupon[]>([]);
  const [userCouponsAllLoading, setUserCouponsAllLoading] = useState(false);

  // ── Stats globais
  const [counts, setCounts] = useState({
    raffleTotal: 0,
    raffleUnused: 0,
    discountTotal: 0,
    discountActive: 0,
    drawn: 0,
  });
  const [loading, setLoading] = useState(true);

  // ── Sorteios
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawDialogOpen, setDrawDialogOpen] = useState(false);
  const [drawRaffleId, setDrawRaffleId] = useState<string | null>(null);
  const [drawAudience, setDrawAudience] = useState<RaffleAudience>("all");
  const [drawing, setDrawing] = useState(false);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", draw_date: "" });
  const [winnerInfoOpen, setWinnerInfoOpen] = useState(false);
  const [winnerData, setWinnerData] = useState<{
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null>(null);
  const [confirmDeleteRaffle, setConfirmDeleteRaffle] = useState<Raffle | null>(null);
  const [deletingRaffle, setDeletingRaffle] = useState(false);

  // ── Modal "Distribuir cupom" (compartilhado entre Aba 1 e Aba 2)
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [distributeType, setDistributeType] = useState<CouponType>("raffle");
  const [distributeForm, setDistributeForm] = useState({
    target: "individual" as DistributeTarget,
    discount_percent: "5",
    expires_days: "30",
  });
  const [distributeUserSearch, setDistributeUserSearch] = useState("");
  const [distributeUserResults, setDistributeUserResults] = useState<SearchedUser[]>([]);
  const [distributeSelectedUser, setDistributeSelectedUser] = useState<SearchedUser | null>(null);
  const [addingCoupon, setAddingCoupon] = useState(false);
  const [broadcastConfirmOpen, setBroadcastConfirmOpen] = useState(false);
  const [broadcastTargetCount, setBroadcastTargetCount] = useState<number | null>(null);
  const [loadingBroadcastCount, setLoadingBroadcastCount] = useState(false);

  // ── Lupa nas abas 1 e 2: pesquisar usuário e ver cupons dele
  const [raffleSearch, setRaffleSearch] = useState("");
  const [raffleSearchResults, setRaffleSearchResults] = useState<SearchedUser[]>([]);
  const [raffleSelectedUser, setRaffleSelectedUser] = useState<SearchedUser | null>(null);
  const [raffleUserCoupons, setRaffleUserCoupons] = useState<UserCoupon[]>([]);
  const [raffleUserLoading, setRaffleUserLoading] = useState(false);

  const [discountSearch, setDiscountSearch] = useState("");
  const [discountSearchResults, setDiscountSearchResults] = useState<SearchedUser[]>([]);
  const [discountSelectedUser, setDiscountSelectedUser] = useState<SearchedUser | null>(null);
  const [discountUserCoupons, setDiscountUserCoupons] = useState<UserCoupon[]>([]);
  const [discountUserLoading, setDiscountUserLoading] = useState(false);

  // ── Distribuição automática (Aba 3)
  const [campaigns, setCampaigns] = useState<CouponCampaign[]>([]);
  const [addCampaignOpen, setAddCampaignOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    discount_percent: "10",
    total_quantity: "100",
    min_purchase_value: "0",
    max_purchase_value: "",
  });
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [confirmDeleteCampaign, setConfirmDeleteCampaign] = useState<CouponCampaign | null>(null);

  const [globalSettings, setGlobalSettings] = useState({
    auto_discount: true,
    auto_raffle: true,
    signup_coupon: true,
  });
  const [signupCouponMonthlyCap, setSignupCouponMonthlyCap] = useState("10000");
  const [savingSignupCoupon, setSavingSignupCoupon] = useState(false);
  const [discountValidityDays, setDiscountValidityDays] = useState("30");
  const [savingValidity, setSavingValidity] = useState(false);

  // ── Carregamento principal ────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [
      { data: r },
      { data: camp },
      { data: settings },
      raffleAggregates,
      discountAggregates,
    ] = await Promise.all([
      supabase.from("raffles").select("*").order("draw_date", { ascending: false }),
      supabase
        .from("coupon_campaigns" as never)
        .select("id, discount_percent, total_quantity, used_quantity, min_purchase_value, max_purchase_value, is_active")
        .order("created_at", { ascending: false }),
      supabase.from("platform_settings").select("*").in("key", [
        "auto_discount_active",
        "auto_raffle_active",
        "referral_signup_coupon_active",
        "referral_signup_coupon_monthly_cap",
        "discount_coupon_validity_days",
      ]),
      Promise.all([
        supabase.from("coupons").select("*", { count: "exact", head: true }).eq("coupon_type", "raffle"),
        supabase
          .from("coupons")
          .select("*", { count: "exact", head: true })
          .eq("coupon_type", "raffle")
          .eq("used", false),
      ]),
      Promise.all([
        supabase.from("coupons").select("*", { count: "exact", head: true }).eq("coupon_type", "discount"),
        supabase
          .from("coupons")
          .select("*", { count: "exact", head: true })
          .eq("coupon_type", "discount")
          .eq("used", false)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
      ]),
    ]);

    setRaffles((r as Raffle[]) || []);
    setCampaigns((camp as unknown as CouponCampaign[]) || []);

    setCounts({
      raffleTotal: raffleAggregates[0].count || 0,
      raffleUnused: raffleAggregates[1].count || 0,
      discountTotal: discountAggregates[0].count || 0,
      discountActive: discountAggregates[1].count || 0,
      drawn: ((r as Raffle[]) || []).filter((x) => x.status === "drawn").length,
    });

    if (settings) {
      const rawBool = (v: unknown) => {
        if (v === true) return true;
        if (v === false) return false;
        const s = String(v ?? "").trim().toLowerCase();
        return s === "true" || s === "1" || s === "yes";
      };
      const isDiscountActive = rawBool(settings.find((s) => s.key === "auto_discount_active")?.value);
      const isRaffleActive = rawBool(settings.find((s) => s.key === "auto_raffle_active")?.value);
      const signupRow = settings.find((s) => s.key === "referral_signup_coupon_active");
      const signupActive = signupRow === undefined ? true : rawBool(signupRow.value);
      setGlobalSettings({
        auto_discount: isDiscountActive,
        auto_raffle: isRaffleActive,
        signup_coupon: signupActive,
      });

      const capRow = settings.find((s) => s.key === "referral_signup_coupon_monthly_cap");
      if (capRow !== undefined) {
        const capStr = capRow.value == null ? "10000" : String(capRow.value).replace(/^"|"$/g, "");
        setSignupCouponMonthlyCap(/^\d+$/.test(capStr) ? capStr : "10000");
      }

      const valRow = settings.find((s) => s.key === "discount_coupon_validity_days");
      if (valRow !== undefined) {
        const valStr = valRow.value == null ? "30" : String(valRow.value).replace(/^"|"$/g, "");
        setDiscountValidityDays(/^\d+$/.test(valStr) ? valStr : "30");
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Configurações globais ────────────────────────────────────────────
  const toggleGlobalSetting = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from("platform_settings").upsert({ key, value: String(newValue) as any }, { onConflict: "key" });
      setGlobalSettings((prev) => {
        if (key === "auto_discount_active") return { ...prev, auto_discount: newValue };
        if (key === "auto_raffle_active") return { ...prev, auto_raffle: newValue };
        if (key === "referral_signup_coupon_active") return { ...prev, signup_coupon: newValue };
        return prev;
      });
      toast({ title: "Configuração atualizada!" });
    } catch {
      toast({ title: "Erro ao atualizar configuração", variant: "destructive" });
    }
  };

  const saveSignupCouponSettings = async () => {
    const cap = Math.max(0, Math.floor(parseFloat(signupCouponMonthlyCap.replace(",", ".")) || 0));
    if (globalSettings.signup_coupon && cap < 1) {
      toast({
        title: "Limite mensal inválido",
        description: "Use 1 ou mais cadastros premiados por mês, ou desative o cupom de cadastro.",
        variant: "destructive",
      });
      return;
    }
    setSavingSignupCoupon(true);
    try {
      const { error: e0 } = await supabase
        .from("platform_settings")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ key: "referral_signup_coupon_discount_percent", value: "0" as any }, { onConflict: "key" });
      if (e0) throw e0;
      const { error: e2 } = await supabase
        .from("platform_settings")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ key: "referral_signup_coupon_monthly_cap", value: String(cap) as any }, { onConflict: "key" });
      if (e2) throw e2;
      setSignupCouponMonthlyCap(String(cap));
      toast({ title: "Cupom de cadastro salvo!" });
      await fetchData();
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
    setSavingSignupCoupon(false);
  };

  const saveValidityDays = async () => {
    const days = Math.max(1, Math.floor(parseFloat(discountValidityDays.replace(",", ".")) || 0));
    setSavingValidity(true);
    try {
      const { error } = await supabase
        .from("platform_settings")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ key: "discount_coupon_validity_days", value: String(days) as any }, { onConflict: "key" });
      if (error) throw error;
      setDiscountValidityDays(String(days));
      toast({ title: "Validade padrão salva!" });
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar validade",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
    setSavingValidity(false);
  };

  // ── Sorteios (Aba 4) ─────────────────────────────────────────────────
  const handleCreateRaffle = async () => {
    if (!form.title || !form.draw_date) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("raffles").insert({
      title: form.title,
      draw_date: form.draw_date,
      status: "upcoming",
    });
    if (error) {
      toast({ title: "Erro", description: translateError(error.message), variant: "destructive" });
      return;
    }
    toast({ title: "Sorteio criado!" });
    setDialogOpen(false);
    setForm({ title: "", draw_date: "" });
    void fetchData();
  };

  const openDraw = (raffleId: string) => {
    setDrawRaffleId(raffleId);
    setDrawAudience("all");
    setWinnerName(null);
    setDrawDialogOpen(true);
  };

  const handleDraw = async () => {
    if (!drawRaffleId) return;
    setDrawing(true);
    try {
      const { data: coupons } = await supabase
        .from("coupons")
        .select("id, user_id")
        .eq("used", false)
        .eq("coupon_type", "raffle");
      let pool = (coupons as { id: string; user_id: string }[] | null) || [];

      if (pool.length === 0) {
        toast({ title: "Nenhum cupom disponível para sorteio", variant: "destructive" });
        setDrawing(false);
        return;
      }

      // Filtra por audiência (clientes / profissionais) consultando profiles.
      if (drawAudience !== "all") {
        const userIds = Array.from(new Set(pool.map((c) => c.user_id)));
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, user_type")
          .in("user_id", userIds);
        const allowedTypes =
          drawAudience === "clients" ? ["client"] : ["professional", "company"];
        const allowedSet = new Set(
          ((profs as { user_id: string; user_type: string | null }[] | null) || [])
            .filter((p) => allowedTypes.includes(p.user_type ?? ""))
            .map((p) => p.user_id),
        );
        pool = pool.filter((c) => allowedSet.has(c.user_id));
      }

      if (pool.length === 0) {
        toast({
          title: "Nenhum cupom no público escolhido",
          description: "Tente outro filtro ou distribua mais cupons antes de sortear.",
          variant: "destructive",
        });
        setDrawing(false);
        return;
      }

      const winner = pool[Math.floor(Math.random() * pool.length)];
      await supabase
        .from("raffles")
        .update({ status: "drawn", winner_user_id: winner.user_id })
        .eq("id", drawRaffleId);
      await supabase.from("coupons").update({ used: true, raffle_id: drawRaffleId }).eq("id", winner.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", winner.user_id)
        .maybeSingle();
      setWinnerName(profile?.full_name || "Usuário");

      const raffle = raffles.find((r) => r.id === drawRaffleId);

      await supabase.from("notifications").insert({
        user_id: winner.user_id,
        title: "🎉 Você foi sorteado!",
        message: `Parabéns! Você foi o ganhador do sorteio "${raffle?.title || ""}". Nossa equipe entrará em contato em até 24h para você receber seu prêmio.`,
        type: "raffle_win",
        read: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      toast({ title: "Sorteio realizado com sucesso!" });
      void fetchData();
    } catch (err: unknown) {
      toast({
        title: "Erro no sorteio",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
    setDrawing(false);
  };

  const handleViewWinner = async (userId: string | null) => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("user_id", userId)
        .single();
      setWinnerData((data as typeof winnerData) || null);
      setWinnerInfoOpen(true);
    } catch {
      toast({ title: "Erro ao buscar dados do ganhador", variant: "destructive" });
    }
  };

  const handleDeleteRaffle = async () => {
    if (!confirmDeleteRaffle) return;
    setDeletingRaffle(true);
    try {
      // Devolve os cupons já amarrados ao sorteio (se houver) — apaga é mais limpo
      // que tentar reabrir, e sorteios com winner geralmente não devem ser apagados.
      // Aqui apenas zeramos o raffle_id em coupons que apontavam pra ele para preservar
      // os cupons.
      await supabase.from("coupons").update({ raffle_id: null }).eq("raffle_id", confirmDeleteRaffle.id);
      const { error } = await supabase.from("raffles").delete().eq("id", confirmDeleteRaffle.id);
      if (error) throw error;
      toast({ title: "Sorteio excluído!" });
      setConfirmDeleteRaffle(null);
      void fetchData();
    } catch (err: unknown) {
      toast({
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
    setDeletingRaffle(false);
  };

  // ── Distribuir cupom (Modal compartilhado Aba 1 & 2) ─────────────────
  const openDistribute = (type: CouponType) => {
    setDistributeType(type);
    setDistributeForm({ target: "individual", discount_percent: "5", expires_days: "30" });
    setDistributeUserSearch("");
    setDistributeUserResults([]);
    setDistributeSelectedUser(null);
    setDistributeOpen(true);
  };

  const searchDistributeUsers = async (q: string) => {
    setDistributeUserSearch(q);
    if (q.length < 2) {
      setDistributeUserResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, user_type")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);
    setDistributeUserResults((data as SearchedUser[]) || []);
  };

  const buildCouponData = (userId: string, source: string) => {
    const couponData: {
      user_id: string;
      source: string;
      coupon_type: CouponType;
      used: boolean;
      discount_percent?: number;
      expires_at?: string;
    } = {
      user_id: userId,
      source,
      coupon_type: distributeType,
      used: false,
    };
    if (distributeType === "discount") {
      couponData.discount_percent = parseFloat(distributeForm.discount_percent) || 5;
      couponData.expires_at = new Date(
        Date.now() + (parseInt(distributeForm.expires_days) || 30) * 86400000,
      ).toISOString();
    }
    return couponData;
  };

  const buildNotification = (userId: string) => ({
    user_id: userId,
    title: distributeType === "raffle" ? "🎟️ Cupom de sorteio recebido!" : "🎉 Cupom de desconto recebido!",
    message:
      distributeType === "raffle"
        ? "Você recebeu um cupom para o sorteio mensal!"
        : `Você recebeu um cupom de ${distributeForm.discount_percent}% de desconto!`,
    type: "coupon",
    read: false,
  });

  const fetchTargetUsers = async (target: "all" | "professionals" | "clients" | "random") => {
    let query = supabase.from("profiles").select("user_id, full_name");
    if (target === "professionals") {
      query = query.in("user_type", ["professional", "company"]);
    } else if (target === "clients") {
      query = query.eq("user_type", "client");
    }
    const { data, error } = await query.limit(20000);
    if (error) throw error;
    return ((data as { user_id: string | null; full_name: string | null }[] | null) || []).filter(
      (u) => !!u.user_id,
    ) as { user_id: string; full_name: string | null }[];
  };

  const targetLabel = useMemo(() => {
    if (distributeForm.target === "all") return "todos os usuários";
    if (distributeForm.target === "professionals") return "todos os profissionais";
    if (distributeForm.target === "clients") return "todos os clientes";
    return "";
  }, [distributeForm.target]);

  const requestBroadcast = async () => {
    setLoadingBroadcastCount(true);
    setBroadcastTargetCount(null);
    setBroadcastConfirmOpen(true);
    try {
      const users = await fetchTargetUsers(distributeForm.target as "all" | "professionals" | "clients");
      setBroadcastTargetCount(users.length);
    } catch (err: unknown) {
      toast({
        title: "Erro ao buscar usuários",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
      setBroadcastConfirmOpen(false);
    }
    setLoadingBroadcastCount(false);
  };

  const handleAddCoupon = async () => {
    setAddingCoupon(true);
    try {
      if (distributeForm.target === "individual") {
        if (!distributeSelectedUser) {
          toast({ title: "Selecione um usuário", variant: "destructive" });
          setAddingCoupon(false);
          return;
        }
        const { error: couponError } = await supabase
          .from("coupons")
          .insert(buildCouponData(distributeSelectedUser.user_id, "admin"));
        if (couponError) {
          toast({ title: "Erro ao criar cupom", description: couponError.message, variant: "destructive" });
          setAddingCoupon(false);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("notifications").insert(buildNotification(distributeSelectedUser.user_id) as any);
        toast({ title: `Cupom adicionado para ${distributeSelectedUser.full_name}!` });
      } else if (distributeForm.target === "random") {
        const allUsers = await fetchTargetUsers("random");
        if (!allUsers || allUsers.length === 0) {
          toast({ title: "Nenhum usuário encontrado", variant: "destructive" });
          setAddingCoupon(false);
          return;
        }
        const lucky = allUsers[Math.floor(Math.random() * allUsers.length)];
        const { error: couponError } = await supabase
          .from("coupons")
          .insert(buildCouponData(lucky.user_id, "admin_random"));
        if (couponError) {
          toast({ title: "Erro ao criar cupom", description: couponError.message, variant: "destructive" });
          setAddingCoupon(false);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("notifications").insert(buildNotification(lucky.user_id) as any);
        toast({ title: `Cupom sorteado para ${lucky.full_name}!` });
      } else {
        const targetUsers = await fetchTargetUsers(distributeForm.target);
        if (!targetUsers || targetUsers.length === 0) {
          toast({ title: "Nenhum usuário encontrado para esse grupo", variant: "destructive" });
          setAddingCoupon(false);
          return;
        }

        const sourceTag =
          distributeForm.target === "all"
            ? "admin_broadcast_all"
            : distributeForm.target === "professionals"
            ? "admin_broadcast_pros"
            : "admin_broadcast_clients";

        const couponsPayload = targetUsers.map((u) => buildCouponData(u.user_id, sourceTag));
        const notifPayload = targetUsers.map((u) => buildNotification(u.user_id));

        const CHUNK = 500;
        let totalInserted = 0;
        for (let i = 0; i < couponsPayload.length; i += CHUNK) {
          const slice = couponsPayload.slice(i, i + CHUNK);
          const { error: cErr } = await supabase.from("coupons").insert(slice);
          if (cErr) {
            toast({
              title: "Erro ao criar cupons em massa",
              description: `${cErr.message} (após ${totalInserted} cupons)`,
              variant: "destructive",
            });
            setAddingCoupon(false);
            setBroadcastConfirmOpen(false);
            return;
          }
          totalInserted += slice.length;
        }

        for (let i = 0; i < notifPayload.length; i += CHUNK) {
          const slice = notifPayload.slice(i, i + CHUNK);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await supabase.from("notifications").insert(slice as any);
        }

        toast({
          title: `Cupom enviado para ${totalInserted.toLocaleString("pt-BR")} ${
            distributeForm.target === "all"
              ? "usuários"
              : distributeForm.target === "professionals"
              ? "profissionais"
              : "clientes"
          }!`,
        });
      }

      setDistributeOpen(false);
      setBroadcastConfirmOpen(false);
      setDistributeSelectedUser(null);
      setDistributeUserSearch("");
      setDistributeUserResults([]);
      void fetchData();
      // Recarrega cupons do usuário selecionado nas lupas, se for o caso
      if (raffleSelectedUser) void loadUserCoupons("raffle", raffleSelectedUser.user_id);
      if (discountSelectedUser) void loadUserCoupons("discount", discountSelectedUser.user_id);
    } catch (err: unknown) {
      toast({
        title: "Erro ao adicionar cupom",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
    setAddingCoupon(false);
  };

  // ── Lupa: pesquisar usuário e listar cupons ──────────────────────────
  const searchUserForType = async (type: CouponType, q: string) => {
    if (type === "raffle") {
      setRaffleSearch(q);
      if (q.length < 2) {
        setRaffleSearchResults([]);
        return;
      }
    } else {
      setDiscountSearch(q);
      if (q.length < 2) {
        setDiscountSearchResults([]);
        return;
      }
    }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, user_type")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);
    if (type === "raffle") setRaffleSearchResults((data as SearchedUser[]) || []);
    else setDiscountSearchResults((data as SearchedUser[]) || []);
  };

  const loadUserCoupons = async (type: CouponType, userId: string) => {
    if (type === "raffle") setRaffleUserLoading(true);
    else setDiscountUserLoading(true);
    const { data, error } = await supabase
      .from("coupons")
      .select("id, coupon_type, source, used, discount_percent, expires_at, created_at")
      .eq("user_id", userId)
      .eq("coupon_type", type)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast({ title: "Erro ao carregar cupons", description: error.message, variant: "destructive" });
    }
    if (type === "raffle") {
      setRaffleUserCoupons((data as UserCoupon[]) || []);
      setRaffleUserLoading(false);
    } else {
      setDiscountUserCoupons((data as UserCoupon[]) || []);
      setDiscountUserLoading(false);
    }
  };

  const selectUserForType = (type: CouponType, user: SearchedUser) => {
    if (type === "raffle") {
      setRaffleSelectedUser(user);
      setRaffleSearch("");
      setRaffleSearchResults([]);
      void loadUserCoupons("raffle", user.user_id);
    } else {
      setDiscountSelectedUser(user);
      setDiscountSearch("");
      setDiscountSearchResults([]);
      void loadUserCoupons("discount", user.user_id);
    }
  };

  const clearUserForType = (type: CouponType) => {
    if (type === "raffle") {
      setRaffleSelectedUser(null);
      setRaffleUserCoupons([]);
    } else {
      setDiscountSelectedUser(null);
      setDiscountUserCoupons([]);
    }
  };

  // ── Campanhas (lotes) — Aba 3 ────────────────────────────────────────
  const handleCreateCampaign = async () => {
    if (!campaignForm.discount_percent || !campaignForm.total_quantity) {
      toast({ title: "Preencha a % de desconto e a quantidade total.", variant: "destructive" });
      return;
    }

    setSavingCampaign(true);
    try {
      const { error } = await supabase.from("coupon_campaigns" as never).insert({
        discount_percent: parseInt(campaignForm.discount_percent),
        total_quantity: parseInt(campaignForm.total_quantity),
        used_quantity: 0,
        min_purchase_value: campaignForm.min_purchase_value ? parseFloat(campaignForm.min_purchase_value) : 0,
        max_purchase_value: campaignForm.max_purchase_value ? parseFloat(campaignForm.max_purchase_value) : null,
        is_active: true,
      } as never);
      if (error) throw error;
      toast({ title: "Lote de Cupons criado com sucesso!" });
      setAddCampaignOpen(false);
      setCampaignForm({ discount_percent: "10", total_quantity: "100", min_purchase_value: "0", max_purchase_value: "" });
      void fetchData();
    } catch (err: unknown) {
      toast({
        title: "Erro ao criar lote",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
    setSavingCampaign(false);
  };

  const toggleCampaignStatus = async (id: string, currentStatus: boolean) => {
    try {
      await supabase
        .from("coupon_campaigns" as never)
        .update({ is_active: !currentStatus } as never)
        .eq("id", id);
      toast({ title: `Lote ${!currentStatus ? "ativado" : "pausado"}!` });
      void fetchData();
    } catch {
      toast({ title: "Erro ao alterar status", variant: "destructive" });
    }
  };

  const handleDeleteCampaign = async () => {
    if (!confirmDeleteCampaign) return;
    try {
      await supabase.from("coupon_campaigns" as never).delete().eq("id", confirmDeleteCampaign.id);
      toast({ title: "Lote apagado!" });
      setConfirmDeleteCampaign(null);
      void fetchData();
    } catch {
      toast({ title: "Erro ao apagar lote", variant: "destructive" });
    }
  };

  // ── Aba "Usuários": carregar todos os usuários + contagem de cupons ──
  const fetchUsersWithCoupons = useCallback(async () => {
    setUsersLoading(true);
    try {
      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, user_type")
        .order("created_at", { ascending: false })
        .limit(50000);
      if (profilesErr) throw profilesErr;

      // Cupons (paginar para suportar grandes volumes)
      type CouponRow = {
        user_id: string | null;
        coupon_type: string | null;
        used: boolean | null;
        expires_at: string | null;
      };
      const allCoupons: CouponRow[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("coupons")
          .select("user_id, coupon_type, used, expires_at")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const chunk = (data as CouponRow[] | null) || [];
        allCoupons.push(...chunk);
        if (chunk.length < PAGE) break;
        from += PAGE;
        if (from > 200000) break; // hard guard
      }

      const now = Date.now();
      const map = new Map<
        string,
        { total: number; raffle: number; discount: number; active: number }
      >();
      for (const c of allCoupons) {
        if (!c.user_id) continue;
        const cur = map.get(c.user_id) || { total: 0, raffle: 0, discount: 0, active: 0 };
        cur.total += 1;
        if (c.coupon_type === "raffle") cur.raffle += 1;
        else if (c.coupon_type === "discount") cur.discount += 1;
        const expired = c.expires_at ? new Date(c.expires_at).getTime() < now : false;
        if (!c.used && !expired) cur.active += 1;
        map.set(c.user_id, cur);
      }

      const profiles =
        (profilesData as {
          user_id: string | null;
          full_name: string | null;
          email: string | null;
          user_type: string | null;
        }[] | null) || [];

      const merged: UserWithCoupons[] = profiles
        .filter((p) => !!p.user_id)
        .map((p) => {
          const counts = map.get(p.user_id as string) || {
            total: 0,
            raffle: 0,
            discount: 0,
            active: 0,
          };
          return {
            user_id: p.user_id as string,
            full_name: p.full_name,
            email: p.email,
            user_type: p.user_type,
            total: counts.total,
            raffle: counts.raffle,
            discount: counts.discount,
            active: counts.active,
          };
        });

      setUsersList(merged);
      setUsersFetched(true);
    } catch (err: unknown) {
      toast({
        title: "Erro ao carregar usuários",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "users" && !usersFetched && !usersLoading) {
      void fetchUsersWithCoupons();
    }
  }, [activeTab, usersFetched, usersLoading, fetchUsersWithCoupons]);

  const filteredUsersList = useMemo(() => {
    const q = usersSearch.trim().toLowerCase();
    return usersList
      .filter((u) => {
        const safeType = u.user_type === "company" ? "professional" : u.user_type;
        if (usersTypeFilter === "client" && safeType !== "client") return false;
        if (usersTypeFilter === "professional" && safeType !== "professional") return false;
        return true;
      })
      .filter((u) => {
        if (usersHasCouponFilter === "with") return u.total > 0;
        if (usersHasCouponFilter === "without") return u.total === 0;
        return true;
      })
      .filter((u) => {
        if (!q) return true;
        return (
          (u.full_name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        switch (usersSortBy) {
          case "count_desc":
            return b.total - a.total || (a.full_name || "").localeCompare(b.full_name || "", "pt-BR");
          case "count_asc":
            return a.total - b.total || (a.full_name || "").localeCompare(b.full_name || "", "pt-BR");
          case "name_asc":
            return (a.full_name || "").localeCompare(b.full_name || "", "pt-BR");
          case "name_desc":
            return (b.full_name || "").localeCompare(a.full_name || "", "pt-BR");
          default:
            return 0;
        }
      });
  }, [usersList, usersSearch, usersTypeFilter, usersHasCouponFilter, usersSortBy]);

  const usersActiveFilterCount = useMemo(() => {
    let n = 0;
    if (usersTypeFilter !== "all") n += 1;
    if (usersHasCouponFilter !== "all") n += 1;
    if (usersSortBy !== "count_desc") n += 1;
    return n;
  }, [usersTypeFilter, usersHasCouponFilter, usersSortBy]);

  const clearUsersFilters = () => {
    setUsersTypeFilter("all");
    setUsersHasCouponFilter("all");
    setUsersSortBy("count_desc");
  };

  const openUserCouponsDialog = async (user: UserWithCoupons) => {
    setUserCouponsDialog(user);
    setUserCouponsAll([]);
    setUserCouponsAllLoading(true);
    const { data, error } = await supabase
      .from("coupons")
      .select("id, coupon_type, source, used, discount_percent, expires_at, created_at")
      .eq("user_id", user.user_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: "Erro ao carregar cupons", description: error.message, variant: "destructive" });
    }
    setUserCouponsAll((data as UserCoupon[]) || []);
    setUserCouponsAllLoading(false);
  };

  // ── UI helpers ────────────────────────────────────────────────────────
  const couponStatus = (c: UserCoupon): "used" | "expired" | "active" => {
    if (c.used) return "used";
    if (c.expires_at && new Date(c.expires_at) < new Date()) return "expired";
    return "active";
  };

  const renderUserCouponsList = (list: UserCoupon[], loading: boolean, type: CouponType) => {
    if (loading) {
      return (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="rounded-xl border border-dashed py-8 text-center">
          <Ticket className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            Nenhum cupom de {type === "raffle" ? "sorteio" : "desconto"} para este usuário.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Use o botão acima para distribuir um agora.</p>
        </div>
      );
    }
    const counts = {
      total: list.length,
      active: list.filter((c) => couponStatus(c) === "active").length,
      used: list.filter((c) => couponStatus(c) === "used").length,
      expired: list.filter((c) => couponStatus(c) === "expired").length,
    };
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg border bg-muted/30 px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-sm font-bold text-foreground">{counts.total}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wide text-emerald-600">Ativos</p>
            <p className="text-sm font-bold text-emerald-600">{counts.active}</p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wide text-primary">Usados</p>
            <p className="text-sm font-bold text-primary">{counts.used}</p>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wide text-destructive">Expirados</p>
            <p className="text-sm font-bold text-destructive">{counts.expired}</p>
          </div>
        </div>

        <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {list.map((c) => {
            const st = couponStatus(c);
            const statusBadge =
              st === "used" ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">
                  <Check className="w-3 h-3" /> Usado
                </span>
              ) : st === "expired" ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-destructive/10 text-destructive border border-destructive/20">
                  <Clock className="w-3 h-3" /> Expirado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  <Check className="w-3 h-3" /> Ativo
                </span>
              );
            return (
              <li
                key={c.id}
                className={`rounded-xl border p-3 ${
                  st === "active" ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {type === "discount" ? (
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary font-black text-xs">
                        {Number(c.discount_percent || 0)}%
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/10 text-amber-600">
                        <Ticket className="w-4 h-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        {type === "discount"
                          ? `Cupom de ${Number(c.discount_percent || 0)}% OFF`
                          : "Cupom de sorteio"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Origem: {sourceLabel(c.source)} · Recebido em {formatDateBR(c.created_at)}
                      </p>
                      {c.expires_at && (
                        <p className="text-[10px] text-muted-foreground">Validade: {formatDateTimeBR(c.expires_at)}</p>
                      )}
                    </div>
                  </div>
                  {statusBadge}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderUserSearchPanel = (type: CouponType) => {
    const search = type === "raffle" ? raffleSearch : discountSearch;
    const results = type === "raffle" ? raffleSearchResults : discountSearchResults;
    const selected = type === "raffle" ? raffleSelectedUser : discountSelectedUser;
    const list = type === "raffle" ? raffleUserCoupons : discountUserCoupons;
    const loadingList = type === "raffle" ? raffleUserLoading : discountUserLoading;

    return (
      <div className="bg-card border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Pesquisar cupons de um usuário</h3>
        </div>

        {!selected ? (
          <div className="relative">
            <input
              value={search}
              onChange={(e) => void searchUserForType(type, e.target.value)}
              placeholder="Nome ou e-mail do usuário…"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search.trim().length >= 2 && (
              <div className="mt-1 bg-card border rounded-xl shadow-sm max-h-56 overflow-y-auto">
                {results.length === 0 ? (
                  <p className="p-3 text-[11px] text-muted-foreground">Nenhum usuário encontrado.</p>
                ) : (
                  results.map((u) => (
                    <button
                      key={u.user_id}
                      type="button"
                      onClick={() => selectUserForType(type, u)}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-0"
                    >
                      <p className="text-sm font-medium text-foreground">{u.full_name || "Sem nome"}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {u.email} · {userTypeLabel(u.user_type)}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-primary/5 border-primary/30">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {(selected.full_name || selected.email || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{selected.full_name || "Sem nome"}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {selected.email} · {userTypeLabel(selected.user_type)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => clearUserForType(type)}
                className="text-xs text-destructive hover:underline shrink-0"
              >
                Trocar
              </button>
            </div>

            {renderUserCouponsList(list, loadingList, type)}
          </>
        )}
      </div>
    );
  };

  return (
    <AdminLayout title="Cupons & Sorteios">
      {/* ─── Stats globais ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <Ticket className="w-5 h-5 text-amber-600" />
            <span className="text-[10px] font-semibold text-muted-foreground">Sorteio</span>
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">{counts.raffleTotal.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{counts.raffleUnused.toLocaleString("pt-BR")}</span>{" "}
            disponíveis para sorteio
          </p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <Percent className="w-5 h-5 text-emerald-600" />
            <span className="text-[10px] font-semibold text-muted-foreground">Desconto</span>
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">{counts.discountTotal.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{counts.discountActive.toLocaleString("pt-BR")}</span>{" "}
            ativos (não usados / não expirados)
          </p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <Trophy className="w-5 h-5" style={{ color: "hsl(var(--warning))" }} />
            <span className="text-[10px] font-semibold text-muted-foreground">Sorteios</span>
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">{counts.drawn}</p>
          <p className="text-xs text-muted-foreground">sorteios realizados</p>
        </div>
      </div>

      {/* ─── Tabs ─────────────────────────────────────────────────── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto p-1 bg-muted gap-1">
          <TabsTrigger value="raffle_coupons" className="flex items-center gap-1.5 py-2.5 text-xs sm:text-sm">
            <Ticket className="w-4 h-4" />
            <span className="hidden sm:inline">Cupom de sorteio</span>
            <span className="sm:hidden">Sorteio</span>
          </TabsTrigger>
          <TabsTrigger value="discount_coupons" className="flex items-center gap-1.5 py-2.5 text-xs sm:text-sm">
            <Percent className="w-4 h-4" />
            <span className="hidden sm:inline">Cupom de desconto</span>
            <span className="sm:hidden">Desconto</span>
          </TabsTrigger>
          <TabsTrigger value="auto" className="flex items-center gap-1.5 py-2.5 text-xs sm:text-sm">
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">Distribuição automática</span>
            <span className="sm:hidden">Automática</span>
          </TabsTrigger>
          <TabsTrigger value="raffles" className="flex items-center gap-1.5 py-2.5 text-xs sm:text-sm">
            <Trophy className="w-4 h-4" />
            Sorteio
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5 py-2.5 text-xs sm:text-sm">
            <Users className="w-4 h-4" />
            Usuários
          </TabsTrigger>
        </TabsList>

        {/* ───────────────  Aba 1: Cupom de sorteio  ─────────────── */}
        <TabsContent value="raffle_coupons" className="mt-5 space-y-4">
          <div className="bg-card border rounded-xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-amber-600" /> Cupons de sorteio
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cada cupom é uma "ficha" que entra nos sorteios mensais. Distribua para usuários específicos,
                  para um aleatório ou em massa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openDistribute("raffle")}
                className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90"
              >
                <Send className="w-4 h-4" /> Distribuir cupom
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total emitidos</p>
                <p className="text-xl font-bold text-foreground">{counts.raffleTotal.toLocaleString("pt-BR")}</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-amber-700">Disponíveis (não sorteados)</p>
                <p className="text-xl font-bold text-amber-700">{counts.raffleUnused.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </div>

          {renderUserSearchPanel("raffle")}
        </TabsContent>

        {/* ───────────────  Aba 2: Cupom de desconto  ────────────── */}
        <TabsContent value="discount_coupons" className="mt-5 space-y-4">
          <div className="bg-card border rounded-xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Percent className="w-4 h-4 text-emerald-600" /> Cupons de desconto
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cada cupom dá um % de desconto no próximo pagamento, dentro da validade.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openDistribute("discount")}
                className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90"
              >
                <Send className="w-4 h-4" /> Distribuir cupom
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total emitidos</p>
                <p className="text-xl font-bold text-foreground">{counts.discountTotal.toLocaleString("pt-BR")}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-emerald-700">Ativos (não usados/expirados)</p>
                <p className="text-xl font-bold text-emerald-700">{counts.discountActive.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </div>

          {renderUserSearchPanel("discount")}
        </TabsContent>

        {/* ───────────────  Aba 3: Distribuição automática  ──────── */}
        <TabsContent value="auto" className="mt-5 space-y-4">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
            <h3 className="font-bold text-primary mb-1 flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Controle Geral de Entregas
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Ligue ou desligue a entrega automática de cupons que acontece nos pagamentos ou cadastros do aplicativo.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-card border rounded-xl">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">🎟️ Cupons de Sorteio</p>
                  <p className="text-[10px] text-muted-foreground">
                    O app pode entregar cupons para sorteios mensais automaticamente (após pagamentos)?
                  </p>
                </div>
                <button
                  onClick={() => toggleGlobalSetting("auto_raffle_active", globalSettings.auto_raffle)}
                  className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                    globalSettings.auto_raffle ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                      globalSettings.auto_raffle ? "left-7" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-card border rounded-xl">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">🎉 Cupons de Desconto (Lotes)</p>
                  <p className="text-[10px] text-muted-foreground">
                    O app pode puxar cupons dos lotes abaixo e entregar aos clientes?
                  </p>
                </div>
                <button
                  onClick={() => toggleGlobalSetting("auto_discount_active", globalSettings.auto_discount)}
                  className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                    globalSettings.auto_discount ? "bg-emerald-500" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                      globalSettings.auto_discount ? "left-7" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-card border rounded-xl">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">🎁 Cupom de cadastro (código de convite)</p>
                  <p className="text-[10px] text-muted-foreground">
                    Indicado: +1 cupom de sorteio ao usar código válido (até o limite mensal). Indicador: +1 cupom de
                    sorteio. Sem cupom de desconto pelo programa de indicação.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleGlobalSetting("referral_signup_coupon_active", globalSettings.signup_coupon)}
                  className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                    globalSettings.signup_coupon ? "bg-violet-500" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                      globalSettings.signup_coupon ? "left-7" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {globalSettings.signup_coupon && (
                <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 space-y-3">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Limite mensal (UTC):</strong> máximo de{" "}
                    <strong>indicados</strong> distintos que recebem o cupom extra de sorteio por mês. O indicador
                    sempre recebe +1 sorteio quando o código é usado com sucesso.
                  </p>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                      Máximo de indicados premiados por mês (cupom extra de sorteio)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={signupCouponMonthlyCap}
                      onChange={(e) => setSignupCouponMonthlyCap(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={savingSignupCoupon}
                    onClick={() => void saveSignupCouponSettings()}
                    className="w-full py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-600/90 disabled:opacity-50"
                  >
                    {savingSignupCoupon ? "Salvando…" : "Salvar cupom de cadastro"}
                  </button>
                </div>
              )}

              <div className="p-3 bg-card border rounded-xl space-y-2 mt-3">
                <p className="text-sm font-semibold text-foreground">Indique e ganhe — quem compartilha o código</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Com código válido e cadastro concluído, <strong>indicador</strong> e <strong>indicado</strong>{" "}
                  ganham cada um <strong>+1 cupom de sorteio</strong>. Não há cupom de desconto automático por
                  indicação (comissão de assinatura continua separada, se aplicável).
                </p>
              </div>
            </div>
          </div>

          {/* Validade padrão dos cupons de desconto */}
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Validade padrão dos cupons de desconto</h3>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Quantos dias o cupom de desconto distribuído pelo app (lotes, indicação) vale antes de expirar.
              Cupons criados manualmente nas Abas 1/2 podem usar uma validade própria por envio.
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-medium text-muted-foreground block mb-1">Dias de validade</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={discountValidityDays}
                  onChange={(e) => setDiscountValidityDays(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                />
              </div>
              <button
                type="button"
                disabled={savingValidity}
                onClick={() => void saveValidityDays()}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {savingValidity ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>

          {/* Lotes */}
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Lotes de Desconto</h3>
                <p className="text-xs text-muted-foreground">
                  Estoque que o app puxa para distribuir descontos automaticamente.
                </p>
              </div>
              <button
                onClick={() => setAddCampaignOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" /> Novo Lote
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12 border rounded-xl border-dashed">
                <Percent className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">Nenhum lote criado</p>
                <p className="text-xs text-muted-foreground">Crie lotes para a plataforma distribuir descontos.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {campaigns.map((camp) => {
                  const used = camp.used_quantity ?? 0;
                  const total = camp.total_quantity ?? 0;
                  const remaining = Math.max(0, total - used);
                  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                  const isEsgotado = remaining <= 0;
                  return (
                    <div
                      key={camp.id}
                      className={`border rounded-xl p-4 transition-all ${
                        !camp.is_active || isEsgotado ? "opacity-70" : ""
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shrink-0 ${
                              camp.is_active && !isEsgotado
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {camp.discount_percent}%
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-foreground">Lote de {camp.discount_percent}% OFF</p>
                              {!camp.is_active ? (
                                <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                                  Pausado
                                </span>
                              ) : isEsgotado ? (
                                <span className="px-2 py-0.5 rounded-md bg-destructive/10 text-destructive text-[10px] font-bold uppercase tracking-wider">
                                  Esgotado
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[10px] font-bold uppercase tracking-wider">
                                  Ativo
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Entregues: <span className="font-bold text-foreground">{used}</span> de {total}{" "}
                              <span className="text-muted-foreground/70">·</span>{" "}
                              <span className="font-semibold text-foreground">{remaining}</span> em estoque
                            </p>
                            <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                              Pagamentos a partir de R$ {Number(camp.min_purchase_value || 0).toFixed(2)}
                              {camp.max_purchase_value
                                ? ` até R$ ${Number(camp.max_purchase_value).toFixed(2)}`
                                : " (sem teto)"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => toggleCampaignStatus(camp.id, camp.is_active)}
                            className="flex-1 sm:flex-none flex items-center justify-center p-2 rounded-lg bg-accent hover:bg-accent/80 transition-colors text-muted-foreground"
                            title={camp.is_active ? "Pausar Lote" : "Ativar Lote"}
                          >
                            {camp.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4 text-emerald-600" />}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteCampaign(camp)}
                            className="flex-1 sm:flex-none flex items-center justify-center p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors text-destructive"
                            title="Apagar Lote"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Barra de progresso */}
                      <div className="mt-3">
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${
                              isEsgotado ? "bg-destructive" : camp.is_active ? "bg-primary" : "bg-muted-foreground/40"
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{percent}% utilizado</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ───────────────  Aba 4: Sorteio  ──────────────────────── */}
        <TabsContent value="raffles" className="mt-5 space-y-4">
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" /> Sorteios
                </h3>
                <p className="text-xs text-muted-foreground">
                  Crie sorteios e sorteie um ganhador entre todos os cupons de sorteio disponíveis.
                </p>
              </div>
              <button
                onClick={() => setDialogOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" /> Novo sorteio
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : raffles.length === 0 ? (
              <div className="text-center py-12 border rounded-xl border-dashed">
                <Trophy className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">Nenhum sorteio criado</p>
                <p className="text-xs text-muted-foreground">Crie um sorteio para sortear um ganhador.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {raffles.map((r) => (
                  <li
                    key={r.id}
                    className="border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {formatDateBR(r.draw_date)}
                      </p>
                      {r.winner_user_id && (
                        <p className="text-xs text-emerald-600 mt-0.5 font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Sorteado
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.status === "upcoming" ? (
                        <button
                          onClick={() => openDraw(r.id)}
                          className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                        >
                          <Shuffle className="w-3.5 h-3.5" /> Sortear agora
                        </button>
                      ) : (
                        <button
                          onClick={() => handleViewWinner(r.winner_user_id)}
                          className="flex items-center gap-1 px-4 py-2 rounded-xl bg-accent border text-foreground text-xs font-bold hover:bg-muted transition-colors"
                        >
                          <User className="w-3.5 h-3.5" /> Ver Ganhador
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDeleteRaffle(r)}
                        className="flex items-center justify-center p-2 rounded-xl bg-destructive/10 hover:bg-destructive/20 transition-colors text-destructive"
                        title="Excluir sorteio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        {/* ───────────────  Aba 5: Usuários  ─────────────────────── */}
        <TabsContent value="users" className="mt-5 space-y-4">
          <div className="bg-card border rounded-xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Usuários e seus cupons
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Veja todos os usuários da plataforma e quantos cupons cada um possui. Clique no número
                  de cupons para ver detalhes (validade, status).
                </p>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
              <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                  placeholder="Buscar por nome ou email..."
                  className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="button"
                onClick={() => setUsersFiltersOpen((o) => !o)}
                className={`relative inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                  usersFiltersOpen || usersActiveFilterCount > 0
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground hover:bg-muted"
                }`}
              >
                <Filter className="w-4 h-4" />
                Filtros
                {usersActiveFilterCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-bold w-5 h-5">
                    {usersActiveFilterCount}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${usersFiltersOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>

            {usersFiltersOpen && (
              <div className="border rounded-xl p-3 mb-3 bg-muted/30 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Tipo
                    </label>
                    <select
                      value={usersTypeFilter}
                      onChange={(e) => setUsersTypeFilter(e.target.value as UsersTypeFilter)}
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 text-foreground cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      <option value="client">Cliente</option>
                      <option value="professional">Profissional</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Cupons
                    </label>
                    <select
                      value={usersHasCouponFilter}
                      onChange={(e) =>
                        setUsersHasCouponFilter(e.target.value as UsersHasCouponFilter)
                      }
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 text-foreground cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      <option value="with">Com cupom</option>
                      <option value="without">Sem cupom</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Ordenar
                    </label>
                    <select
                      value={usersSortBy}
                      onChange={(e) => setUsersSortBy(e.target.value as UsersSortBy)}
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 text-foreground cursor-pointer"
                    >
                      <option value="count_desc">Cupons ↓ (maior → menor)</option>
                      <option value="count_asc">Cupons ↑ (menor → maior)</option>
                      <option value="name_asc">Nome A → Z</option>
                      <option value="name_desc">Nome Z → A</option>
                    </select>
                  </div>
                </div>
                {usersActiveFilterCount > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={clearUsersFilters}
                      className="text-xs font-semibold text-destructive hover:underline"
                    >
                      Limpar filtros
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="rounded-lg border bg-muted/30 px-2 py-1.5 text-center">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Usuários</p>
                <p className="text-sm font-bold text-foreground">
                  {filteredUsersList.length.toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-center">
                <p className="text-[9px] uppercase tracking-wide text-emerald-600">Com cupons</p>
                <p className="text-sm font-bold text-emerald-600">
                  {filteredUsersList.filter((u) => u.total > 0).length.toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="rounded-lg border border-muted-foreground/15 bg-muted/30 px-2 py-1.5 text-center">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Sem cupons</p>
                <p className="text-sm font-bold text-foreground">
                  {filteredUsersList.filter((u) => u.total === 0).length.toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5 text-center">
                <p className="text-[9px] uppercase tracking-wide text-primary">Cupons (soma)</p>
                <p className="text-sm font-bold text-primary">
                  {filteredUsersList
                    .reduce((sum, u) => sum + u.total, 0)
                    .toLocaleString("pt-BR")}
                </p>
              </div>
            </div>

            {/* Tabela */}
            {usersLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="bg-card border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Cupons</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsersList.map((u) => {
                        const safeType = u.user_type === "company" ? "professional" : u.user_type;
                        const typeLabel =
                          safeType === "client"
                            ? "Cliente"
                            : safeType === "professional"
                            ? "Profissional"
                            : userTypeLabel(u.user_type);
                        return (
                          <tr
                            key={u.user_id}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="p-3 font-medium text-foreground">
                              {u.full_name || "—"}
                            </td>
                            <td className="p-3 text-muted-foreground">{u.email || "—"}</td>
                            <td className="p-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                                  safeType === "professional"
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                    : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                }`}
                              >
                                {safeType === "professional" ? (
                                  <Briefcase className="w-3 h-3" />
                                ) : (
                                  <UserRound className="w-3 h-3" />
                                )}
                                {typeLabel}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => void openUserCouponsDialog(u)}
                                disabled={u.total === 0}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                  u.total > 0
                                    ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                                    : "bg-muted text-muted-foreground cursor-not-allowed"
                                }`}
                                title={
                                  u.total > 0
                                    ? "Ver detalhes dos cupons"
                                    : "Usuário sem cupons"
                                }
                              >
                                <Ticket className="w-3.5 h-3.5" />
                                {u.total.toLocaleString("pt-BR")}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredUsersList.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-8 text-center text-muted-foreground text-sm"
                          >
                            Nenhum usuário encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Modal: Novo sorteio ─────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo sorteio mensal</DialogTitle>
            <DialogDescription>Defina o título e a data prevista. Você sorteia o ganhador quando quiser.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Sorteio de Dezembro"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Data prevista do sorteio</label>
              <input
                type="date"
                value={form.draw_date}
                onChange={(e) => setForm((f) => ({ ...f, draw_date: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              onClick={handleCreateRaffle}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Criar sorteio
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Realizar sorteio ────────────────────────────── */}
      <Dialog open={drawDialogOpen} onOpenChange={setDrawDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shuffle className="w-5 h-5 text-primary" /> Realizar sorteio
            </DialogTitle>
            {!winnerName && (
              <DialogDescription>Escolha o público entre os cupons de sorteio disponíveis.</DialogDescription>
            )}
          </DialogHeader>

          {winnerName ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
                <Trophy className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">🎉 Ganhador:</p>
              <p className="text-lg font-bold text-primary">{winnerName}</p>
              <p className="text-xs text-muted-foreground text-center">
                O ganhador foi notificado automaticamente.
              </p>
              <button
                onClick={() => setDrawDialogOpen(false)}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors mt-2"
              >
                Fechar
              </button>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Sortear entre:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { value: "all", label: "Todos", icon: Users },
                      { value: "clients", label: "Clientes", icon: UserRound },
                      { value: "professionals", label: "Profissionais", icon: Briefcase },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDrawAudience(opt.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-colors text-center ${
                        drawAudience === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <opt.icon className="w-4 h-4 text-primary" />
                      <p className="text-[11px] font-semibold text-foreground">{opt.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-dashed p-3 text-[11px] text-muted-foreground">
                Apenas cupons <strong>não sorteados</strong> entram no pool. Profissionais inclui empresas (
                <code className="text-[10px]">user_type</code> = professional/company).
              </div>

              <button
                onClick={handleDraw}
                disabled={drawing}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {drawing ? "Sorteando..." : "Sortear agora 🎲"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Dados do ganhador ───────────────────────────── */}
      <Dialog open={winnerInfoOpen} onOpenChange={setWinnerInfoOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Trophy className="w-5 h-5" /> Dados do Ganhador
            </DialogTitle>
          </DialogHeader>
          {winnerData ? (
            <div className="space-y-4 pt-2">
              <div className="bg-muted/50 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Nome Completo</p>
                    <p className="text-sm font-bold text-foreground">{winnerData.full_name || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t pt-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="text-sm font-semibold text-foreground">{winnerData.phone || "Não cadastrado"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t pt-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="text-sm font-medium text-foreground">{winnerData.email || "—"}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setWinnerInfoOpen(false)}
                className="w-full py-2.5 rounded-xl border font-semibold text-sm hover:bg-muted transition-colors"
              >
                Fechar
              </button>
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Confirmar exclusão de sorteio ───────────────── */}
      <Dialog open={!!confirmDeleteRaffle} onOpenChange={(open) => !open && setConfirmDeleteRaffle(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Excluir sorteio
            </DialogTitle>
            <DialogDescription>
              Você está prestes a excluir o sorteio <strong>{confirmDeleteRaffle?.title}</strong>.
              Os cupons que estavam amarrados a ele voltam para o estoque (raffle_id volta para NULL).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              disabled={deletingRaffle}
              onClick={() => setConfirmDeleteRaffle(null)}
              className="py-2.5 rounded-xl border font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={deletingRaffle}
              onClick={() => void handleDeleteRaffle()}
              className="py-2.5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {deletingRaffle ? "Excluindo…" : "Excluir"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Novo lote de cupons ─────────────────────────── */}
      <Dialog open={addCampaignOpen} onOpenChange={setAddCampaignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" /> Criar Lote de Descontos
            </DialogTitle>
            <DialogDescription>
              A plataforma distribuirá estes cupons automaticamente após pagamentos bem sucedidos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Desconto (%)</label>
                <input
                  type="number"
                  value={campaignForm.discount_percent}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, discount_percent: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Quantidade total</label>
                <input
                  type="number"
                  value={campaignForm.total_quantity}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, total_quantity: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-xl border border-muted space-y-3">
              <p className="text-xs font-bold text-foreground">Regras de Utilização</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Valor mínimo do serviço (R$)
                </label>
                <input
                  type="number"
                  value={campaignForm.min_purchase_value}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, min_purchase_value: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Valor máximo (Opcional, R$)
                </label>
                <input
                  type="number"
                  value={campaignForm.max_purchase_value}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, max_purchase_value: e.target.value }))}
                  placeholder="Sem limite"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:border-primary"
                />
              </div>
            </div>

            <button
              onClick={handleCreateCampaign}
              disabled={savingCampaign}
              className="w-full py-3 mt-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingCampaign ? "Salvando..." : "Lançar Lote na Plataforma"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Confirmar exclusão de lote ──────────────────── */}
      <Dialog open={!!confirmDeleteCampaign} onOpenChange={(open) => !open && setConfirmDeleteCampaign(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Apagar lote
            </DialogTitle>
            <DialogDescription>
              Apagar o lote de <strong>{confirmDeleteCampaign?.discount_percent}% OFF</strong>? Cupons já entregues a
              partir dele não são afetados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => setConfirmDeleteCampaign(null)}
              className="py-2.5 rounded-xl border font-semibold text-sm hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteCampaign()}
              className="py-2.5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm hover:bg-destructive/90 transition-colors"
            >
              Apagar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Distribuir cupom (compartilhado) ────────────── */}
      <Dialog open={distributeOpen} onOpenChange={setDistributeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {distributeType === "raffle" ? (
                <Ticket className="w-5 h-5 text-amber-600" />
              ) : (
                <Percent className="w-5 h-5 text-emerald-600" />
              )}
              Distribuir cupom de {distributeType === "raffle" ? "sorteio" : "desconto"}
            </DialogTitle>
            <DialogDescription>
              Escolha entre envio individual, aleatório ou em massa. O destinatário recebe uma notificação automática.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo de distribuição</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setDistributeForm((f) => ({ ...f, target: "individual" }));
                    setDistributeSelectedUser(null);
                  }}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${
                    distributeForm.target === "individual" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <Search className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Pesquisar usuário</p>
                </button>
                <button
                  onClick={() => setDistributeForm((f) => ({ ...f, target: "random" }))}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${
                    distributeForm.target === "random" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <Shuffle className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Aleatório</p>
                </button>
              </div>

              <div className="mt-3 pt-3 border-t">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Megaphone className="w-3 h-3" /> Em massa
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setDistributeForm((f) => ({ ...f, target: "all" }))}
                    className={`p-3 rounded-xl border-2 text-center transition-colors ${
                      distributeForm.target === "all" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <Users className="w-5 h-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs font-semibold text-foreground">Todos</p>
                  </button>
                  <button
                    onClick={() => setDistributeForm((f) => ({ ...f, target: "professionals" }))}
                    className={`p-3 rounded-xl border-2 text-center transition-colors ${
                      distributeForm.target === "professionals" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <Briefcase className="w-5 h-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs font-semibold text-foreground">Profissionais</p>
                  </button>
                  <button
                    onClick={() => setDistributeForm((f) => ({ ...f, target: "clients" }))}
                    className={`p-3 rounded-xl border-2 text-center transition-colors ${
                      distributeForm.target === "clients" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <UserRound className="w-5 h-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs font-semibold text-foreground">Clientes</p>
                  </button>
                </div>
              </div>
            </div>

            {distributeForm.target === "individual" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Buscar usuário</label>
                <input
                  value={distributeUserSearch}
                  onChange={(e) => searchDistributeUsers(e.target.value)}
                  placeholder="Nome ou email..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
                {distributeSelectedUser && (
                  <div className="mt-2 flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl p-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {(distributeSelectedUser.full_name || distributeSelectedUser.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{distributeSelectedUser.full_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{distributeSelectedUser.email}</p>
                    </div>
                    <button
                      onClick={() => setDistributeSelectedUser(null)}
                      className="text-xs text-destructive font-medium"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {!distributeSelectedUser && distributeUserResults.length > 0 && (
                  <div className="mt-2 border rounded-xl divide-y max-h-40 overflow-y-auto">
                    {distributeUserResults.map((u) => (
                      <button
                        key={u.user_id}
                        onClick={() => {
                          setDistributeSelectedUser(u);
                          setDistributeUserResults([]);
                        }}
                        className="w-full flex items-center gap-2 p-2.5 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                          {(u.full_name || u.email || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{u.full_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <span className="text-[9px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                          {userTypeLabel(u.user_type)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {distributeForm.target === "random" && (
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Shuffle className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Um usuário será sorteado aleatoriamente entre todos.</p>
              </div>
            )}

            {(distributeForm.target === "all" ||
              distributeForm.target === "professionals" ||
              distributeForm.target === "clients") && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                <Megaphone className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground">Envio em massa</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Cada {targetLabel.replace("todos os ", "").replace(/s$/, "")} receberá <strong>1 cupom</strong> e
                    uma notificação. Essa ação <strong>não pode ser desfeita</strong>.
                  </p>
                </div>
              </div>
            )}

            {distributeType === "discount" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">% de desconto</label>
                  <input
                    type="number"
                    value={distributeForm.discount_percent}
                    onChange={(e) => setDistributeForm((f) => ({ ...f, discount_percent: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Validade (dias)</label>
                  <input
                    type="number"
                    value={distributeForm.expires_days}
                    onChange={(e) => setDistributeForm((f) => ({ ...f, expires_days: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}

            <button
              onClick={() => {
                if (
                  distributeForm.target === "all" ||
                  distributeForm.target === "professionals" ||
                  distributeForm.target === "clients"
                ) {
                  void requestBroadcast();
                } else {
                  void handleAddCoupon();
                }
              }}
              disabled={addingCoupon}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {addingCoupon
                ? "Adicionando..."
                : distributeForm.target === "random"
                ? "Sortear e enviar"
                : distributeForm.target === "all" ||
                  distributeForm.target === "professionals" ||
                  distributeForm.target === "clients"
                ? `Enviar para ${targetLabel}`
                : "Enviar cupom"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Confirmação de envio em massa ───────────────── */}
      <Dialog open={broadcastConfirmOpen} onOpenChange={(open) => { if (!addingCoupon) setBroadcastConfirmOpen(open); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Megaphone className="w-5 h-5" /> Confirmar envio em massa
            </DialogTitle>
            <DialogDescription>
              Você está prestes a enviar um cupom para <strong>{targetLabel}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-muted/50 border rounded-xl p-4 text-center">
              {loadingBroadcastCount ? (
                <div className="flex items-center justify-center gap-2 py-4">
                  <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                  <p className="text-xs text-muted-foreground">Calculando destinatários...</p>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-black text-primary">
                    {(broadcastTargetCount ?? 0).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {distributeForm.target === "all"
                      ? "usuários"
                      : distributeForm.target === "professionals"
                      ? "profissionais"
                      : "clientes"}{" "}
                    receberão o cupom
                  </p>
                </>
              )}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-[11px] text-muted-foreground">
              <strong className="text-foreground">Tipo:</strong>{" "}
              {distributeType === "raffle"
                ? "Cupom de sorteio"
                : `Cupom de ${distributeForm.discount_percent}% de desconto`}
              {distributeType === "discount" && (
                <>
                  <br />
                  <strong className="text-foreground">Validade:</strong> {distributeForm.expires_days} dias
                </>
              )}
              <br />
              <span className="text-amber-700 dark:text-amber-400">Esta ação não pode ser desfeita.</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={addingCoupon}
                onClick={() => setBroadcastConfirmOpen(false)}
                className="py-2.5 rounded-xl border font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                disabled={addingCoupon || loadingBroadcastCount || !broadcastTargetCount}
                onClick={() => void handleAddCoupon()}
                className="py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {addingCoupon ? "Enviando..." : "Confirmar envio"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Cupons do usuário (vindo da Aba Usuários) ───── */}
      <Dialog
        open={!!userCouponsDialog}
        onOpenChange={(open) => {
          if (!open) {
            setUserCouponsDialog(null);
            setUserCouponsAll([]);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-primary" /> Cupons do usuário
            </DialogTitle>
            <DialogDescription>
              {userCouponsDialog?.full_name || "Sem nome"}
              {userCouponsDialog?.email ? ` · ${userCouponsDialog.email}` : ""}
            </DialogDescription>
          </DialogHeader>

          {userCouponsAllLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : userCouponsAll.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center">
              <Ticket className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Nenhum cupom para este usuário.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg border bg-muted/30 px-2 py-1.5 text-center">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Total</p>
                  <p className="text-sm font-bold text-foreground">{userCouponsAll.length}</p>
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-center">
                  <p className="text-[9px] uppercase tracking-wide text-emerald-600">Ativos</p>
                  <p className="text-sm font-bold text-emerald-600">
                    {userCouponsAll.filter((c) => couponStatus(c) === "active").length}
                  </p>
                </div>
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5 text-center">
                  <p className="text-[9px] uppercase tracking-wide text-primary">Usados</p>
                  <p className="text-sm font-bold text-primary">
                    {userCouponsAll.filter((c) => couponStatus(c) === "used").length}
                  </p>
                </div>
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-center">
                  <p className="text-[9px] uppercase tracking-wide text-destructive">Expirados</p>
                  <p className="text-sm font-bold text-destructive">
                    {userCouponsAll.filter((c) => couponStatus(c) === "expired").length}
                  </p>
                </div>
              </div>

              {/* Resumo por tipo */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    <Ticket className="w-3.5 h-3.5" /> Sorteio
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {userCouponsAll.filter((c) => c.coupon_type === "raffle").length}
                  </span>
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <Percent className="w-3.5 h-3.5" /> Desconto
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {userCouponsAll.filter((c) => c.coupon_type === "discount").length}
                  </span>
                </div>
              </div>

              {/* Lista */}
              <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {userCouponsAll.map((c) => {
                  const st = couponStatus(c);
                  const isDiscount = c.coupon_type === "discount";
                  const statusBadge =
                    st === "used" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">
                        <Check className="w-3 h-3" /> Usado
                      </span>
                    ) : st === "expired" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-destructive/10 text-destructive border border-destructive/20">
                        <Clock className="w-3 h-3" /> Expirado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        <Check className="w-3 h-3" /> Ativo
                      </span>
                    );
                  return (
                    <li
                      key={c.id}
                      className={`rounded-xl border p-3 ${
                        st === "active" ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isDiscount ? (
                            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary font-black text-xs">
                              {Number(c.discount_percent || 0)}%
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/10 text-amber-600">
                              <Ticket className="w-4 h-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground">
                              {isDiscount
                                ? `Cupom de ${Number(c.discount_percent || 0)}% OFF`
                                : "Cupom de sorteio"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Origem: {sourceLabel(c.source)} · Recebido em {formatDateBR(c.created_at)}
                            </p>
                            {c.expires_at && (
                              <p className="text-[10px] text-muted-foreground">
                                Validade: {formatDateTimeBR(c.expires_at)}
                              </p>
                            )}
                          </div>
                        </div>
                        {statusBadge}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCoupons;
