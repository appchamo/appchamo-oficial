import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Eye, MousePointerClick, Plus, Sparkles, LogOut, Clock, Trash2, Camera, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SponsorStoryViewer, { SponsorStory } from "@/components/SponsorStoryViewer";

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

    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    startOfWeek.setHours(0, 0, 0, 0);
    const usedThisWeek = allStories.filter((s) => new Date(s.created_at) >= startOfWeek).length;
    setWeeklyUsed(usedThisWeek);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Somente imagens são permitidas", variant: "destructive" }); return;
    }
    setNewFile(file);
    setNewPreview(URL.createObjectURL(file));
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
    navigate("/login");
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
            <p className="text-xs text-destructive mt-2">
              Limite semanal atingido.{sponsor.weekly_plan === "free" && " Fale com a equipe Chamô para ampliar."}
            </p>
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
            <button onClick={handlePost} disabled={posting || !newFile} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50">
              {posting ? "Publicando..." : "Publicar Novidade"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {previewStories && (
        <SponsorStoryViewer stories={previewStories} onClose={() => setPreviewStories(null)} />
      )}
    </div>
  );
};

export default SponsorDashboard;
