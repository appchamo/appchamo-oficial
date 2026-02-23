import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Star, Clock, CalendarOff, FileQuestion, Circle, Pencil, Check, X } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ImageCropUpload from "@/components/ImageCropUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductCatalog from "@/components/ProductCatalog";
import ServiceRequestDialog from "@/components/ServiceRequestDialog";

interface ProData {
  id: string;
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
  category_name: string;
  user_type: string;
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
  const [pro, setPro] = useState<ProData | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [callDialogOpen, setCallDialogOpen] = useState(false);

  // NOVO: Estado para edição do nome
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("professionals")
        .select("id, bio, rating, total_services, total_reviews, verified, user_id, profile_status, availability_status, categories(name)")
        .eq("id", id!)
        .maybeSingle();
      if (data) {
        const { data: profile } = await supabase
          .from("profiles_public" as any)
          .select("full_name, avatar_url")
          .eq("user_id", data.user_id)
          .maybeSingle() as { data: { full_name: string; avatar_url: string | null; user_type: string } | null };
        setPro({
          ...data,
          full_name: profile?.full_name || "Profissional",
          avatar_url: profile?.avatar_url || null,
          category_name: (data.categories as any)?.name || "Sem categoria",
          availability_status: (data as any).availability_status || "available",
          user_type: "professional",
        });
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.id === data.user_id) setIsOwner(true);

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
    };
    if (id) load();
  }, [id]);

  // Realtime: listen for availability_status changes on this professional
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`pro-status-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "professionals", filter: `id=eq.${id}` },
        (payload) => {
          const updated = payload.new as any;
          setPro(prev => prev ? { ...prev, availability_status: updated.availability_status, verified: updated.verified, rating: updated.rating, total_reviews: updated.total_reviews, total_services: updated.total_services } : prev);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

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

  // NOVO: Função para salvar o nome
  const handleNameSave = async () => {
    if (!pro || !editNameValue.trim()) return;
    const { error } = await supabase.from("profiles").update({ full_name: editNameValue.trim() }).eq("user_id", pro.user_id);
    if (error) { toast({ title: "Erro ao atualizar nome", variant: "destructive" }); return; }
    setPro(prev => prev ? { ...prev, full_name: editNameValue.trim() } : prev);
    setEditingName(false);
    toast({ title: "Nome atualizado!" });
  };

  const handleCall = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
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
                {/* ✅ NOVO: Lógica de edição de nome inline */}
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
                    {pro.verified && (
                      <div className="relative flex-shrink-0">
                        <div className="absolute -inset-1 bg-primary/20 rounded-full animate-pulse" />
                        <BadgeCheck className="w-5 h-5 text-primary relative" />
                      </div>
                    )}
                    {isOwner && (
                      <button onClick={() => { setEditNameValue(name); setEditingName(true); }} className="ml-1 p-1 text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
              
              {!editingName && (
                <p className="text-sm text-muted-foreground truncate">{pro.category_name}</p>
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
            <div className="mt-4 pt-3 border-t">
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
          )}

          {!isOwner && pro.availability_status !== "unavailable" && (
            <div className="mt-5">
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

        {/* Bio */}
        {pro.bio && (
          <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
            <h2 className="font-semibold text-foreground mb-2">Sobre</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{pro.bio}</p>
          </div>
        )}

        {/* Product Catalog - only for company accounts */}
        {pro.user_type === "company" && (
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
          <ServiceRequestDialog
            open={callDialogOpen}
            onOpenChange={setCallDialogOpen}
            professionalId={pro.id}
            professionalName={pro.full_name}
          />
        )}
      </main>
    </AppLayout>
  );
};

export default ProfessionalProfile;