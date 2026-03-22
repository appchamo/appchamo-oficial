import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useRefresh } from "@/contexts/RefreshContext";
import { ArrowLeft, BadgeCheck, Star, Clock, CalendarOff, FileQuestion, Circle, Pencil, Check, X, Calendar, Share2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ImageCropUpload from "@/components/ImageCropUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductCatalog from "@/components/ProductCatalog";
import ProfessionalServices from "@/components/ProfessionalServices";
import ServiceRequestDialog from "@/components/ServiceRequestDialog";
import AgendaBookingDialog from "@/components/AgendaBookingDialog";

interface ProData {
  id: string;
  experience: string | null;
  services: string[] | null;
  bio: string | null;
  rating: number;
  total_services: number;
  total_reviews: number;
  verified: boolean;
  user_id: string;
  profile_status: string;
  availability_status: string;
  full_name: string;
  avatar_url: string | null;
  category_id: string | null;
  profession_id: string | null;
  category_name: string;
  profession_name: string;
  user_type: string;
  agenda_enabled?: boolean;
  slug: string | null;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  client_name: string;
}

const availabilityOptions = [
  { value: "available", label: "Disponível", icon: Circle, color: "text-green-500" },
  { value: "quotes_only", label: "Somente orçamentos", icon: FileQuestion, color: "text-amber-500" },
  { value: "busy", label: "Agenda fechada", icon: Clock, color: "text-orange-500" },
  { value: "unavailable", label: "Indisponível", icon: CalendarOff, color: "text-destructive" },
];

const ProfessionalProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [pro, setPro] = useState<ProData | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [agendaDialogOpen, setAgendaDialogOpen] = useState(false);

  // Estado para edição do nome
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  // Categoria e profissão (para edição pelo dono)
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [professions, setProfessions] = useState<{ id: string; name: string; category_id: string }[]>([]);
  const [savingCategoryProfession, setSavingCategoryProfession] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const baseQuery = supabase
        .from("professionals")
        .select("id, experience, services, bio, rating, total_services, total_reviews, verified, user_id, profile_status, availability_status, category_id, profession_id, categories(name), professions:profession_id(name), agenda_enabled, slug");
    const { data } = await (isUUID ? baseQuery.eq("id", id) : baseQuery.eq("slug", id)).maybeSingle();
        
      if (data) {
        let profileData = null;

        // 1. Tenta buscar da tabela principal 'profiles'
        const { data: mainProfile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url, user_type")
          .eq("user_id", data.user_id)
          .maybeSingle();
        
        if (mainProfile) {
          profileData = mainProfile;
        } else {
          // 2. Fallback para a view 'profiles_public' caso exista bloqueio de segurança
          const { data: publicProfile } = await supabase
            .from("profiles_public" as any)
            .select("full_name, avatar_url, user_type")
            .eq("user_id", data.user_id)
            .maybeSingle();
          if (publicProfile) profileData = publicProfile;
        }

        setPro({
          ...data,
          full_name: profileData?.full_name || "Profissional",
          avatar_url: profileData?.avatar_url || null,
          category_id: (data as any).category_id || null,
          profession_id: (data as any).profession_id || null,
          category_name: (data.categories as any)?.name || "Sem categoria",
          profession_name: (data.professions as any)?.name || "—",
          availability_status: (data as any).availability_status || "available",
          user_type: profileData?.user_type || "professional",
          agenda_enabled: !!(data as any).agenda_enabled,
          slug: (data as any).slug || null,
        });
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.id === data.user_id) setIsOwner(true);

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("plan_id")
          .eq("user_id", data.user_id)
          .maybeSingle();
        if (sub && (sub as { plan_id: string }).plan_id) setPlanId((sub as { plan_id: string }).plan_id);

        if (user && user.id === data.user_id) {
          const [catRes, profRes] = await Promise.all([
            supabase.from("categories").select("id, name").eq("active", true).order("sort_order"),
            supabase.from("professions").select("id, name, category_id").eq("active", true).order("name"),
          ]);
          setCategories(catRes.data || []);
          setProfessions(profRes.data || []);
        }

        // Fetch reviews
        const { data: reviewsData } = await supabase
          .from("reviews" as any)
          .select("id, rating, comment, created_at, client_id")
          .eq("professional_id", data.id)
          .order("created_at", { ascending: false }) as { data: any[] | null };

        if (reviewsData && reviewsData.length > 0) {
          const clientIds = [...new Set(reviewsData.map((r: any) => r.client_id))];
          const { data: clientProfiles } = await supabase
            .from("profiles_public" as any)
            .select("user_id, full_name")
            .in("user_id", clientIds) as { data: { user_id: string; full_name: string }[] | null };
          const nameMap = new Map((clientProfiles || []).map(p => [p.user_id, p.full_name]));

          setReviews(reviewsData.map((r: any) => ({
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
            client_name: nameMap.get(r.client_id) || "Cliente",
          })));
        }
      }
    setLoading(false);
  }, [id]);

  useRefresh(loadProfile);

  useEffect(() => {
    if (id) loadProfile();
  }, [id, loadProfile]);

  // Realtime: listen for availability_status changes on this professional (use actual UUID, not slug)
  useEffect(() => {
    if (!pro?.id) return;
    const channel = supabase
      .channel(`pro-status-${pro.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "professionals", filter: `id=eq.${pro.id}` },
        (payload) => {
          const updated = payload.new as any;
          setPro(prev => prev ? { ...prev, availability_status: updated.availability_status, verified: updated.verified, rating: updated.rating, total_reviews: updated.total_reviews, total_services: updated.total_services } : prev);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pro?.id]);

  const handlePhotoUpload = async (url: string) => {
    if (!pro) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", pro.user_id);
    if (error) { toast({ title: "Erro ao salvar foto", variant: "destructive" }); return; }
    setPro(prev => prev ? { ...prev, avatar_url: url } : prev);
    toast({ title: "Foto atualizada!" });
  };

  const handleStatusChange = async (status: string) => {
    if (!pro) return;
    await supabase.from("professionals").update({ availability_status: status }).eq("id", pro.id);
    setPro(prev => prev ? { ...prev, availability_status: status } : prev);
    toast({ title: "Status atualizado!" });
  };

  const handleNameSave = async () => {
    if (!pro || !editNameValue.trim()) return;
    const { error } = await supabase.from("profiles").update({ full_name: editNameValue.trim() }).eq("user_id", pro.user_id);
    if (error) { toast({ title: "Erro ao atualizar nome", variant: "destructive" }); return; }

    // Regenerate slug from new name
    const { data: newSlug } = await supabase.rpc("generate_professional_slug" as any, {
      p_user_id: pro.user_id,
      p_base_name: editNameValue.trim(),
    });
    if (newSlug) {
      await supabase.from("professionals").update({ slug: newSlug } as any).eq("id", pro.id);
      setPro(prev => prev ? { ...prev, full_name: editNameValue.trim(), slug: newSlug } : prev);
    } else {
      setPro(prev => prev ? { ...prev, full_name: editNameValue.trim() } : prev);
    }
    setEditingName(false);
    toast({ title: "Nome atualizado!" });
  };

  const handleCategoryChange = async (categoryId: string) => {
    if (!pro) return;
    setSavingCategoryProfession(true);
    const { error } = await supabase.from("professionals").update({ category_id: categoryId || null, profession_id: null }).eq("id", pro.id);
    setSavingCategoryProfession(false);
    if (error) { toast({ title: "Erro ao atualizar categoria", variant: "destructive" }); return; }
    const cat = categories.find(c => c.id === categoryId);
    setPro(prev => prev ? { ...prev, category_id: categoryId || null, profession_id: null, category_name: cat?.name || "—", profession_name: "—" } : prev);
    toast({ title: "Categoria atualizada!" });
  };

  const handleProfessionChange = async (professionId: string) => {
    if (!pro) return;
    setSavingCategoryProfession(true);
    const { error } = await supabase.from("professionals").update({ profession_id: professionId || null }).eq("id", pro.id);
    setSavingCategoryProfession(false);
    if (error) { toast({ title: "Erro ao atualizar profissão", variant: "destructive" }); return; }
    const prof = professions.find(p => p.id === professionId);
    setPro(prev => prev ? { ...prev, profession_id: professionId || null, profession_name: prof?.name || "—" } : prev);
    toast({ title: "Profissão atualizada!" });
  };

  const handleShareLink = async () => {
    if (!pro?.slug) return;
    const link = `https://appchamo.com/professional/${pro.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: pro.full_name, text: `Veja o perfil de ${pro.full_name} no Chamô`, url: link });
        return;
      } catch {
        // user cancelled or not supported — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copiado!", description: link });
    } catch {
      toast({ title: link, description: "Copie o link acima manualmente" });
    }
  };

  const handleCopyLink = () => handleShareLink();

  const handleCall = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login", { state: { from: location.pathname } }); return; }
    setCallDialogOpen(true);
  };

  if (loading) return <AppLayout><main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Carregando...</main></AppLayout>;
  if (!pro) return <AppLayout><main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Profissional não encontrado</main></AppLayout>;

  const name = pro.full_name;
  const avatarUrl = pro.avatar_url;
  const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const currentAvailability = availabilityOptions.find(o => o.value === pro.availability_status) || availabilityOptions[0];

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/search" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        {/* Main Card */}
        <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
          <div className="flex items-start gap-4">
            <div className="relative flex-shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} className="w-20 h-20 rounded-2xl object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">{initials}</div>
              )}
              {isOwner && (
                <div className="absolute -bottom-1 -right-1">
                  <ImageCropUpload onUpload={handlePhotoUpload} aspect={1} shape="round" bucketPath="professionals" currentImage={avatarUrl} label="" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {editingName ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      className="flex-1 border rounded-lg px-2 py-1 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                      autoFocus
                    />
                    <button onClick={handleNameSave} className="p-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditingName(false)} className="p-1.5 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-lg font-bold text-foreground truncate">{name}</h1>
                    {isOwner && (
                      <>
                        <button onClick={() => { setEditNameValue(name); setEditingName(true); }} className="ml-1 p-1 text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {pro.slug && (
                          <button onClick={handleShareLink} className="p-1 text-muted-foreground hover:text-primary transition-colors flex-shrink-0" title="Compartilhar perfil">
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {!editingName && (
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <p className="text-base font-semibold text-primary truncate">
                    {pro.profession_name && pro.profession_name !== "—" ? pro.profession_name : pro.category_name}
                  </p>
                  {pro.verified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex-shrink-0">
                      <BadgeCheck className="w-3.5 h-3.5 fill-emerald-100" />
                      Verificado
                    </span>
                  )}
                </div>
              )}

              {isOwner && categories.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center mt-1.5">
                  <select
                    value={pro.category_id || ""}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    disabled={savingCategoryProfession}
                    className="border rounded-lg px-2 py-1 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    value={pro.profession_id || ""}
                    onChange={(e) => handleProfessionChange(e.target.value)}
                    disabled={savingCategoryProfession}
                    className="border rounded-lg px-2 py-1 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">— Profissão —</option>
                    {professions.filter((pr) => pr.category_id === (pro.category_id || "")).map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold mt-0.5 ${
                pro.user_type === "company" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {pro.user_type === "company" ? "Empresa" : "Profissional"}
              </span>

              {/* Availability Status */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <currentAvailability.icon className={`w-3 h-3 ${currentAvailability.color} fill-current`} />
                <span className={`text-xs font-medium ${currentAvailability.color}`}>{currentAvailability.label}</span>
              </div>

              {isOwner && pro.profile_status !== "approved" && (
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  pro.profile_status === "pending" ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"
                }`}>
                  {pro.profile_status === "pending" ? "Em análise" : "Reprovado"}
                </span>
              )}
              <div className="flex items-center gap-3 mt-2 text-sm">
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <strong>{Number(pro.rating).toFixed(1)}</strong>
                </span>
                <span className="text-muted-foreground">{pro.total_services} serviços</span>
                <span className="text-muted-foreground">{pro.total_reviews} avaliações</span>
              </div>
            </div>
          </div>

          {/* Owner: change availability */}
          {isOwner && (
            <div className="mt-4 pt-3 border-t space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status de disponibilidade</label>
                <Select value={pro.availability_status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availabilityOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex items-center gap-2">
                          <o.icon className={`w-3 h-3 ${o.color} fill-current`} />
                          {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {pro.slug && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Seu link público</label>
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <span className="text-xs text-muted-foreground flex-1 truncate">
                      appchamo.com/professional/{pro.slug}
                    </span>
                    <button
                      onClick={handleCopyLink}
                      className="text-xs text-primary font-semibold hover:underline flex-shrink-0"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isOwner && pro.availability_status !== "unavailable" && (
            <div className="mt-5 flex flex-col gap-2">
              {pro.agenda_enabled && (pro.user_type === "company" || planId === "business") && (
                <button
                  onClick={() => setAgendaDialogOpen(true)}
                  className="w-full py-3 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Agendar Serviço
                </button>
              )}
              <button onClick={handleCall} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center">
                CHAMAR
              </button>
            </div>
          )}
          {!isOwner && pro.availability_status === "unavailable" && (
            <div className="mt-5">
              <div className="w-full py-3 rounded-xl bg-muted text-muted-foreground font-medium text-sm text-center">
                Profissional indisponível no momento
              </div>
            </div>
          )}
        </div>

        {/* Experiência, Serviços e Sobre */}
        {(pro.experience || (pro.services && pro.services.length > 0) || pro.bio) && (
          <div className="bg-card border rounded-2xl p-5 shadow-card mb-4 space-y-4">
            {pro.experience && (
              <div>
                <h2 className="font-semibold text-foreground mb-2">Experiência</h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{pro.experience}</p>
              </div>
            )}
            {pro.services && pro.services.length > 0 && (
              <div>
                <h2 className="font-semibold text-foreground mb-2">Serviços</h2>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  {pro.services.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {pro.bio && (
              <div>
                <h2 className="font-semibold text-foreground mb-2">Sobre</h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{pro.bio}</p>
              </div>
            )}
          </div>
        )}

        {/* Serviços (fotos) para Pro e VIP */}
        {(planId === "pro" || planId === "vip") && (
          <ProfessionalServices professionalId={pro.id} isOwner={isOwner} />
        )}
        {/* Catálogo de produtos para Business (empresa) */}
        {(pro.user_type === "company" || planId === "business") && (
          <ProductCatalog professionalId={pro.id} isOwner={isOwner} />
        )}

        {/* Reviews */}
        <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <h2 className="font-semibold text-foreground">Avaliações</h2>
            <Badge variant="secondary" className="text-[10px]">{pro.total_reviews}</Badge>
          </div>

          {/* Rating summary */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-muted/50 rounded-xl">
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{Number(pro.rating).toFixed(1)}</p>
              <div className="flex gap-0.5 mt-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`w-3 h-3 ${s <= Math.round(pro.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{pro.total_reviews} avaliações · {pro.total_services} serviços realizados</p>
          </div>

          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma avaliação ainda.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {reviews.map(r => (
                <div key={r.id} className="border-t pt-3">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">{r.client_name}</p>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className={`w-3 h-3 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {pro && (
          <>
            <ServiceRequestDialog
              open={callDialogOpen}
              onOpenChange={setCallDialogOpen}
              professionalId={pro.id}
              professionalName={pro.full_name}
            />
            {pro.agenda_enabled && (pro.user_type === "company" || planId === "business") && (
              <AgendaBookingDialog
                open={agendaDialogOpen}
                onOpenChange={setAgendaDialogOpen}
                professionalId={pro.id}
                professionalName={pro.full_name}
                professionalUserId={pro.user_id}
                professionalAvatarUrl={pro.avatar_url}
              />
            )}
          </>
        )}
      </main>
    </AppLayout>
  );
};

export default ProfessionalProfile;