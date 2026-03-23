import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Eye, MousePointerClick, Plus, Sparkles, LogOut, Clock, Trash2, Camera, Image as ImageIcon, ShoppingCart, Check, CreditCard, QrCode, Copy, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SponsorStoryViewer, { SponsorStory } from "@/components/SponsorStoryViewer";

type UpgradeStep = "package" | "method" | "pix_form" | "pix_qr" | "card_form" | "success";

/** Comprime imagem client-side para WebP leve mantendo boa qualidade visual */
async function compressStoryImage(file: File, maxDim = 720, quality = 0.70): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const name = file.name.replace(/\.[^.]+$/, ".webp");
        resolve(new File([blob], name, { type: "image/webp" }));
      }, "image/webp", quality);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  link_url: string;
  weekly_plan: "free" | "pack_14" | "pack_28";
}

interface Story {
  id: string;
  photo_url: string;
  caption: string | null;
  link_url: string | null;
  expires_at: string;
  views_count: number;
  clicks_count: number;
  created_at: string;
}

const WEEKLY_LIMIT: Record<string, number> = {
  free: 4,
  pack_14: 14,
  pack_28: 28,
};

const isActive = (story: Story) => new Date(story.expires_at) > new Date();

const SponsorDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyUsed, setWeeklyUsed] = useState(0);
  const [newStoryOpen, setNewStoryOpen] = useState(false);
  const [newCaption, setNewCaption] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewStories, setPreviewStories] = useState<SponsorStory[] | null>(null);
  const [compressingStory, setCompressingStory] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState<"pack_14" | "pack_28" | null>(null);
  const [pack14Price, setPack14Price] = useState<string | null>(null);
  const [pack28Price, setPack28Price] = useState<string | null>(null);
  const [upgradeStep, setUpgradeStep] = useState<UpgradeStep>("package");
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD" | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [pixPaymentId, setPixPaymentId] = useState<string | null>(null);
  const [pixAmount, setPixAmount] = useState<number>(0);
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  // Dados do pagador (PIX e Cartão)
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerCpf, setPayerCpf] = useState("");
  // Dados do cartão
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const load = async () => {
    if (!user) return;
    const { data: sp } = await supabase
      .from("sponsors")
      .select("id, name, logo_url, link_url, weekly_plan")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sp) { setLoading(false); return; }
    setSponsor(sp as Sponsor);

    const { data: st } = await supabase
      .from("sponsor_stories")
      .select("id, photo_url, caption, link_url, expires_at, views_count, clicks_count, created_at")
      .eq("sponsor_id", sp.id)
      .order("created_at", { ascending: false });

    const allStories = (st || []) as Story[];
    setStories(allStories);

    // Conta via banco usando fuso America/Sao_Paulo para evitar bugs de meia-noite
    const { data: weekData } = await supabase.rpc("get_sponsor_weekly_used" as any, {
      p_sponsor_id: sp.id,
    });
    setWeeklyUsed(typeof weekData === "number" ? weekData : 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Carrega preços dos pacotes de novidades
    supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["sponsor_pack_14_price", "sponsor_pack_28_price"])
      .then(({ data }) => {
        if (!data) return;
        for (const row of data) {
          const v = typeof row.value === "string" ? row.value : String(row.value);
          if (row.key === "sponsor_pack_14_price") setPack14Price(v);
          if (row.key === "sponsor_pack_28_price") setPack28Price(v);
        }
      });
  }, [user]);

  // Atualiza contadores em tempo real quando views/clicks chegam
  useEffect(() => {
    if (!sponsor) return;
    const channel = supabase
      .channel(`sponsor_stories_counts_${sponsor.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "sponsor_stories",
        filter: `sponsor_id=eq.${sponsor.id}`,
      }, (payload) => {
        setStories((prev) =>
          prev.map((s) => s.id === payload.new.id
            ? { ...s, views_count: (payload.new as Story).views_count, clicks_count: (payload.new as Story).clicks_count }
            : s)
        );
      })
      .subscribe();

    // Também faz polling a cada 30s como fallback
    const interval = setInterval(load, 30000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [sponsor?.id]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Somente imagens são permitidas", variant: "destructive" }); return;
    }
    // Preview imediato (antes de comprimir)
    setNewPreview(URL.createObjectURL(file));

    // Comprime antes de armazenar (especialmente para arquivos pesados)
    setCompressingStory(true);
    try {
      const compressed = await compressStoryImage(file);
      const savedKB = Math.round((file.size - compressed.size) / 1024);
      if (savedKB > 50) {
        console.log(`[Story] Comprimida: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
      }
      setNewFile(compressed);
    } catch {
      setNewFile(file);
    } finally {
      setCompressingStory(false);
    }
  };

  const handlePost = async () => {
    if (!sponsor || !newFile) {
      toast({ title: "Selecione uma imagem", variant: "destructive" }); return;
    }
    const limit = WEEKLY_LIMIT[sponsor.weekly_plan] ?? 4;
    if (weeklyUsed >= limit) {
      toast({ title: `Limite semanal atingido (${limit} novidades)`, variant: "destructive" }); return;
    }
    setPosting(true);
    try {
      const ext = newFile.name.split(".").pop() || "jpg";
      const path = `stories/${sponsor.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("sponsor-stories").upload(path, newFile, {
        contentType: newFile.type, upsert: false,
      });
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = supabase.storage.from("sponsor-stories").getPublicUrl(path);
      const photo_url = urlData.publicUrl;

      const { error: insertErr } = await supabase.from("sponsor_stories").insert({
        sponsor_id: sponsor.id,
        photo_url,
        caption: newCaption.trim() || null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insertErr) throw new Error(insertErr.message);

      toast({ title: "Novidade publicada!", description: "Vai aparecer para os usuários por 24h." });
      setNewStoryOpen(false);
      setNewFile(null);
      setNewPreview(null);
      setNewCaption("");
      load();
    } catch (e: any) {
      toast({ title: "Erro ao publicar", description: e.message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    await supabase.from("sponsor_stories").delete().eq("id", storyId);
    toast({ title: "Novidade removida" });
    load();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const resetUpgradeModal = useCallback(() => {
    setUpgradeStep("package");
    setSelectedPack(null);
    setPaymentMethod(null);
    setPixQrCode(null);
    setPixCopyPaste(null);
    setPixPaymentId(null);
    setProcessing(false);
    if (pollingInterval) { clearInterval(pollingInterval); setPollingInterval(null); }
  }, [pollingInterval]);

  const selectedPackPrice = selectedPack === "pack_28" ? pack28Price : pack14Price;
  const selectedPackAmount = selectedPackPrice ? parseFloat(selectedPackPrice) : 0;

  const handleCreatePayment = async () => {
    if (!sponsor || !selectedPack) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("create_sponsor_payment", {
        body: {
          sponsor_id: sponsor.id,
          pack: selectedPack,
          payment_method: paymentMethod,
          holder_name: payerName || sponsor.name,
          email: payerEmail,
          cpf_cnpj: payerCpf,
          ...(paymentMethod === "CREDIT_CARD" ? {
            card: {
              holderName: cardHolder,
              number: cardNumber.replace(/\s/g, ""),
              expiryMonth: cardExpiry.split("/")[0]?.trim(),
              expiryYear: cardExpiry.split("/")[1]?.trim(),
              ccv: cardCvv,
            },
          } : {}),
        },
      });

      if (error || data?.error) throw new Error(data?.error || error?.message);

      if (paymentMethod === "PIX") {
        setPixQrCode(data.pix_qr_code);
        setPixCopyPaste(data.pix_copy_paste);
        setPixPaymentId(data.payment_id);
        setPixAmount(data.amount);
        setUpgradeStep("pix_qr");

        // Polling para verificar pagamento
        const interval = setInterval(async () => {
          const { data: check } = await supabase.functions.invoke("create_sponsor_payment", {
            body: { action: "check_status", payment_id: data.payment_id },
          });
          if (check?.confirmed) {
            clearInterval(interval);
            setPollingInterval(null);
            setUpgradeStep("success");
            load();
          }
        }, 5000);
        setPollingInterval(interval);
      } else {
        // Cartão: ativação imediata
        setUpgradeStep("success");
        load();
      }
    } catch (e: any) {
      toast({ title: "Erro no pagamento", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const openPreview = (story: Story) => {
    if (!sponsor) return;
    setPreviewStories([{
      id: story.id,
      sponsor_id: sponsor.id,
      sponsor_name: sponsor.name,
      sponsor_logo: sponsor.logo_url,
      photo_url: story.photo_url,
      caption: story.caption,
      link_url: story.link_url,
      sponsor_link: sponsor.link_url,
    }]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!sponsor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 bg-background">
        <Sparkles className="w-12 h-12 text-primary" />
        <h1 className="text-xl font-bold text-center">Conta de patrocinador não configurada</h1>
        <p className="text-sm text-muted-foreground text-center">Entre em contato com a equipe Chamô para configurar seu perfil.</p>
        <button onClick={handleLogout} className="text-sm text-muted-foreground flex items-center gap-1 mt-4">
          <LogOut className="w-4 h-4" /> Sair
        </button>
      </div>
    );
  }

  const limit = WEEKLY_LIMIT[sponsor.weekly_plan] ?? 4;
  const quotaPercent = Math.min((weeklyUsed / limit) * 100, 100);
  const activeStories = stories.filter(isActive);
  const expiredStories = stories.filter((s) => !isActive(s));
  const totalViews = stories.reduce((sum, s) => sum + (s.views_count || 0), 0);
  const totalClicks = stories.reduce((sum, s) => sum + (s.clicks_count || 0), 0);

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-5 pt-12 pb-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 overflow-hidden flex items-center justify-center">
              {sponsor.logo_url ? (
                <img src={sponsor.logo_url} alt={sponsor.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold">{sponsor.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">{sponsor.name}</p>
              <p className="text-primary-foreground/70 text-xs">Painel do Patrocinador</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 rounded-full bg-white/20 text-white">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/15 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-primary-foreground/80" />
              <span className="text-xs text-primary-foreground/70">Visualizações</span>
            </div>
            <p className="text-2xl font-bold">{totalViews.toLocaleString("pt-BR")}</p>
          </div>
          <div className="bg-white/15 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <MousePointerClick className="w-4 h-4 text-primary-foreground/80" />
              <span className="text-xs text-primary-foreground/70">Cliques no link</span>
            </div>
            <p className="text-2xl font-bold">{totalClicks.toLocaleString("pt-BR")}</p>
          </div>
        </div>
      </div>

      <div className="px-5 mt-5 space-y-5">
        {/* Quota semanal */}
        <div className="bg-card border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm">Novidades esta semana</p>
            <span className="text-xs text-muted-foreground">{weeklyUsed}/{limit}</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${quotaPercent}%` }} />
          </div>
          {weeklyUsed >= limit && (
            <p className="text-xs text-destructive mt-2 font-medium">Limite semanal atingido.</p>
          )}
        </div>

        {/* Botão principal */}
        <button
          onClick={() => setNewStoryOpen(true)}
          disabled={weeklyUsed >= limit}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-5 h-5" />
          Lançar Novidade
        </button>

        {/* Botão de upgrade — aparece quando o limite é atingido */}
        {weeklyUsed >= limit && sponsor.weekly_plan !== "pack_28" && (
          <button
            onClick={() => { setSelectedPack(null); setUpgradeOpen(true); }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-primary text-primary font-bold text-sm active:scale-[0.98] transition-transform"
          >
            <ShoppingCart className="w-4 h-4" />
            Adquirir mais limites
          </button>
        )}

        {/* Preview como aparece na Home */}
        <div className="bg-card border rounded-2xl p-4">
          <p className="font-semibold text-sm mb-3">Como aparece para os usuários</p>
          <div className="flex items-center gap-3">
            <div className={`w-16 h-16 rounded-full overflow-hidden flex items-center justify-center ${activeStories.length > 0 ? "ring-2 ring-primary ring-offset-2" : "ring-2 ring-muted"}`}>
              {sponsor.logo_url ? (
                <img src={sponsor.logo_url} alt={sponsor.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <span className="text-sm font-bold text-muted-foreground">{sponsor.name.slice(0, 2).toUpperCase()}</span>
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{sponsor.name}</p>
              <p className={`text-[11px] mt-0.5 ${activeStories.length > 0 ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {activeStories.length > 0 ? `${activeStories.length} novidade(s) ativa(s)` : "Sem novidades ativas"}
              </p>
            </div>
          </div>
        </div>

        {/* Novidades ativas */}
        {activeStories.length > 0 && (
          <div>
            <p className="font-semibold text-sm mb-3">Ativas agora</p>
            <div className="space-y-2">
              {activeStories.map((story) => {
                const expiresIn = new Date(story.expires_at).getTime() - Date.now();
                const hoursLeft = Math.max(0, Math.floor(expiresIn / (1000 * 60 * 60)));
                const minsLeft = Math.max(0, Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60)));
                return (
                  <div key={story.id} className="bg-card border border-primary/20 rounded-2xl overflow-hidden flex">
                    <button onClick={() => openPreview(story)} className="flex-shrink-0">
                      <img src={story.photo_url} alt="story" className="w-20 h-20 object-cover" />
                    </button>
                    <div className="flex-1 min-w-0 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Eye className="w-3.5 h-3.5" /> {story.views_count}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MousePointerClick className="w-3.5 h-3.5" /> {story.clicks_count}
                          </span>
                        </div>
                        <button onClick={() => handleDeleteStory(story.id)} className="p-1 rounded-lg text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {story.caption && <p className="text-xs text-foreground mt-1 truncate">{story.caption}</p>}
                      <div className="flex items-center gap-1 mt-2 text-[10px] text-orange-500">
                        <Clock className="w-3 h-3" />
                        Expira em {hoursLeft}h {minsLeft}min
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Histórico expirado */}
        {expiredStories.length > 0 && (
          <div>
            <p className="font-semibold text-sm mb-3 text-muted-foreground">Histórico (expiradas)</p>
            <div className="space-y-2">
              {expiredStories.slice(0, 10).map((story) => (
                <div key={story.id} className="bg-card border rounded-2xl overflow-hidden flex opacity-60">
                  <div className="flex-shrink-0 w-16 h-16 overflow-hidden">
                    <img src={story.photo_url} alt="story" className="w-full h-full object-cover grayscale" />
                  </div>
                  <div className="flex-1 min-w-0 px-3 py-2 flex items-center gap-4">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Eye className="w-3.5 h-3.5" /> {story.views_count}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><MousePointerClick className="w-3.5 h-3.5" /> {story.clicks_count}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(story.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal nova novidade */}
      <Dialog open={newStoryOpen} onOpenChange={(o) => { if (!posting) { setNewStoryOpen(o); if (!o) { setNewFile(null); setNewPreview(null); setNewCaption(""); } } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Lançar Novidade</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {newPreview ? (
              <div className="relative rounded-2xl overflow-hidden aspect-square bg-muted">
                <img src={newPreview} alt="preview" className="w-full h-full object-cover" />
                <button onClick={() => { setNewFile(null); setNewPreview(null); }} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-2xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/50 transition-colors bg-muted/20">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-1"><Camera className="w-8 h-8 text-muted-foreground" /><span className="text-xs text-muted-foreground">Câmera</span></div>
                  <div className="flex flex-col items-center gap-1"><ImageIcon className="w-8 h-8 text-muted-foreground" /><span className="text-xs text-muted-foreground">Galeria</span></div>
                </div>
                <p className="text-sm text-muted-foreground">Toque para selecionar a imagem</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Legenda (opcional)</label>
              <textarea value={newCaption} onChange={(e) => setNewCaption(e.target.value)} maxLength={150} rows={3} placeholder="Escreva uma mensagem para os usuários..." className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              <p className="text-[11px] text-muted-foreground text-right mt-1">{newCaption.length}/150</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">Esta novidade ficará ativa por 24 horas.</p>
            {compressingStory && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Otimizando imagem...
              </div>
            )}
            <button onClick={handlePost} disabled={posting || !newFile || compressingStory} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50">
              {posting ? "Publicando..." : "Publicar Novidade"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {previewStories && (
        <SponsorStoryViewer stories={previewStories} onClose={() => setPreviewStories(null)} />
      )}

      {/* Modal de upgrade de plano */}
      <Dialog open={upgradeOpen} onOpenChange={(o) => { if (!o) resetUpgradeModal(); setUpgradeOpen(o); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {upgradeStep !== "package" && upgradeStep !== "success" && (
                <button onClick={() => setUpgradeStep(upgradeStep === "method" ? "package" : upgradeStep === "pix_form" || upgradeStep === "card_form" ? "method" : "method")}
                  className="p-1 rounded-lg hover:bg-muted">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <ShoppingCart className="w-5 h-5 text-primary" />
              {upgradeStep === "success" ? "Pacote ativado!" : "Comprar pacote"}
            </DialogTitle>
          </DialogHeader>

          {/* STEP 1: Escolha do pacote */}
          {upgradeStep === "package" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Escolha o pacote de novidades:</p>
              {sponsor.weekly_plan !== "pack_14" && sponsor.weekly_plan !== "pack_28" && (
                <button onClick={() => setSelectedPack("pack_14")}
                  className={`w-full p-4 rounded-2xl border-2 text-left transition-colors ${selectedPack === "pack_14" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">14 novidades/semana</p>
                      <p className="text-xs text-muted-foreground">Pagamento único • renove quando quiser</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-primary">{pack14Price ? `R$ ${parseFloat(pack14Price).toFixed(2).replace(".", ",")}` : "—"}</p>
                      {selectedPack === "pack_14" && <Check className="w-4 h-4 text-primary" />}
                    </div>
                  </div>
                </button>
              )}
              <button onClick={() => setSelectedPack("pack_28")}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-colors ${selectedPack === "pack_28" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">28 novidades/semana</p>
                    <p className="text-xs text-muted-foreground">Pagamento único • renove quando quiser</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 mt-1 inline-block">Mais popular</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-primary">{pack28Price ? `R$ ${parseFloat(pack28Price).toFixed(2).replace(".", ",")}` : "—"}</p>
                    {selectedPack === "pack_28" && <Check className="w-4 h-4 text-primary" />}
                  </div>
                </div>
              </button>
              <button disabled={!selectedPack}
                onClick={() => setUpgradeStep("method")}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 transition-colors">
                Continuar
              </button>
            </div>
          )}

          {/* STEP 2: Forma de pagamento */}
          {upgradeStep === "method" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Como deseja pagar?</p>
              <button onClick={() => { setPaymentMethod("PIX"); setUpgradeStep("pix_form"); }}
                className="w-full p-4 rounded-2xl border-2 border-border hover:border-primary/50 text-left transition-colors">
                <div className="flex items-center gap-3">
                  <QrCode className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="font-bold text-sm">PIX</p>
                    <p className="text-xs text-muted-foreground">QR code gerado na hora. Compra única.</p>
                  </div>
                </div>
              </button>
              <button onClick={() => { setPaymentMethod("CREDIT_CARD"); setUpgradeStep("card_form"); }}
                className="w-full p-4 rounded-2xl border-2 border-border hover:border-primary/50 text-left transition-colors">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="font-bold text-sm">Cartão de Crédito</p>
                    <p className="text-xs text-muted-foreground">Pagamento único. Compre de novo quando precisar.</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* STEP 3a: Dados para PIX */}
          {upgradeStep === "pix_form" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Informe seus dados para gerar o PIX:</p>
              {[
                { label: "Nome completo", value: payerName, set: setPayerName, placeholder: "Seu nome" },
                { label: "E-mail", value: payerEmail, set: setPayerEmail, placeholder: "seu@email.com" },
                { label: "CPF ou CNPJ", value: payerCpf, set: setPayerCpf, placeholder: "000.000.000-00" },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                  <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              ))}
              <button disabled={!payerName || !payerCpf || processing}
                onClick={handleCreatePayment}
                className="w-full py-3.5 rounded-2xl bg-green-500 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                {processing ? "Gerando PIX..." : "Gerar QR Code PIX"}
              </button>
            </div>
          )}

          {/* STEP 3b: QR Code PIX */}
          {upgradeStep === "pix_qr" && pixQrCode && (
            <div className="space-y-4 text-center">
              <p className="text-sm font-semibold">Escaneie o QR Code para pagar</p>
              <p className="text-xs text-muted-foreground">Valor: <strong>R$ {pixAmount.toFixed(2).replace(".", ",")}</strong></p>
              <div className="flex justify-center">
                <img src={`data:image/png;base64,${pixQrCode}`} alt="PIX QR Code" className="w-48 h-48 rounded-2xl border" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Código PIX Copia e Cola:</p>
                <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                  <p className="flex-1 text-[10px] text-foreground truncate font-mono">{pixCopyPaste}</p>
                  <button onClick={() => { navigator.clipboard.writeText(pixCopyPaste || ""); toast({ title: "Código copiado!" }); }}
                    className="shrink-0 p-1 rounded-lg hover:bg-background transition-colors">
                    <Copy className="w-3.5 h-3.5 text-primary" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">Aguardando confirmação do pagamento...</p>
              </div>
              <p className="text-[10px] text-muted-foreground">O plano será ativado automaticamente após o pagamento.</p>
            </div>
          )}

          {/* STEP 3c: Dados do Cartão */}
          {upgradeStep === "card_form" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Dados do cartão de crédito:</p>
              {[
                { label: "Nome no cartão", value: cardHolder, set: setCardHolder, placeholder: "NOME SOBRENOME" },
                { label: "Número do cartão", value: cardNumber, set: setCardNumber, placeholder: "0000 0000 0000 0000" },
                { label: "CPF/CNPJ do titular", value: payerCpf, set: setPayerCpf, placeholder: "000.000.000-00" },
                { label: "E-mail", value: payerEmail, set: setPayerEmail, placeholder: "seu@email.com" },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                  <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Validade (MM/AAAA)</label>
                  <input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="12/2028"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">CVV</label>
                  <input value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} placeholder="123" maxLength={4}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Valor: R$ {selectedPackAmount.toFixed(2).replace(".", ",")}/mês • Renovação automática</p>
              <button disabled={!cardHolder || !cardNumber || !cardExpiry || !cardCvv || !payerCpf || processing}
                onClick={handleCreatePayment}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {processing ? "Processando..." : `Assinar por R$ ${selectedPackAmount.toFixed(2).replace(".", ",")}/mês`}
              </button>
            </div>
          )}

          {/* STEP 4: Sucesso */}
          {upgradeStep === "success" && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
              <div>
                <p className="font-bold text-lg text-foreground">Pacote ativado!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Seu limite foi ampliado para{" "}
                  {selectedPack === "pack_28" ? "28" : "14"} novidades por semana.
                  Quando atingir o limite, basta comprar novamente.
                </p>
              </div>
              <button onClick={() => { resetUpgradeModal(); setUpgradeOpen(false); }}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm">
                Ótimo, continuar!
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SponsorDashboard;
