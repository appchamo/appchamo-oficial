import AdminLayout from "@/components/AdminLayout";
import { Ticket, Trophy, Plus, Shuffle, Search, Percent, Settings2, Trash2, Power, PowerOff } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AdminCoupons = () => {
  const [raffles, setRaffles] = useState<any[]>([]);
  const [couponCount, setCouponCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Raffle Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawDialogOpen, setDrawDialogOpen] = useState(false);
  const [drawRaffleId, setDrawRaffleId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", draw_date: "" });

  // Add Coupon Dialogs
  const [addCouponOpen, setAddCouponOpen] = useState(false);
  const [couponForm, setCouponForm] = useState({ coupon_type: "raffle" as "raffle" | "discount", target: "individual" as "individual" | "random", discount_percent: "5", expires_days: "30" });
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [addingCoupon, setAddingCoupon] = useState(false);

  // NOVO: Campanhas de Cupons (Lotes)
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [addCampaignOpen, setAddCampaignOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ 
    discount_percent: "10", 
    total_quantity: "100", 
    min_purchase_value: "0", 
    max_purchase_value: "" 
  });
  const [savingCampaign, setSavingCampaign] = useState(false);

  const fetchData = async () => {
    const [
      { data: r }, 
      { count },
      { data: camp }
    ] = await Promise.all([
      supabase.from("raffles").select("*").order("draw_date", { ascending: false }),
      supabase.from("coupons").select("*", { count: "exact", head: true }),
      supabase.from("coupon_campaigns").select("*").order("created_at", { ascending: false })
    ]);
    
    setRaffles(r || []);
    setCouponCount(count || 0);
    setCampaigns(camp || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const drawnCount = raffles.filter(r => r.status === "drawn").length;

  const handleCreateRaffle = async () => {
    if (!form.title || !form.draw_date) { toast({ title: "Preencha todos os campos", variant: "destructive" }); return; }
    const { error } = await supabase.from("raffles").insert({
      title: form.title, draw_date: form.draw_date, status: "upcoming",
    });
    if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
    toast({ title: "Sorteio criado!" });
    setDialogOpen(false);
    setForm({ title: "", draw_date: "" });
    fetchData();
  };

  const openDraw = (raffleId: string) => {
    setDrawRaffleId(raffleId);
    setWinnerName(null);
    setDrawDialogOpen(true);
  };

  const handleDraw = async () => {
    if (!drawRaffleId) return;
    setDrawing(true);
    try {
      const { data: coupons } = await supabase.from("coupons").select("*").eq("used", false).eq("coupon_type", "raffle");
      if (!coupons || coupons.length === 0) {
        toast({ title: "Nenhum cupom disponível para sorteio", variant: "destructive" });
        setDrawing(false);
        return;
      }
      const winner = coupons[Math.floor(Math.random() * coupons.length)];
      await supabase.from("raffles").update({ status: "drawn", winner_user_id: winner.user_id }).eq("id", drawRaffleId);
      await supabase.from("coupons").update({ used: true, raffle_id: drawRaffleId }).eq("id", winner.id);
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", winner.user_id).maybeSingle();
      setWinnerName(profile?.full_name || "Usuário");
      const raffle = raffles.find(r => r.id === drawRaffleId);
      await supabase.from("notifications").insert({
        user_id: winner.user_id,
        title: "🎉 Você foi sorteado!",
        message: `Parabéns! Você foi o ganhador do sorteio "${raffle?.title || ""}". Entre em contato conosco para resgatar seu prêmio.`,
        type: "raffle_win",
        link: "/coupons",
      } as any);
      toast({ title: "Sorteio realizado com sucesso!" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro no sorteio", description: err.message, variant: "destructive" });
    }
    setDrawing(false);
  };

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    if (q.length < 2) { setUserResults([]); return; }
    const { data } = await supabase.from("profiles").select("user_id, full_name, email, user_type").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(8);
    setUserResults(data || []);
  };

  const handleAddCoupon = async () => {
    setAddingCoupon(true);
    try {
      if (couponForm.target === "individual") {
        if (!selectedUser) {
          toast({ title: "Selecione um usuário", variant: "destructive" });
          setAddingCoupon(false);
          return;
        }
        const couponData: any = {
          user_id: selectedUser.user_id,
          source: "admin",
          coupon_type: couponForm.coupon_type,
          used: false,
        };
        if (couponForm.coupon_type === "discount") {
          couponData.discount_percent = parseFloat(couponForm.discount_percent) || 5;
          couponData.expires_at = new Date(Date.now() + (parseInt(couponForm.expires_days) || 30) * 86400000).toISOString();
        }
        const { error: couponError } = await supabase.from("coupons").insert(couponData);
        if (couponError) {
          toast({ title: "Erro ao criar cupom", description: couponError.message, variant: "destructive" });
          setAddingCoupon(false);
          return;
        }
        await supabase.from("notifications").insert({
          user_id: selectedUser.user_id,
          title: couponForm.coupon_type === "raffle" ? "🎟️ Cupom de sorteio recebido!" : "🎉 Cupom de desconto recebido!",
          message: couponForm.coupon_type === "raffle"
            ? "Você recebeu um cupom para o sorteio mensal!"
            : `Você recebeu um cupom de ${couponForm.discount_percent}% de desconto!`,
          type: "coupon",
          link: "/coupons",
        } as any);
        toast({ title: `Cupom adicionado para ${selectedUser.full_name}!` });
      } else {
        const { data: allUsers } = await supabase.from("profiles").select("user_id, full_name").limit(1000);
        if (!allUsers || allUsers.length === 0) {
          toast({ title: "Nenhum usuário encontrado", variant: "destructive" });
          setAddingCoupon(false);
          return;
        }
        const lucky = allUsers[Math.floor(Math.random() * allUsers.length)];
        const couponData: any = {
          user_id: lucky.user_id,
          source: "admin_random",
          coupon_type: couponForm.coupon_type,
          used: false,
        };
        if (couponForm.coupon_type === "discount") {
          couponData.discount_percent = parseFloat(couponForm.discount_percent) || 5;
          couponData.expires_at = new Date(Date.now() + (parseInt(couponForm.expires_days) || 30) * 86400000).toISOString();
        }
        const { error: couponError } = await supabase.from("coupons").insert(couponData);
        if (couponError) {
          toast({ title: "Erro ao criar cupom", description: couponError.message, variant: "destructive" });
          setAddingCoupon(false);
          return;
        }
        await supabase.from("notifications").insert({
          user_id: lucky.user_id,
          title: couponForm.coupon_type === "raffle" ? "🎟️ Cupom de sorteio recebido!" : "🎉 Cupom de desconto recebido!",
          message: couponForm.coupon_type === "raffle"
            ? "Você recebeu um cupom para o sorteio mensal!"
            : `Você recebeu um cupom de ${couponForm.discount_percent}% de desconto!`,
          type: "coupon",
          link: "/coupons",
        } as any);
        toast({ title: `Cupom sorteado para ${lucky.full_name}!` });
      }
      setAddCouponOpen(false);
      setSelectedUser(null);
      setUserSearch("");
      setUserResults([]);
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao adicionar cupom", description: err.message, variant: "destructive" });
    }
    setAddingCoupon(false);
  };

  // ✅ NOVO: Funções de Campanha (Lotes de Desconto)
  const handleCreateCampaign = async () => {
    if (!campaignForm.discount_percent || !campaignForm.total_quantity) {
      toast({ title: "Preencha a % de desconto e a quantidade total.", variant: "destructive" }); 
      return;
    }

    setSavingCampaign(true);
    try {
      const { error } = await supabase.from("coupon_campaigns").insert({
        discount_percent: parseInt(campaignForm.discount_percent),
        total_quantity: parseInt(campaignForm.total_quantity),
        used_quantity: 0,
        min_purchase_value: campaignForm.min_purchase_value ? parseFloat(campaignForm.min_purchase_value) : 0,
        max_purchase_value: campaignForm.max_purchase_value ? parseFloat(campaignForm.max_purchase_value) : null,
        is_active: true
      });

      if (error) throw error;

      toast({ title: "Lote de Cupons criado com sucesso!" });
      setAddCampaignOpen(false);
      setCampaignForm({ discount_percent: "10", total_quantity: "100", min_purchase_value: "0", max_purchase_value: "" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao criar lote", description: err.message, variant: "destructive" });
    }
    setSavingCampaign(false);
  };

  const toggleCampaignStatus = async (id: string, currentStatus: boolean) => {
    try {
      await supabase.from("coupon_campaigns").update({ is_active: !currentStatus }).eq("id", id);
      toast({ title: `Lote ${!currentStatus ? 'ativado' : 'pausado'}!` });
      fetchData();
    } catch (err) {
      toast({ title: "Erro ao alterar status", variant: "destructive" });
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Tem certeza que deseja apagar este lote?")) return;
    try {
      await supabase.from("coupon_campaigns").delete().eq("id", id);
      toast({ title: "Lote apagado!" });
      fetchData();
    } catch (err) {
      toast({ title: "Erro ao apagar lote", variant: "destructive" });
    }
  };

  return (
    <AdminLayout title="Cupons & Sorteios">
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-card border rounded-xl p-4">
          <Ticket className="w-5 h-5 text-primary mb-1" />
          <p className="text-2xl font-bold text-foreground">{couponCount.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground">Cupons emitidos (Total)</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <Trophy className="w-5 h-5 mb-1" style={{ color: "hsl(var(--warning))" }} />
          <p className="text-2xl font-bold text-foreground">{drawnCount}</p>
          <p className="text-xs text-muted-foreground">Sorteios realizados</p>
        </div>
      </div>

      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="campaigns" className="rounded-lg font-semibold text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Distribuição Automática
          </TabsTrigger>
          <TabsTrigger value="raffles" className="rounded-lg font-semibold text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Sorteios & Envios Manuais
          </TabsTrigger>
        </TabsList>

        {/* ✅ ABA 1: Lotes de Cupons Automáticos (Plataforma banca) */}
        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-semibold text-foreground">Lotes de Desconto</h2>
              <p className="text-xs text-muted-foreground">Distribua cupons automaticamente no app</p>
            </div>
            <button onClick={() => setAddCampaignOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" /> Novo Lote
            </button>
          </div>

          {loading ? (
             <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12 bg-card border rounded-xl border-dashed">
              <Percent className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Nenhum lote criado</p>
              <p className="text-xs text-muted-foreground">O app não está distribuindo cupons no momento.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {campaigns.map((camp) => {
                const isEsgotado = camp.used_quantity >= camp.total_quantity;
                return (
                  <div key={camp.id} className={`bg-card border rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${!camp.is_active || isEsgotado ? 'opacity-70' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg ${camp.is_active && !isEsgotado ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {camp.discount_percent}%
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground">Lote de {camp.discount_percent}% OFF</p>
                          {!camp.is_active ? (
                            <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Pausado</span>
                          ) : isEsgotado ? (
                            <span className="px-2 py-0.5 rounded-md bg-destructive/10 text-destructive text-[10px] font-bold uppercase tracking-wider">Esgotado</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[10px] font-bold uppercase tracking-wider">Ativo</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Entregues: <span className="font-bold text-foreground">{camp.used_quantity}</span> de {camp.total_quantity}
                        </p>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                          Regra: Pagamentos acima de R$ {camp.min_purchase_value} {camp.max_purchase_value ? `e até R$ ${camp.max_purchase_value}` : ''}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                      <button onClick={() => toggleCampaignStatus(camp.id, camp.is_active)} className="flex-1 sm:flex-none flex items-center justify-center p-2 rounded-lg bg-accent hover:bg-accent/80 transition-colors text-muted-foreground" title={camp.is_active ? "Pausar Lote" : "Ativar Lote"}>
                        {camp.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4 text-emerald-600" />}
                      </button>
                      <button onClick={() => deleteCampaign(camp.id)} className="flex-1 sm:flex-none flex items-center justify-center p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors text-destructive" title="Apagar Lote">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ABA 2: Sorteios e Cupons Manuais (Antiga tela) */}
        <TabsContent value="raffles" className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-semibold text-foreground">Sorteios Mensais</h2>
              <p className="text-xs text-muted-foreground">Sorteios e envio manual de cupons</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setAddCouponOpen(true); setSelectedUser(null); setUserSearch(""); setUserResults([]); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent text-foreground text-xs font-medium hover:bg-accent/80 transition-colors">
                <Ticket className="w-3.5 h-3.5" /> Dar cupom
              </button>
              <button onClick={() => setDialogOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                <Trophy className="w-3.5 h-3.5" /> Novo sorteio
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : raffles.length === 0 ? (
            <div className="text-center py-12 bg-card border rounded-xl border-dashed">
              <Trophy className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Nenhum sorteio criado</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {raffles.map((r) => (
                <div key={r.id} className="bg-card border rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm text-foreground">{r.title}</p>
                    <p className="text-xs text-muted-foreground">Data: {new Date(r.draw_date).toLocaleDateString("pt-BR")}</p>
                    {r.winner_user_id && <p className="text-xs text-primary mt-0.5 font-bold flex items-center gap-1"><Check className="w-3 h-3" /> Sorteado</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === "upcoming" && (
                      <button onClick={() => openDraw(r.id)} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors">
                        <Shuffle className="w-3.5 h-3.5" /> Sortear Agora
                      </button>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      r.status === "upcoming" ? "bg-accent text-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {r.status === "upcoming" ? "Próximo" : "Realizado"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ✅ MODAL: Nova Campanha de Lote */}
      <Dialog open={addCampaignOpen} onOpenChange={setAddCampaignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5 text-primary" /> Criar Lote de Descontos</DialogTitle>
            <DialogDescription>A plataforma distribuirá estes cupons automaticamente após pagamentos bem sucedidos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Desconto (%)</label>
                <input type="number" value={campaignForm.discount_percent} onChange={(e) => setCampaignForm(f => ({ ...f, discount_percent: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Quantidade total</label>
                <input type="number" value={campaignForm.total_quantity} onChange={(e) => setCampaignForm(f => ({ ...f, total_quantity: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            
            <div className="p-3 bg-muted/50 rounded-xl border border-muted space-y-3">
              <p className="text-xs font-bold text-foreground">Regras de Utilização</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor mínimo do serviço (R$)</label>
                <input type="number" value={campaignForm.min_purchase_value} onChange={(e) => setCampaignForm(f => ({ ...f, min_purchase_value: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor máximo (Opcional, R$)</label>
                <input type="number" value={campaignForm.max_purchase_value} onChange={(e) => setCampaignForm(f => ({ ...f, max_purchase_value: e.target.value }))} placeholder="Sem limite"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:border-primary" />
              </div>
            </div>

            <button onClick={handleCreateCampaign} disabled={savingCampaign}
              className="w-full py-3 mt-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
              {savingCampaign ? "Salvando..." : "Lançar Lote na Plataforma"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: Criar sorteio mensal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo sorteio mensal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título</label>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Sorteio de Dezembro"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Data do sorteio</label>
              <input type="date" value={form.draw_date} onChange={(e) => setForm(f => ({ ...f, draw_date: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <button onClick={handleCreateRaffle} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              Criar sorteio
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: Realizar Sorteio (Roleta) */}
      <Dialog open={drawDialogOpen} onOpenChange={setDrawDialogOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader><DialogTitle>Realizar Sorteio</DialogTitle></DialogHeader>
          {winnerName ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
                <Trophy className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">🎉 Ganhador:</p>
              <p className="text-lg font-bold text-primary">{winnerName}</p>
              <p className="text-xs text-muted-foreground">O ganhador foi notificado automaticamente.</p>
              <button onClick={() => setDrawDialogOpen(false)} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors mt-2">
                Fechar
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <Shuffle className="w-12 h-12 text-primary" />
              <p className="text-sm text-muted-foreground">Selecionar um ganhador aleatório entre todos os cupons de sorteio disponíveis?</p>
              <button onClick={handleDraw} disabled={drawing}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                {drawing ? "Sorteando..." : "Sortear agora 🎲"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: Dar cupom manual (Antigo) */}
      <Dialog open={addCouponOpen} onOpenChange={setAddCouponOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Ticket className="w-5 h-5 text-primary" /> Dar cupom manual</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo de cupom</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setCouponForm(f => ({ ...f, coupon_type: "raffle" }))}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${couponForm.coupon_type === "raffle" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Ticket className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Sorteio</p>
                </button>
                <button onClick={() => setCouponForm(f => ({ ...f, coupon_type: "discount" }))}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${couponForm.coupon_type === "discount" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Percent className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Desconto</p>
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Destinatário</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setCouponForm(f => ({ ...f, target: "individual" })); setSelectedUser(null); }}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${couponForm.target === "individual" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Search className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Pesquisar Usuário</p>
                </button>
                <button onClick={() => setCouponForm(f => ({ ...f, target: "random" }))}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${couponForm.target === "random" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Shuffle className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Mandar Aleatório</p>
                </button>
              </div>
            </div>

            {couponForm.target === "individual" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Buscar usuário</label>
                <input value={userSearch} onChange={(e) => searchUsers(e.target.value)} placeholder="Nome ou email..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                {selectedUser && (
                  <div className="mt-2 flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl p-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {selectedUser.full_name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{selectedUser.full_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{selectedUser.email}</p>
                    </div>
                    <button onClick={() => setSelectedUser(null)} className="text-xs text-destructive font-medium">✕</button>
                  </div>
                )}
                {!selectedUser && userResults.length > 0 && (
                  <div className="mt-2 border rounded-xl divide-y max-h-40 overflow-y-auto">
                    {userResults.map(u => (
                      <button key={u.user_id} onClick={() => { setSelectedUser(u); setUserResults([]); }}
                        className="w-full flex items-center gap-2 p-2.5 hover:bg-muted/50 transition-colors text-left">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                          {u.full_name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{u.full_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {couponForm.target === "random" && (
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Shuffle className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Um usuário será sorteado aleatoriamente</p>
              </div>
            )}

            {couponForm.coupon_type === "discount" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">% de desconto</label>
                  <input type="number" value={couponForm.discount_percent} onChange={(e) => setCouponForm(f => ({ ...f, discount_percent: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Validade (dias)</label>
                  <input type="number" value={couponForm.expires_days} onChange={(e) => setCouponForm(f => ({ ...f, expires_days: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            )}

            <button onClick={handleAddCoupon} disabled={addingCoupon}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
              {addingCoupon ? "Adicionando..." : couponForm.target === "random" ? "Sortear e enviar" : "Enviar cupom"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCoupons;