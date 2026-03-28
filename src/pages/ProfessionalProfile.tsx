import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useRefreshAtKey } from "@/contexts/RefreshContext";
import {
  ArrowLeft,
  ChevronRight,
  BadgeCheck,
  Star,
  Clock,
  CalendarOff,
  FileQuestion,
  Circle,
  Pencil,
  Check,
  X,
  Calendar,
  Share2,
  Building2,
  Loader2,
  Timer,
  Award,
  MapPin,
  UserPlus,
  Heart,
  MessageSquare,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ImageCropUpload from "@/components/ImageCropUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductCatalog from "@/components/ProductCatalog";
import ProfessionalServices from "@/components/ProfessionalServices";
import { ProfessionalSealIcon } from "@/components/seals/ProfessionalSealIcon";
import { sortPublicSealsForDisplay } from "@/components/seals/FeaturedSealStack";
import ServiceRequestDialog from "@/components/ServiceRequestDialog";
import AgendaBookingDialog from "@/components/AgendaBookingDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getProfessionalProfileShareUrl } from "@/lib/publicAppUrl";
import { formatAvgResponseSeconds } from "@/lib/formatAvgResponse";
import { useAuth } from "@/hooks/useAuth";
import { incrementProfessionalAnalytics } from "@/lib/proAnalytics";
import { cn } from "@/lib/utils";

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
  cover_image_url: string | null;
  avg_response_seconds?: number | null;
  avg_response_sample_count?: number;
  avg_response_computed_at?: string | null;
  address_city?: string | null;
  address_state?: string | null;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  client_name: string;
  client_avatar: string | null;
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
  const { user, profile: authProfile, loading: authLoading } = useAuth();
  const [pro, setPro] = useState<ProData | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [profileGateOpen, setProfileGateOpen] = useState(false);
  const [agendaDialogOpen, setAgendaDialogOpen] = useState(false);
  const [avatarLightbox, setAvatarLightbox] = useState(false);

  // Estado para edição do nome
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  // Categoria e profissão (para edição pelo dono)
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [professions, setProfessions] = useState<{ id: string; name: string; category_id: string }[]>([]);
  const [savingCategoryProfession, setSavingCategoryProfession] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [reviewsVisible, setReviewsVisible] = useState(5);
  const [publicSeals, setPublicSeals] = useState<{ seal_id: string; title: string; icon_variant: string }[]>([]);
  const [sealsModalOpen, setSealsModalOpen] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [dmOpening, setDmOpening] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const baseQuery = supabase
        .from("professionals")
        .select(
          "id, experience, services, bio, rating, total_services, total_reviews, verified, user_id, profile_status, availability_status, category_id, profession_id, categories(name), professions:profession_id(name), agenda_enabled, slug, cover_image_url, avg_response_seconds, avg_response_sample_count, avg_response_computed_at",
        );
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

        const { data: proLocation } = await supabase
          .from("profiles")
          .select("address_city, address_state")
          .eq("user_id", data.user_id)
          .maybeSingle();

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
          cover_image_url: (data as any).cover_image_url || null,
          avg_response_seconds: (data as any).avg_response_seconds ?? null,
          avg_response_sample_count: Number((data as any).avg_response_sample_count) || 0,
          avg_response_computed_at: (data as any).avg_response_computed_at ?? null,
          address_city: proLocation?.address_city ?? null,
          address_state: proLocation?.address_state ?? null,
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
            .select("user_id, full_name, avatar_url")
            .in("user_id", clientIds) as { data: { user_id: string; full_name: string; avatar_url: string | null }[] | null };
          const nameMap = new Map((clientProfiles || []).map(p => [p.user_id, { name: p.full_name, avatar: p.avatar_url }]));

          setReviews(reviewsData.map((r: any) => ({
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
            client_name: nameMap.get(r.client_id)?.name || "Cliente",
            client_avatar: nameMap.get(r.client_id)?.avatar || null,
          })));
        } else {
          setReviews([]);
        }

        const { data: sealRows } = await supabase.rpc("public_professional_seals" as any, {
          p_ids: [data.id],
        });
        type PubSeal = { seal_id?: string; title: string; icon_variant: string; sort_order: number; is_special: boolean };
        const sortedSeals = sortPublicSealsForDisplay((sealRows || []) as PubSeal[]);
        setPublicSeals(
          sortedSeals.map((s, i) => ({
            seal_id: s.seal_id ?? `seal-${i}-${s.title}`,
            title: s.title,
            icon_variant: s.icon_variant,
          }))
        );
      } else {
        setPublicSeals([]);
      }
    setLoading(false);
  }, [id]);

  useRefreshAtKey(location.pathname, loadProfile);

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

  useEffect(() => {
    if (!pro || isOwner) return;
    incrementProfessionalAnalytics(pro.user_id, "profile_click");
  }, [pro?.user_id, isOwner]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pro || isOwner) {
        setIsFollowing(false);
        setIsFavorite(false);
        setSocialLoading(false);
        return;
      }
      if (!user?.id) {
        setIsFollowing(false);
        setIsFavorite(false);
        setSocialLoading(false);
        return;
      }
      setSocialLoading(true);
      const [fr, fav] = await Promise.all([
        supabase.from("professional_follows").select("id").eq("user_id", user.id).eq("professional_id", pro.id).maybeSingle(),
        supabase.from("professional_favorites").select("id").eq("user_id", user.id).eq("professional_id", pro.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setIsFollowing(!!fr.data);
      setIsFavorite(!!fav.data);
      setSocialLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pro?.id, isOwner, user?.id]);

  const requireUserForSocial = async () => {
    if (authLoading) {
      toast({ title: "Aguarde", description: "Carregando seus dados…" });
      return null;
    }
    const u = user ?? (await supabase.auth.getUser()).data.user;
    if (!u) {
      navigate("/login", { state: { from: location.pathname } });
      return null;
    }
    return u;
  };

  const toggleFollow = async () => {
    if (!pro || followBusy) return;
    const u = await requireUserForSocial();
    if (!u) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        const { error } = await supabase.from("professional_follows").delete().eq("user_id", u.id).eq("professional_id", pro.id);
        if (error) throw error;
        setIsFollowing(false);
        toast({ title: "Você deixou de seguir" });
      } else {
        const { error } = await supabase.from("professional_follows").insert({ user_id: u.id, professional_id: pro.id });
        if (error) throw error;
        setIsFollowing(true);
        toast({ title: "Seguindo!" });
      }
    } catch {
      toast({ title: "Não foi possível atualizar", variant: "destructive" });
    } finally {
      setFollowBusy(false);
    }
  };

  const toggleFavorite = async () => {
    if (!pro || favoriteBusy) return;
    const u = await requireUserForSocial();
    if (!u) return;
    setFavoriteBusy(true);
    try {
      if (isFavorite) {
        const { error } = await supabase.from("professional_favorites").delete().eq("user_id", u.id).eq("professional_id", pro.id);
        if (error) throw error;
        setIsFavorite(false);
        toast({ title: "Removido dos favoritos" });
      } else {
        const { error } = await supabase.from("professional_favorites").insert({ user_id: u.id, professional_id: pro.id });
        if (error) throw error;
        setIsFavorite(true);
        toast({ title: "Salvo nos favoritos" });
      }
    } catch {
      toast({ title: "Não foi possível atualizar", variant: "destructive" });
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handlePhotoUpload = async (url: string) => {
    if (!pro) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", pro.user_id);
    if (error) { toast({ title: "Erro ao salvar foto", variant: "destructive" }); return; }
    setPro(prev => prev ? { ...prev, avatar_url: url } : prev);
    toast({ title: "Foto atualizada!" });
  };

  const handleCoverUpload = async (url: string) => {
    if (!pro) return;
    const { error } = await supabase.from("professionals").update({ cover_image_url: url } as any).eq("id", pro.id);
    if (error) { toast({ title: "Erro ao salvar capa", variant: "destructive" }); return; }
    setPro(prev => prev ? { ...prev, cover_image_url: url } : prev);
    toast({ title: "Capa atualizada!" });
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

  const profilePathKey = pro && (pro.slug || id) ? (pro.slug || id)!.trim() : "";
  /** URL canónica `/professional/...` — crawlers recebem OG via middleware na Vercel. */
  const profileLink = profilePathKey ? getProfessionalProfileShareUrl(profilePathKey) : null;
  const profileLinkDisplay = profileLink ? profileLink.replace(/^https?:\/\//, "") : null;

  const handleShareLink = async () => {
    if (!profileLink || !pro) return;
    if (navigator.share) {
      try {
        const role =
          pro.profession_name && pro.profession_name !== "—"
            ? pro.profession_name
            : pro.category_name && pro.category_name !== "—"
              ? pro.category_name
              : "Profissional";
        await navigator.share({
          title: `${pro.full_name} - ${role} - Perfil Oficial | Chamô`,
          text: `Confira o perfil de ${pro.full_name} no Chamô.`,
          url: profileLink,
        });
        return;
      } catch {
        // cancelado ou não suportado — cai para cópia
      }
    }
    handleCopyLink();
  };

  const handleCopyLink = async () => {
    if (!profileLink) return;
    try {
      await navigator.clipboard.writeText(profileLink);
      toast({ title: "Link copiado!", description: "Pronto para WhatsApp, Instagram ou navegador." });
    } catch {
      toast({ title: "Seu link:", description: profileLink });
    }
  };

  const openFollowingDirectMessage = async () => {
    if (!pro) return;
    if (authLoading) {
      toast({ title: "Aguarde", description: "Carregando seus dados…" });
      return;
    }
    const u = user ?? (await supabase.auth.getUser()).data.user;
    if (!u) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    if (!isFollowing) {
      toast({ title: "Siga o perfil", description: "Para enviar mensagem direta, siga este profissional primeiro." });
      return;
    }
    setDmOpening(true);
    try {
      const { data: threadId, error } = await supabase.rpc("ensure_following_direct_thread", {
        p_professional_id: pro.id,
      });
      if (error) throw error;
      if (!threadId) throw new Error("Thread não retornada");
      navigate(`/messages/${threadId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: "Não foi possível abrir o chat",
        description: msg || "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setDmOpening(false);
    }
  };

  const handleCall = async () => {
    if (pro) incrementProfessionalAnalytics(pro.user_id, "call_click");
    if (authLoading) {
      toast({ title: "Aguarde", description: "Carregando seus dados…" });
      return;
    }
    const u = user ?? (await supabase.auth.getUser()).data.user;
    if (!u) { navigate("/login", { state: { from: location.pathname } }); return; }
    const nameFromMeta = (u.user_metadata?.full_name ?? u.user_metadata?.name ?? "") as string;
    const nameOk = (authProfile?.full_name?.trim() || nameFromMeta.trim()).length > 0;
    const photoOk = !!(authProfile?.avatar_url && String(authProfile.avatar_url).trim());
    if (!nameOk || !photoOk) {
      setProfileGateOpen(true);
      return;
    }
    setCallDialogOpen(true);
  };

  if (loading) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[45vh] gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando perfil…</p>
        </main>
      </AppLayout>
    );
  }
  if (!pro) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground mb-4">Profissional não encontrado.</p>
          <Link to="/home" className="text-sm font-semibold text-primary hover:underline">
            Ir para o início
          </Link>
        </main>
      </AppLayout>
    );
  }

  const name = pro.full_name;
  const avatarUrl = pro.avatar_url;
  const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const currentAvailability = availabilityOptions.find(o => o.value === pro.availability_status) || availabilityOptions[0];
  const locationLine =
    pro.address_city || pro.address_state
      ? [pro.address_city, pro.address_state].filter(Boolean).join(", ")
      : null;

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 pt-2 pb-5">
        <Link
          to="/home"
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground bg-card border border-border/80 hover:border-primary/30 hover:bg-muted/50 px-3 py-2 rounded-xl mb-3 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" /> Voltar
        </Link>

        {/* ── Main Card — Hero redesenhado ── */}
        <div className="bg-card border rounded-2xl shadow-card mb-4 overflow-hidden">

          {/* ── Capa do perfil ── */}
          <div className="h-40 w-full relative overflow-hidden">
            {/* Imagem de capa ou gradiente padrão */}
            {pro.cover_image_url ? (
              <img
                src={pro.cover_image_url}
                alt="Capa"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 60%, #c2410c 100%)" }} />
            )}
            {/* Overlay escuro suave para não misturar com a foto do perfil */}
            <div className="absolute inset-0 bg-black/25" />

            {/* Botão upload da capa (só para o dono) */}
            {isOwner && (
              <div className="absolute bottom-2 right-2 z-10">
                <ImageCropUpload
                  onUpload={handleCoverUpload}
                  aspect={16 / 6}
                  shape="rect"
                  bucketPath="professionals"
                  currentImage={pro.cover_image_url || undefined}
                  label="Alterar capa"
                  maxSize={900}
                  quality={0.68}
                />
              </div>
            )}

            {/* Compartilhar (owner) */}
            {isOwner && profileLink && (
              <button
                type="button"
                onClick={handleShareLink}
                className="absolute top-3 right-3 h-9 px-3 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center gap-1.5 hover:bg-black/50 transition-colors border border-white/10"
                title="Compartilhar perfil"
              >
                <Share2 className="w-4 h-4 text-white" />
                <span className="text-xs font-semibold text-white hidden sm:inline">Compartilhar</span>
              </button>
            )}
          </div>

          <div className="px-5 pb-5">
            {/* Avatar — sobrepõe a faixa */}
            <div className="flex items-end justify-between -mt-12 mb-3">
              <div className="relative">
                <button
                  className="block focus:outline-none group"
                  onClick={() => avatarUrl && setAvatarLightbox(true)}
                  title={avatarUrl ? "Ver foto" : undefined}
                  style={{ cursor: avatarUrl ? "pointer" : "default" }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="w-24 h-24 rounded-2xl object-cover border-4 border-card shadow-lg group-hover:brightness-90 transition-all"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-muted border-4 border-card shadow-lg flex items-center justify-center text-2xl font-bold text-muted-foreground">
                      {initials}
                    </div>
                  )}
                </button>
                {isOwner && (
                  <div className="absolute -bottom-1 -right-1">
                    <ImageCropUpload onUpload={handlePhotoUpload} aspect={1} shape="round" bucketPath="professionals" currentImage={avatarUrl} label="" maxSize={336} quality={0.7} />
                  </div>
                )}
              </div>

              {/* Avaliação + quantidade de serviços — canto direito, mesma linha do avatar */}
              <div className="flex items-center gap-1.5 mb-1 flex-wrap justify-end max-w-[55%] text-xs text-muted-foreground">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />
                <span className="font-bold text-foreground">{Number(pro.rating).toFixed(1)}</span>
                <span>({pro.total_reviews})</span>
                <span className="text-muted-foreground/80">·</span>
                <span>{pro.total_services} serviços</span>
              </div>
            </div>

            {/* Nome + edição */}
            {editingName ? (
              <div className="flex items-center gap-2 mb-2">
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
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-foreground leading-tight">{name}</h1>
                {isOwner && (
                  <button onClick={() => { setEditNameValue(name); setEditingName(true); }} className="p-1 text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Profissão */}
            {!editingName && (
              <p className="text-sm font-semibold text-primary mb-2">
                {pro.profession_name && pro.profession_name !== "—" ? pro.profession_name : pro.category_name}
              </p>
            )}

            {locationLine ? (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{locationLine}</span>
              </div>
            ) : null}

            {/* Badges — TODOS na mesma linha */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {pro.verified && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                  <BadgeCheck className="w-3.5 h-3.5 fill-emerald-100" /> Verificado
                </span>
              )}
              {pro.user_type === "company" ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-white text-xs font-bold shadow-sm">
                  <Building2 className="w-3 h-3" /> Empresa
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                  Profissional
                </span>
              )}
              {isOwner && pro.profile_status !== "approved" && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  pro.profile_status === "pending" ? "bg-amber-100 text-amber-700" : "bg-destructive/10 text-destructive"
                }`}>
                  {pro.profile_status === "pending" ? "Em análise" : "Reprovado"}
                </span>
              )}
            </div>

            {/* Disponibilidade + tempo médio de resposta (mesmo tamanho/peso do texto de disponibilidade) */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-1">
              <span className={`flex items-center gap-1 font-medium ${currentAvailability.color}`}>
                <currentAvailability.icon className={`w-3 h-3 fill-current`} />
                {currentAvailability.label}
              </span>
              {(() => {
                const avgLabel = formatAvgResponseSeconds(pro.avg_response_seconds ?? null);
                const n = pro.avg_response_sample_count ?? 0;
                if (!avgLabel || n < 1) return null;
                return (
                  <>
                    <span className="text-muted-foreground/70" aria-hidden>
                      ·
                    </span>
                    <span className="flex items-center gap-1 font-normal">
                      <Timer className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
                      Tempo médio de resposta: {avgLabel}
                    </span>
                  </>
                );
              })()}
            </div>

            {/* Edição de categoria/profissão (owner) */}
            {isOwner && categories.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center mt-2">
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

            {/* Owner: status + link público */}
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
                {profileLink && profileLinkDisplay && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Link do seu perfil (WhatsApp, Instagram, navegador)
                    </label>
                    <p className="text-[10px] text-muted-foreground mb-1.5 leading-snug">
                      URL curta em <span className="font-mono">/professional/…</span>. Nas redes, o cartão de prévia usa a mesma página — o WhatsApp lê título e foto automaticamente. Para testar: Depurador da Meta com este URL.
                    </p>
                    <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5">
                      <span className="text-xs text-foreground flex-1 truncate font-mono">{profileLinkDisplay}</span>
                      <button type="button" onClick={handleCopyLink} className="text-xs text-primary font-bold hover:underline shrink-0">
                        Copiar
                      </button>
                      <button type="button" onClick={handleShareLink} className="text-muted-foreground hover:text-primary shrink-0 p-1" title="Compartilhar">
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Visitante: seguir, favoritar, compartilhar + chamar / indisponível */}
            {!isOwner && (
              <div className="mt-5 rounded-2xl border border-border/70 bg-gradient-to-b from-muted/30 to-background p-4 space-y-3 shadow-sm">
                {profileLink && (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={toggleFollow}
                      disabled={followBusy || (!!user && socialLoading)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 min-h-[72px] rounded-xl border text-[11px] font-bold transition-colors active:scale-[0.98] disabled:opacity-50",
                        isFollowing
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/80 bg-card text-foreground hover:bg-muted/60",
                      )}
                    >
                      {followBusy ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : (
                        <UserPlus className={cn("w-5 h-5", isFollowing && "text-primary")} />
                      )}
                      <span>{isFollowing ? "Seguindo" : "Seguir"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={toggleFavorite}
                      disabled={favoriteBusy || (!!user && socialLoading)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 min-h-[72px] rounded-xl border text-[11px] font-bold transition-colors active:scale-[0.98] disabled:opacity-50",
                        isFavorite
                          ? "border-rose-400 bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"
                          : "border-border/80 bg-card text-foreground hover:bg-muted/60",
                      )}
                    >
                      {favoriteBusy ? (
                        <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
                      ) : (
                        <Heart className={cn("w-5 h-5", isFavorite && "fill-current")} />
                      )}
                      <span>{isFavorite ? "Favorito" : "Favoritar"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleShareLink}
                      className="flex flex-col items-center justify-center gap-1 min-h-[72px] rounded-xl border border-border/80 bg-card text-foreground hover:bg-muted/60 text-[11px] font-bold transition-colors active:scale-[0.98]"
                    >
                      <Share2 className="w-5 h-5" />
                      <span>Compartilhar</span>
                    </button>
                  </div>
                )}
                {isFollowing && (
                  <button
                    type="button"
                    onClick={() => void openFollowingDirectMessage()}
                    disabled={dmOpening || followBusy || (!!user && socialLoading)}
                    className="w-full min-h-[44px] py-3 rounded-xl border-2 border-violet-500/40 bg-violet-500/5 text-violet-700 dark:text-violet-200 font-bold text-sm hover:bg-violet-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {dmOpening ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
                    Mensagem
                  </button>
                )}
                {pro.availability_status !== "unavailable" ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCall}
                      className="w-full min-h-[48px] py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2"
                    >
                      CHAMAR
                    </button>
                    {pro.agenda_enabled && (pro.user_type === "company" || planId === "business") && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAgendaDialogOpen(true)}
                        className="w-full min-h-[48px] py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-primary/50 text-primary hover:bg-primary/5 active:scale-[0.98]"
                      >
                        <Calendar className="w-5 h-5 shrink-0" />
                        Agendar serviço
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 px-4 py-4 text-center">
                    <CalendarOff className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-70" />
                    <p className="text-sm font-semibold text-foreground">Indisponível no momento</p>
                    <p className="text-xs text-muted-foreground mt-1">Este profissional não está aceitando contatos agora.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {publicSeals.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setSealsModalOpen(true)}
              className="w-full flex items-center gap-2.5 rounded-xl border border-amber-200/50 dark:border-amber-800/40 bg-gradient-to-r from-amber-50/50 to-card dark:from-amber-950/20 px-3 py-2 mb-4 text-left hover:from-amber-50/80 dark:hover:from-amber-950/30 transition-colors active:scale-[0.99]"
            >
              <Award className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground leading-tight">Selos no Chamô</p>
                <p className="text-[10px] text-muted-foreground">Toque para ver todos ({publicSeals.length})</p>
              </div>
              <div className="flex items-center shrink-0">
                {publicSeals.slice(0, 3).map((s, i) => (
                  <div
                    key={s.seal_id}
                    className="relative"
                    style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i }}
                  >
                    <ProfessionalSealIcon variant={s.icon_variant} size={32} earned />
                  </div>
                ))}
                {publicSeals.length > 3 && (
                  <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-[9px] font-extrabold px-1.5 py-0.5 min-w-[1.25rem] text-center shadow-sm">
                    +{publicSeals.length - 3}
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>

            <Dialog open={sealsModalOpen} onOpenChange={setSealsModalOpen}>
              <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Selos no Chamô</DialogTitle>
                  <DialogDescription>Reconhecimentos oficiais conquistados na plataforma.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-3 gap-2.5 py-2">
                  {publicSeals.map((s) => (
                    <div
                      key={s.seal_id}
                      className="flex flex-col items-center text-center gap-1 rounded-lg border bg-muted/30 p-2"
                    >
                      <ProfessionalSealIcon variant={s.icon_variant} size={40} earned />
                      <span className="text-[9px] font-semibold text-foreground leading-tight line-clamp-2">{s.title}</span>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Lightbox da foto do perfil */}
        {avatarLightbox && avatarUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-8"
            onClick={() => setAvatarLightbox(false)}
          >
            <div
              className="relative max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={avatarUrl}
                alt={name}
                className="w-full rounded-2xl shadow-2xl object-cover"
                style={{ maxHeight: "70vh", objectFit: "contain" }}
              />
              <button
                onClick={() => setAvatarLightbox(false)}
                className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>
        )}

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

        {/* Fotos de serviços — Pro, VIP e Business */}
        {(planId === "pro" || planId === "vip" || planId === "business") && (
          <ProfessionalServices professionalId={pro.id} isOwner={isOwner} />
        )}
        {/* Catálogo de produtos — Business */}
        {(pro.user_type === "company" || planId === "business") && (
          <ProductCatalog professionalId={pro.id} isOwner={isOwner} />
        )}

        {/* Reviews */}
        <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <h2 className="font-semibold text-foreground">Avaliações</h2>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{pro.total_reviews}</span>
          </div>

          {/* Rating summary */}
          <div className="flex items-center gap-4 mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <div className="text-center flex-shrink-0">
              <p className="text-4xl font-extrabold text-foreground leading-none">{Number(pro.rating).toFixed(1)}</p>
              <div className="flex gap-0.5 mt-1 justify-center">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(pro.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{pro.total_reviews} avaliações</p>
              <p className="text-xs text-muted-foreground mt-0.5">Baseado em avaliações de clientes</p>
            </div>
          </div>

          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma avaliação ainda.</p>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {reviews.slice(0, reviewsVisible).map(r => {
                  const initials = r.client_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <div key={r.id} className="border-t pt-3">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        {r.client_avatar ? (
                          <img src={r.client_avatar} alt={r.client_name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{initials}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-tight truncate">{r.client_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(s => (
                                <Star key={s} className={`w-3 h-3 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                              ))}
                            </div>
                            <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                          </div>
                        </div>
                      </div>
                      {r.comment && <p className="text-sm text-muted-foreground leading-relaxed pl-10">{r.comment}</p>}
                    </div>
                  );
                })}
              </div>
              {reviews.length > reviewsVisible && (
                <button
                  onClick={() => setReviewsVisible(v => v + 5)}
                  className="mt-4 w-full py-2.5 rounded-xl border text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
                >
                  Ver mais avaliações
                </button>
              )}
            </>
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
                loginRedirectPath={location.pathname}
              />
            )}

            <Dialog open={profileGateOpen} onOpenChange={setProfileGateOpen}>
              <DialogContent className="sm:max-w-md rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Complete seu perfil</DialogTitle>
                  <DialogDescription>
                    Cadastre sua foto de perfil e seu nome para enviar uma chamada a um profissional.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
                  <Button variant="outline" className="rounded-xl w-full sm:w-auto" onClick={() => setProfileGateOpen(false)}>
                    Agora não
                  </Button>
                  <Button
                    className="rounded-xl w-full sm:w-auto"
                    onClick={() => {
                      setProfileGateOpen(false);
                      navigate("/profile");
                    }}
                  >
                    Concluir cadastro
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </main>
    </AppLayout>
  );
};

export default ProfessionalProfile;