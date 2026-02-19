import AdminLayout from "@/components/AdminLayout";
import { Ticket, Trophy, Plus, Shuffle, Search, Percent } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const AdminCoupons = () => {
  const [raffles, setRaffles] = useState<any[]>([]);
  const [couponCount, setCouponCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawDialogOpen, setDrawDialogOpen] = useState(false);
  const [drawRaffleId, setDrawRaffleId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", draw_date: "" });

  // Add coupon dialog
  const [addCouponOpen, setAddCouponOpen] = useState(false);
  const [couponForm, setCouponForm] = useState({ coupon_type: "raffle" as "raffle" | "discount", target: "individual" as "individual" | "random", discount_percent: "5", expires_days: "30" });
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [addingCoupon, setAddingCoupon] = useState(false);

  const fetchData = async () => {
    const [{ data: r }, { count }] = await Promise.all([
      supabase.from("raffles").select("*").order("draw_date", { ascending: false }),
      supabase.from("coupons").select("*", { count: "exact", head: true }),
    ]);
    setRaffles(r || []);
    setCouponCount(count || 0);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const drawnCount = raffles.filter(r => r.status === "drawn").length;

  const handleCreate = async () => {
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
      });
      toast({ title: "Sorteio realizado com sucesso!" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro no sorteio", description: err.message, variant: "destructive" });
    }
    setDrawing(false);
  };

  // Search users for add coupon
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
        });
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
        });
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

  return (
    <AdminLayout title="Cupons & Sorteios">
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-card border rounded-xl p-4">
          <Ticket className="w-5 h-5 text-primary mb-1" />
          <p className="text-2xl font-bold text-foreground">{couponCount.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground">Cupons emitidos</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <Trophy className="w-5 h-5 mb-1" style={{ color: "hsl(var(--warning))" }} />
          <p className="text-2xl font-bold text-foreground">{drawnCount}</p>
          <p className="text-xs text-muted-foreground">Sorteios realizados</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-foreground">Ações</h2>
        <div className="flex gap-2">
          <button onClick={() => { setAddCouponOpen(true); setSelectedUser(null); setUserSearch(""); setUserResults([]); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-foreground text-sm font-medium hover:bg-accent/80 transition-colors">
            <Plus className="w-4 h-4" /> Adicionar cupom
          </button>
          <button onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Novo sorteio
          </button>
        </div>
      </div>

      <h2 className="font-semibold text-foreground mb-3">Sorteios</h2>
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : raffles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhum sorteio criado</div>
      ) : (
        <div className="flex flex-col gap-3">
          {raffles.map((r) => (
            <div key={r.id} className="bg-card border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-foreground">{r.title}</p>
                <p className="text-xs text-muted-foreground">Data: {new Date(r.draw_date).toLocaleDateString("pt-BR")}</p>
                {r.winner_user_id && <p className="text-xs text-primary mt-0.5">🏆 Sorteado</p>}
              </div>
              <div className="flex items-center gap-2">
                {r.status === "upcoming" && (
                  <button onClick={() => openDraw(r.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent text-primary text-xs font-semibold hover:bg-accent/80 transition-colors">
                    <Shuffle className="w-3.5 h-3.5" /> Sortear
                  </button>
                )}
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  r.status === "upcoming" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {r.status === "upcoming" ? "Próximo" : "Realizado"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create raffle dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo sorteio</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título</label>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Data do sorteio</label>
              <input type="date" value={form.draw_date} onChange={(e) => setForm(f => ({ ...f, draw_date: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <button onClick={handleCreate} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              Criar sorteio
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Draw dialog */}
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
              <p className="text-sm text-muted-foreground">Selecionar um ganhador aleatório entre todos os cupons disponíveis?</p>
              <button onClick={handleDraw} disabled={drawing}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                {drawing ? "Sorteando..." : "Sortear agora 🎲"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add coupon dialog */}
      <Dialog open={addCouponOpen} onOpenChange={setAddCouponOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Ticket className="w-5 h-5 text-primary" /> Adicionar cupom</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Coupon type */}
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

            {/* Target */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Destinatário</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setCouponForm(f => ({ ...f, target: "individual" })); setSelectedUser(null); }}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${couponForm.target === "individual" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Search className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Individual</p>
                </button>
                <button onClick={() => setCouponForm(f => ({ ...f, target: "random" }))}
                  className={`p-3 rounded-xl border-2 text-center transition-colors ${couponForm.target === "random" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Shuffle className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Aleatório</p>
                </button>
              </div>
            </div>

            {/* User search (individual) */}
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

            {/* Discount config */}
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
              {addingCoupon ? "Adicionando..." : couponForm.target === "random" ? "Sortear e adicionar cupom" : "Adicionar cupom"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCoupons;
