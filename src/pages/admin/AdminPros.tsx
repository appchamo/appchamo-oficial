import AdminLayout from "@/components/AdminLayout";
import { BadgeCheck, Star, MoreHorizontal, Search, CheckCircle, XCircle, Eye, FileText, ChevronDown, Gift, EyeOff, Phone, ExternalLink, Trash2, MapPin, CreditCard, AlertTriangle, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Professional {
  id: string;
  user_id: string;
  category_id: string | null;
  bio: string | null;
  rating: number;
  total_services: number;
  total_reviews: number;
  verified: boolean;
  active: boolean;
  profile_status: string;
  availability_status: string;
  bonus_calls: number;
  created_at: string;
  full_name: string;
  email: string;
  category_name: string;
  plan_id: string;
  calls_used: number;
  max_calls: number;
  city: string | null;
  state: string | null;
  subscription_status?: string;
}

interface Category {
  id: string;
  name: string;
}

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: "Em análise", cls: "bg-muted text-muted-foreground" },
  approved: { label: "Aprovado", cls: "bg-primary/10 text-primary" },
  rejected: { label: "Reprovado", cls: "bg-destructive/10 text-destructive" },
};

const availabilityBadge: Record<string, { label: string; cls: string }> = {
  available: { label: "Disponível", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  quotes_only: { label: "Só orçamentos", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  busy: { label: "Agenda fechada", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  unavailable: { label: "Indisponível", cls: "bg-destructive/10 text-destructive" },
};

// Componente auxiliar para buscar dados da assinatura (CNPJ e Endereço)
const SubscriptionDoc = ({ userId }: { userId: string }) => {
  const [subDoc, setSubDoc] = useState<{url: string, address: string} | null>(null);

  useEffect(() => {
    const fetchSub = async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("business_proof_url, business_address")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) setSubDoc({ url: data.business_proof_url, address: data.business_address });
    };
    fetchSub();
  }, [userId]);

  if (!subDoc?.url) return <p className="text-[10px] text-muted-foreground italic">Carregando dados empresariais...</p>;

  return (
    <div className="space-y-2">
      <a href={subDoc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-bold text-violet-700 hover:underline">
        <FileText className="w-4 h-4" /> Visualizar Cartão CNPJ
      </a>
      {subDoc.address && (
        <p className="text-[10px] text-muted-foreground flex items-start gap-1">
          <MapPin className="w-3 h-3 mt-0.5 text-violet-500" /> {subDoc.address}
        </p>
      )}
    </div>
  );
};

const AdminPros = () => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [pros, setPros] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailPro, setDetailPro] = useState<Professional | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [processingSub, setProcessingSub] = useState<string | null>(null);
  const [showForceApproveForUserId, setShowForceApproveForUserId] = useState<string | null>(null);

  // Estados para o Modal de Recusa de Assinatura
  const [rejectSubOpen, setRejectSubOpen] = useState(false);
  const [rejectSubPro, setRejectSubPro] = useState<Professional | null>(null);
  const [rejectSubReason, setRejectSubReason] = useState("");

  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusTarget, setBonusTarget] = useState<"individual" | "category">("individual");
  const [bonusProId, setBonusProId] = useState<string>("");
  const [bonusCategoryId, setBonusCategoryId] = useState<string>("");
  const [bonusAmount, setBonusAmount] = useState("10");
  const [bonusSaving, setBonusSaving] = useState(false);

  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [reviewsPro, setReviewsPro] = useState<Professional | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  const fetchCategories = async () => {
    const { data } = await supabase.from("categories").select("id, name").eq("active", true).order("sort_order");
    setCategories(data || []);
  };

  const fetchPros = async () => {
    const { data: professionals } = await supabase
      .from("professionals")
      .select("*, categories(name)")
      .order("created_at", { ascending: false });

    if (!professionals || professionals.length === 0) {
      setPros([]);
      setLoading(false);
      return;
    }

    const userIds = professionals.map((p) => p.user_id);
    const proIds = professionals.map((p) => p.id);

    const [profilesRes, subsRes, callsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, address_city, address_state").in("user_id", userIds),
      supabase.from("subscriptions").select("user_id, plan_id, status").in("user_id", userIds),
      supabase.from("service_requests").select("professional_id").in("professional_id", proIds),
    ]);

    const profileMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
    const subsMap = new Map((subsRes.data || []).map((s) => [s.user_id, { plan_id: s.plan_id, status: s.status }]));
    
    const callCountMap = new Map<string, number>();
    (callsRes.data || []).forEach((r: any) => {
      callCountMap.set(r.professional_id, (callCountMap.get(r.professional_id) || 0) + 1);
    });

    setPros(
      professionals.map((p) => {
        const subInfo = subsMap.get(p.user_id) || { plan_id: "free", status: null };
        return {
          ...p,
          bonus_calls: (p as any).bonus_calls || 0,
          availability_status: (p as any).availability_status || "available",
          full_name: profileMap.get(p.user_id)?.full_name || "—",
          email: profileMap.get(p.user_id)?.email || "—",
          category_name: (p.categories as any)?.name || "—",
          plan_id: subInfo.plan_id,
          subscription_status: subInfo.status,
          calls_used: callCountMap.get(p.id) || 0,
          max_calls: 3,
          city: profileMap.get(p.user_id)?.address_city || null,
          state: profileMap.get(p.user_id)?.address_state || null,
        }
      })
    );
    setLoading(false);
  };

  useEffect(() => { fetchPros(); fetchCategories(); }, []);

  const filtered = pros.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch = p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
    const matchesTab = tab === "all" || p.profile_status === tab;
    return matchesSearch && matchesTab;
  });

  const pendingCount = pros.filter(p => p.profile_status === "pending").length;

  const openDetail = async (pro: Professional) => {
    setDetailPro(pro);
    const { data } = await supabase.from("professional_documents").select("*").eq("professional_id", pro.id);
    setDocs(data || []);
  };

  const handleApprove = async () => {
    if (!detailPro) return;
    await supabase.from("professionals").update({ profile_status: "approved", active: true }).eq("id", detailPro.id);
    await logAction("approve_professional", "professional", detailPro.id);
    await supabase.from("notifications").insert({
      user_id: detailPro.user_id,
      title: "Cadastro aprovado! 🎉",
      message: "Seu cadastro profissional foi aprovado. Agora você pode receber chamadas de clientes.",
      type: "approval",
      link: "/pro",
    });
    toast({ title: "Profissional aprovado!" });
    setDetailPro(null);
    fetchPros();
  };

  const handleReject = async () => {
    if (!detailPro) return;
    await supabase.from("professionals").update({ profile_status: "rejected", active: false }).eq("id", detailPro.id);
    await supabase.from("profiles").update({ user_type: "client" }).eq("user_id", detailPro.user_id);
    await logAction("reject_professional", "professional", detailPro.id, { reason: rejectReason });
    await supabase.from("notifications").insert({
      user_id: detailPro.user_id,
      title: "Cadastro não aprovado",
      message: rejectReason || "Seu cadastro não foi aprovado. Verifique seus documentos e tente novamente.",
      type: "rejection",
      link: "/profile",
    });
    toast({ title: "Profissional reprovado" });
    setDetailPro(null);
    setRejectReason("");
    fetchPros();
  };

  const handleApproveSubscription = async (pro: Professional) => {
    if (confirm(`Tem certeza que deseja APROVAR a assinatura de ${pro.full_name} e cobrar o cartão agora?`)) {
      setProcessingSub(pro.id);
      try {
        const res = await supabase.functions.invoke("admin-manage", {
          body: { action: "approve_subscription", userId: pro.user_id },
        });
        
        if (res.error || res.data?.error) {
          throw new Error(res.data?.error || "Erro ao aprovar assinatura no Asaas");
        }

        // ✅ CÓDIGO NOVO: Muda o tipo de usuário para "Empresa" se o plano for business
        if (pro.plan_id === 'business') {
          await supabase.from("profiles").update({ user_type: "company" }).eq("user_id", pro.user_id);
        }

        if (pro.profile_status === "pending") {
          await supabase.from("professionals").update({ profile_status: "approved", active: true }).eq("id", pro.id);
          await supabase.from("notifications").insert({
            user_id: pro.user_id,
            title: "Assinatura e Cadastro Aprovados! 🎉",
            message: "Sua assinatura foi ativada com sucesso e seu perfil já está visível para os clientes.",
            type: "approval",
            link: "/pro",
          });
        } else {
          await supabase.from("notifications").insert({
            user_id: pro.user_id,
            title: "Assinatura Aprovada! 👑",
            message: "Seu novo plano pago foi ativado com sucesso!",
            type: "approval",
            link: "/subscriptions",
          });
        }
        
        toast({ title: "Assinatura aprovada e cobrança ativada!" });
        fetchPros();
      } catch (err: any) {
        toast({ title: err.message, variant: "destructive" });
        setShowForceApproveForUserId(pro.user_id);
      }
      setProcessingSub(null);
      if (detailPro?.id === pro.id) setDetailPro(null);
    }
  };

  const handleForceApproveSubscription = async (pro: Professional) => {
    if (!confirm(`Forçar aprovação de ${pro.full_name}? O app será ativado sem cobrança no Asaas (ex.: CPF inválido).`)) return;
    setProcessingSub(pro.id);
    try {
      const res = await supabase.functions.invoke("admin-manage", {
        body: { action: "force_approve_subscription", userId: pro.user_id },
      });
      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || "Erro ao forçar aprovação.");
      }
      if (pro.plan_id === "business") {
        await supabase.from("profiles").update({ user_type: "company" }).eq("user_id", pro.user_id);
      }
      if (pro.profile_status === "pending") {
        await supabase.from("professionals").update({ profile_status: "approved", active: true }).eq("id", pro.id);
        await supabase.from("notifications").insert({
          user_id: pro.user_id,
          title: "Assinatura e Cadastro Aprovados! 🎉",
          message: "Sua assinatura foi ativada e seu perfil já está visível para os clientes.",
          type: "approval",
          link: "/pro",
        });
      } else {
        await supabase.from("notifications").insert({
          user_id: pro.user_id,
          title: "Assinatura Aprovada! 👑",
          message: "Seu plano foi ativado no app.",
          type: "approval",
          link: "/subscriptions",
        });
      }
      toast({ title: "Aprovação forçada: ativo no app (sem Asaas)." });
      setShowForceApproveForUserId((prev) => (prev === pro.user_id ? null : prev));
      fetchPros();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
    setProcessingSub(null);
    if (detailPro?.id === pro.id) setDetailPro(null);
  };

  const openRejectSubscriptionModal = (pro: Professional) => {
    setRejectSubPro(pro);
    setRejectSubReason("");
    setRejectSubOpen(true);
  };

  const confirmRejectSubscription = async () => {
    if (!rejectSubPro) return;
    if (!rejectSubReason.trim()) {
      toast({ title: "Digite um motivo para a recusa.", variant: "destructive" });
      return;
    }

    setProcessingSub(rejectSubPro.id);
    try {
      const res = await supabase.functions.invoke("admin-manage", {
        body: { action: "reject_subscription", userId: rejectSubPro.user_id, reason: rejectSubReason },
      });
      
      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || "Erro ao cancelar assinatura no Asaas");
      }

      await supabase.from("notifications").insert({
        user_id: rejectSubPro.user_id,
        title: "Assinatura Recusada",
        message: `Houve um problema com sua assinatura. Motivo: ${rejectSubReason}. Entre em contato com o suporte para corrigir.`,
        type: "rejection",
        link: "/support",
      });
      
      toast({ title: "Assinatura cancelada com sucesso!" });
      fetchPros();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
    setProcessingSub(null);
    setRejectSubOpen(false);
    if (detailPro?.id === rejectSubPro.id) setDetailPro(null);
  };

  const handleChangeCategory = async (pro: Professional, categoryId: string) => {
    const { error } = await supabase.from("professionals").update({ category_id: categoryId }).eq("id", pro.id);
    if (error) { toast({ title: "Erro ao alterar categoria", variant: "destructive" }); return; }
    await logAction("change_category", "professional", pro.id, { category_id: categoryId });
    toast({ title: "Categoria atualizada!" });
    fetchPros();
  };

  const toggleVerified = async (pro: Professional) => {
    await supabase.from("professionals").update({ verified: !pro.verified }).eq("id", pro.id);
    await logAction(pro.verified ? "unverify_professional" : "verify_professional", "professional", pro.id);
    toast({ title: pro.verified ? "Verificação removida" : "Profissional verificado!" });
    fetchPros();
  };

  const toggleVisibility = async (pro: Professional) => {
    const newStatus = pro.availability_status === "unavailable" ? "available" : "unavailable";
    await supabase.from("professionals").update({ availability_status: newStatus }).eq("id", pro.id);
    await logAction("toggle_visibility", "professional", pro.id, { new_status: newStatus });
    toast({ title: newStatus === "available" ? "Profissional visível novamente!" : "Profissional ocultado" });
    fetchPros();
  };

  const handleBonusCalls = async () => {
    const amount = parseInt(bonusAmount);
    if (isNaN(amount) || amount <= 0) { toast({ title: "Quantidade inválida", variant: "destructive" }); return; }
    setBonusSaving(true);

    if (bonusTarget === "individual") {
      if (!bonusProId) { toast({ title: "Selecione um profissional", variant: "destructive" }); setBonusSaving(false); return; }
      const pro = pros.find(p => p.id === bonusProId);
      const currentBonus = pro?.bonus_calls || 0;
      await supabase.from("professionals").update({ bonus_calls: currentBonus + amount, availability_status: "available" } as any).eq("id", bonusProId);
      await logAction("bonus_calls", "professional", bonusProId, { amount });
      toast({ title: `+${amount} chamadas bônus concedidas!` });
    } else {
      if (!bonusCategoryId) { toast({ title: "Selecione uma categoria", variant: "destructive" }); setBonusSaving(false); return; }
      const categoryPros = pros.filter(p => p.category_id === bonusCategoryId && p.profile_status === "approved");
      for (const pro of categoryPros) {
        const currentBonus = pro.bonus_calls || 0;
        await supabase.from("professionals").update({ bonus_calls: currentBonus + amount, availability_status: "available" } as any).eq("id", pro.id);
      }
      await logAction("bonus_calls_category", "category", bonusCategoryId, { amount, count: categoryPros.length });
      toast({ title: `+${amount} chamadas bônus para ${categoryPros.length} profissionais!` });
    }

    setBonusSaving(false);
    setBonusOpen(false);
    setBonusAmount("10");
    fetchPros();
  };

  const logAction = async (action: string, target_type: string, target_id: string, details?: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("admin_logs").insert({ admin_user_id: session.user.id, action, target_type, target_id, details: details || null });
    }
  };

  const openReviews = async (pro: Professional) => {
    setReviewsPro(pro);
    setReviewsOpen(true);
    const { data } = await supabase
      .from("reviews")
      .select("id, rating, comment, created_at, client_id")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false });
    if (data && data.length > 0) {
      const clientIds = [...new Set(data.map((r: any) => r.client_id))];
      const { data: profiles } = await supabase
        .from("profiles_public" as any)
        .select("user_id, full_name")
        .in("user_id", clientIds) as { data: { user_id: string; full_name: string }[] | null };
      const nameMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
      setReviews(data.map((r: any) => ({ ...r, client_name: nameMap.get(r.client_id) || "Cliente" })));
    } else {
      setReviews([]);
    }
  };

  const deleteReview = async (reviewId: string, proId: string) => {
    await supabase.from("reviews").delete().eq("id", reviewId);
    await logAction("delete_review", "review", reviewId);
    const { data: remaining } = await supabase.from("reviews").select("rating").eq("professional_id", proId);
    const total = remaining?.length || 0;
    const avg = total > 0 ? remaining!.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    await supabase.from("professionals").update({ total_reviews: total, rating: Math.round(avg * 10) / 10 }).eq("id", proId);
    toast({ title: "Avaliação removida!" });
    setReviews(prev => prev.filter(r => r.id !== reviewId));
    fetchPros();
  };

  const planLabel: Record<string, string> = { free: "Grátis", pro: "Pro", vip: "VIP", business: "Empresarial" };

  const ProTable = ({ items }: { items: Professional[] }) => (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Categoria</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Plano</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Chamadas</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Visibilidade</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((pro) => {
              const st = statusBadge[pro.profile_status] || statusBadge.pending;
              const av = availabilityBadge[pro.availability_status] || availabilityBadge.available;
              return (
                <tr key={pro.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <p className="font-medium text-foreground text-xs md:text-sm">{pro.full_name}</p>
                    <p className="text-[10px] text-muted-foreground md:hidden">{pro.category_name}</p>
                  </td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell text-xs">{pro.category_name}</td>
                  <td className="p-3 hidden md:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      pro.plan_id === "free" ? "bg-muted text-muted-foreground" :
                      pro.plan_id === "pro" ? "bg-primary/10 text-primary" :
                      pro.plan_id === "vip" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                    }`}>
                      {planLabel[pro.plan_id] || pro.plan_id}
                    </span>
                    {pro.plan_id !== "free" && pro.subscription_status !== "ACTIVE" && (
                      <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] rounded-full uppercase font-bold animate-pulse">Pendente</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="text-xs font-medium text-foreground">{pro.calls_used}</span>
                    {pro.bonus_calls > 0 && (
                      <span className="text-[10px] text-primary ml-1">(+{pro.bonus_calls} bônus)</span>
                    )}
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${av.cls}`}>{av.label}</span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="p-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetail(pro)}><Eye className="w-3.5 h-3.5 mr-2" /> Detalhes</DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/professional/${pro.id}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5 mr-2" /> Ver perfil
                          </a>
                        </DropdownMenuItem>
                        
                        {pro.plan_id !== "free" && pro.subscription_status !== "ACTIVE" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleApproveSubscription(pro)} disabled={processingSub === pro.id}>
                              <CheckCircle className="w-3.5 h-3.5 mr-2 text-green-500" /> 
                              {processingSub === pro.id ? "Aprovando..." : "Aprovar Assinatura"}
                            </DropdownMenuItem>
                            {showForceApproveForUserId === pro.user_id && (
                              <DropdownMenuItem onClick={() => handleForceApproveSubscription(pro)} disabled={processingSub === pro.id}>
                                <AlertTriangle className="w-3.5 h-3.5 mr-2 text-amber-500" /> 
                                {processingSub === pro.id ? "Forçando..." : "Forçar aprovação (sem Asaas)"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => openRejectSubscriptionModal(pro)} disabled={processingSub === pro.id}>
                              <XCircle className="w-3.5 h-3.5 mr-2 text-red-500" /> 
                              {processingSub === pro.id ? "Recusando..." : "Recusar Assinatura"}
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        
                        <DropdownMenuItem onClick={() => openReviews(pro)}>
                          <Star className="w-3.5 h-3.5 mr-2" /> Avaliações ({pro.total_reviews})
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleVerified(pro)}>
                          {pro.verified ? <><XCircle className="w-3.5 h-3.5 mr-2" /> Remover verificação</> : <><BadgeCheck className="w-3.5 h-3.5 mr-2" /> Verificar</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleVisibility(pro)}>
                          {pro.availability_status === "unavailable" ?
                            <><Eye className="w-3.5 h-3.5 mr-2" /> Tornar visível</> :
                            <><EyeOff className="w-3.5 h-3.5 mr-2" /> Ocultar</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setBonusProId(pro.id); setBonusTarget("individual"); setBonusOpen(true); }}>
                          <Gift className="w-3.5 h-3.5 mr-2" /> Dar chamadas bônus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">Nenhum profissional encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <AdminLayout title="Profissionais">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar profissional..."
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
        </div>
        <button onClick={() => { setBonusTarget("category"); setBonusOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap">
          <Gift className="w-4 h-4" /> Bonificar por categoria
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="pending" className="relative">
              Pendentes
              {pendingCount > 0 && (
                <Badge className="ml-1.5 h-5 min-w-[20px] px-1.5 text-[10px]">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved">Aprovados</TabsTrigger>
            <TabsTrigger value="rejected">Reprovados</TabsTrigger>
            <TabsTrigger value="all">Todos</TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <ProTable items={filtered} />
          </TabsContent>
        </Tabs>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={!!detailPro} onOpenChange={(o) => !o && setDetailPro(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes do Profissional</DialogTitle></DialogHeader>
          {detailPro && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">{detailPro.full_name}</p>
                <p className="text-xs text-muted-foreground">{detailPro.email}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    detailPro.plan_id === "free" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                  }`}>
                    Plano: {planLabel[detailPro.plan_id] || detailPro.plan_id}
                  </span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {detailPro.calls_used} chamadas usadas
                    {detailPro.bonus_calls > 0 && <span className="text-primary">(+{detailPro.bonus_calls} bônus)</span>}
                  </span>
                </div>
              </div>

              {detailPro.plan_id !== "free" && detailPro.subscription_status !== "ACTIVE" && (
                 <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 my-2">
                   <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                     <CreditCard className="w-4 h-4" /> Assinatura aguardando aprovação
                   </p>
                   <div className="flex flex-wrap gap-2">
                     <button onClick={() => handleApproveSubscription(detailPro)} disabled={processingSub === detailPro.id} className="flex-1 min-w-[120px] py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors">
                       {processingSub === detailPro.id ? "Aprovando..." : "✅ Aprovar e Cobrar"}
                     </button>
                     {showForceApproveForUserId === detailPro.user_id && (
                       <button onClick={() => handleForceApproveSubscription(detailPro)} disabled={processingSub === detailPro.id} className="flex-1 min-w-[120px] py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors">
                         {processingSub === detailPro.id ? "Forçando..." : "⚠️ Forçar aprovação (sem Asaas)"}
                       </button>
                     )}
                     <button onClick={() => { setDetailPro(null); openRejectSubscriptionModal(detailPro); }} disabled={processingSub === detailPro.id} className="flex-1 min-w-[120px] py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 text-xs font-medium hover:bg-red-100 transition-colors">
                       {processingSub === detailPro.id ? "Recusando..." : "❌ Recusar Plano"}
                     </button>
                   </div>
                 </div>
              )}

              {(detailPro.city || detailPro.state) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {[detailPro.city, detailPro.state].filter(Boolean).join(", ")}
                </p>
              )}
              {detailPro.bio && <p className="text-sm text-muted-foreground">{detailPro.bio}</p>}
              
              <a href={`/professional/${detailPro.id}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Ver perfil público
              </a>

              {/* Documentos de Identidade e Business */}
              {(docs.length > 0 || detailPro.plan_id === 'business') && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Documentos</p>
                  
                 {/* Documentos de Identidade (Cadastro inicial) */}
<div className="space-y-1.5 mb-3">
  {docs.map((d: any) => (
    <a key={d.id} href={d.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
      <FileText className="w-3.5 h-3.5" /> {d.type} — {d.status}
    </a>
  ))}
</div>

                  {/* Documentos do Plano Business (Cartão CNPJ) */}
                  {detailPro.plan_id === 'business' && detailPro.subscription_status !== 'ACTIVE' && (
                    <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-violet-600 uppercase mb-2 flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> Verificação Business
                      </p>
                      
                      <SubscriptionDoc userId={detailPro.user_id} />
                    </div>
                  )}
                </div>
              )}

              {detailPro.profile_status === "pending" && detailPro.plan_id === "free" && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex gap-2">
                    <button onClick={handleApprove} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1">
                      <CheckCircle className="w-4 h-4" /> Aprovar Cadastro Livre
                    </button>
                    <button onClick={handleReject} className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors flex items-center justify-center gap-1">
                      <XCircle className="w-4 h-4" /> Reprovar Cadastro
                    </button>
                  </div>
                  <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Motivo da reprovação (opcional)"
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectSubOpen} onOpenChange={setRejectSubOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> 
              Recusar Assinatura
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              A assinatura de <strong>{rejectSubPro?.full_name}</strong> será cancelada no Asaas e nenhuma cobrança será feita.
            </p>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Motivo da Recusa (obrigatório)</label>
              <textarea 
                value={rejectSubReason} 
                onChange={(e) => setRejectSubReason(e.target.value)}
                placeholder="Ex: Documento inválido, dados incorretos..."
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 min-h-[80px] resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                O profissional receberá uma notificação com este motivo e será orientado a chamar o suporte.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setRejectSubOpen(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button 
                onClick={confirmRejectSubscription} 
                disabled={!rejectSubReason.trim() || processingSub === rejectSubPro?.id} 
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {processingSub === rejectSubPro?.id ? "Cancelando..." : "Confirmar Recusa"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bonusOpen} onOpenChange={setBonusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Gift className="w-5 h-5 text-primary" /> Bonificar chamadas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => setBonusTarget("individual")}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${bonusTarget === "individual" ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}>
                Individual
              </button>
              <button onClick={() => setBonusTarget("category")}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${bonusTarget === "category" ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}>
                Por categoria
              </button>
            </div>

            {bonusTarget === "individual" ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Profissional</label>
                <select value={bonusProId} onChange={e => setBonusProId(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Selecione...</option>
                  {pros.filter(p => p.profile_status === "approved").map(p => (
                    <option key={p.id} value={p.id}>{p.full_name} ({p.calls_used} chamadas, +{p.bonus_calls} bônus)</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Categoria</label>
                <select value={bonusCategoryId} onChange={e => setBonusCategoryId(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Selecione...</option>
                  {categories.map(c => {
                    const count = pros.filter(p => p.category_id === c.id && p.profile_status === "approved").length;
                    return <option key={c.id} value={c.id}>{c.name} ({count} profissionais)</option>;
                  })}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Quantidade de chamadas</label>
              <input type="number" min="1" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            <button onClick={handleBonusCalls} disabled={bonusSaving}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
              {bonusSaving ? "Aplicando..." : "Conceder chamadas bônus"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewsOpen} onOpenChange={setReviewsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400" /> Avaliações de {reviewsPro?.full_name}
            </DialogTitle>
          </DialogHeader>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma avaliação encontrada.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r: any) => (
                <div key={r.id} className="bg-muted/50 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{r.client_name}</p>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`w-3 h-3 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                        ))}
                      </div>
                    </div>
                    <button onClick={() => { if (reviewsPro && confirm("Remover esta avaliação?")) deleteReview(r.id, reviewsPro.id); }}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors" title="Remover avaliação">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                  <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminPros;