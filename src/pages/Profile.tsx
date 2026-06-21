import AppLayout from "@/components/AppLayout";
import { User, Mail, Shield, Ticket, ChevronRight, LogOut, Phone, Briefcase, Pencil, Star, Circle, Save, Trash2, FileQuestion, CalendarOff, Clock, CalendarCheck, Plus, AlertCircle, CheckCircle2, CreditCard, QrCode, Share2, Settings, BarChart2, Loader2, Megaphone, MapPin, ArrowLeftRight, Building2, UserCheck } from "lucide-react";
import { formatCpf, formatCnpj } from "@/lib/formatters";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ImageCropUpload from "@/components/ImageCropUpload";
import { supabase } from "@/integrations/supabase/client";
import { clearLocalChamoSession } from "@/lib/localChamoSessionClear";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPublicProfessionalProfileUrl } from "@/lib/publicAppUrl";
import { shareUrl } from "@/lib/shareUrl";
import { useLinkedSponsor } from "@/hooks/useLinkedSponsor";
import SponsorPatrocinadorPanel from "@/components/sponsor/SponsorPatrocinadorPanel";
import SponsorLaunchNovidadeModal from "@/components/sponsor/SponsorLaunchNovidadeModal";
const availabilityOptions = [
  { value: "available", label: "Disponível", icon: Circle, color: "text-green-500" },
  { value: "quotes_only", label: "Somente orçamentos", icon: FileQuestion, color: "text-amber-500" },
  { value: "busy", label: "Agenda fechada", icon: Clock, color: "text-orange-500" },
  { value: "unavailable", label: "Indisponível", icon: CalendarOff, color: "text-destructive" },
];

// 🚀 NOVO: Função para otimizar a imagem do avatar (reduz peso e acelera o carregamento drásticamente)
const getOptimizedAvatar = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.includes("supabase.co/storage/v1/object/public/")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}width=200&height=200&quality=65&resize=cover`;
  }
  return url;
};

const Profile = () => {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const { sponsor: linkedSponsor } = useLinkedSponsor(user?.id);
  const [sponsorNovidadeOpen, setSponsorNovidadeOpen] = useState(false);
  const [sponsorPanelKey, setSponsorPanelKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [experience, setExperience] = useState("");
  const [services, setServices] = useState<string[]>([""]);
  const [bio, setBio] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [migrateDoc, setMigrateDoc] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [toClientOpen, setToClientOpen] = useState(false);
  const [proData, setProData] = useState<{ id: string; slug: string | null; cover_image_url: string | null; experience: string | null; services: string[] | null; bio: string | null; rating: number; total_services: number; total_reviews: number; verified: boolean; availability_status: string; category_name: string } | null>(null);

  // ── Pendências de cadastro ──────────────────────────────────────────────────
  const metaName = ((user?.user_metadata?.full_name || user?.user_metadata?.name) as string | undefined)?.trim() || "";
  const [pendingName, setPendingName] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [pendingDoc, setPendingDoc] = useState("");
  const [pendingDocType, setPendingDocType] = useState<"cpf" | "cnpj">("cpf");
  const [savingPending, setSavingPending] = useState(false);

  // Recalcula pendências sempre que o profile mudar
  const missingName  = !!profile && !(profile.full_name || "").trim();
  const missingPhone = !!profile && !(profile.phone || "").trim();
  const missingCpf   = !!profile && profile.user_type === "company" && !(profile.cpf || "").trim() && !(profile.cnpj || "").trim();
  const hasPending   = missingName || missingPhone || missingCpf;

  useEffect(() => {
    if (!profile) return;
    if (missingName)  setPendingName(metaName);
    if (missingPhone) setPendingPhone(profile.phone || "");
  }, [profile?.full_name, profile?.phone, profile?.cpf, profile?.cnpj]);

  const handleSavePending = async () => {
    if (!user) return;
    if (missingName && !pendingName.trim()) {
      toast({ title: "Informe seu nome completo", variant: "destructive" }); return;
    }
    if (missingPhone && !pendingPhone.trim()) {
      toast({ title: "Informe seu telefone", variant: "destructive" }); return;
    }
    const docClean = pendingDoc.replace(/\D/g, "");
    if (missingCpf && !docClean) {
      toast({ title: "Informe seu CPF ou CNPJ", variant: "destructive" }); return;
    }
    setSavingPending(true);
    const payload: Record<string, string> = {};
    if (missingName)  payload.full_name = pendingName.trim();
    if (missingPhone) payload.phone     = pendingPhone.replace(/\D/g, "");
    if (missingCpf)   payload[pendingDocType] = docClean;
    const { error } = await supabase.from("profiles").update(payload).eq("user_id", user.id);
    setSavingPending(false);
    if (error) { toast({ title: "Erro ao salvar", variant: "destructive" }); return; }
    await refreshProfile();
    if (payload.full_name) setName(payload.full_name);
    if (payload.phone) setPhone(payload.phone);
    toast({ title: "Cadastro completado!", description: "Suas informações foram salvas com sucesso." });
  };

  useEffect(() => {
    if (!user?.id || !linkedSponsor) return;
    let cancelled = false;
    void (async () => {
      const name = linkedSponsor.name?.trim();
      const avatar = linkedSponsor.logo_url?.trim() || null;
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, display_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || !p || !name) return;
      const dn = (p.display_name || "").trim();
      if (p.full_name === name && dn === name && p.avatar_url === avatar) return;
      await supabase
        .from("profiles")
        .update({
          full_name: name,
          display_name: name,
          avatar_url: avatar,
        })
        .eq("user_id", user.id);
      await refreshProfile();
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, linkedSponsor?.id, linkedSponsor?.name, linkedSponsor?.logo_url, refreshProfile]);

  useEffect(() => {
    if (!user || !profile) return;
    setName(profile.full_name || "");
    setDisplayName(profile.display_name || "");
    setPhone(profile.phone || "");

    if (profile.user_type === "professional" || profile.user_type === "company") {
      const loadPro = async () => {
        const { data } = await supabase
          .from("professionals")
          .select("id, slug, cover_image_url, experience, services, bio, rating, total_services, total_reviews, verified, availability_status, categories(name)")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) {
          setProData({
            ...data,
            slug: data.slug || null,
            cover_image_url: (data as any).cover_image_url || null,
            category_name: (data.categories as any)?.name || "Sem categoria",
            availability_status: data.availability_status || "available"
          });
          setExperience(data.experience || "");
          setServices((data.services && data.services.length) ? data.services : [""]);
          setBio(data.bio || "");
        }
      };
      loadPro();
    }
  }, [user, profile]);

  // Sempre que o usuário abrir/atualizar o Perfil, marcamos se o cadastro está incompleto.
  useEffect(() => {
    if (!profile) return;
    const fullName = (profile.full_name || "").trim();
    const phoneValue = (profile.phone || "").trim();
    const cpfValue = (profile.cpf || "").trim();
    const cnpjValue = (profile.cnpj || "").trim();
    const missingName = !fullName;
    const missingPhone = !phoneValue;
    const missingDoc = profile.user_type === "company" && !cpfValue && !cnpjValue;
    const needsCompletion = missingName || missingPhone || missingDoc;
    try {
      localStorage.setItem("chamo_profile_needs_completion", needsCompletion ? "1" : "0");
    } catch {
      // ignore
    }
  }, [profile]);

  const handleAvatarUpload = async (url: string) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", user.id);
    if (error) { toast({ title: "Erro ao salvar avatar", variant: "destructive" }); return; }
    await refreshProfile();
    toast({ title: "Avatar atualizado!" });
  };

  const handleCoverUpload = async (url: string) => {
    if (!proData) return;
    const { error } = await supabase.from("professionals").update({ cover_image_url: url } as any).eq("id", proData.id);
    if (error) { toast({ title: "Erro ao salvar capa", variant: "destructive" }); return; }
    setProData(prev => prev ? { ...prev, cover_image_url: url } : prev);
    toast({ title: "Capa atualizada!" });
  };

  const handleSave = async () => {
    if (!user) return;
    const resolvedDisplayName = displayName.trim() || profile?.full_name || "";
    const { error } = await supabase.from("profiles").update({ display_name: resolvedDisplayName, phone }).eq("user_id", user.id);
    if (error) { toast({ title: "Erro ao salvar", variant: "destructive" }); return; }
    if (proData) {
      const servicesFiltered = services.map(s => s.trim()).filter(Boolean);
      await supabase.from("professionals").update({
        experience: experience.trim() || null,
        services: servicesFiltered.length ? servicesFiltered : null,
        bio: bio.trim() || null,
      }).eq("id", proData.id);
    }
    await refreshProfile();
    toast({ title: "Perfil salvo!" });
    setEditing(false);
  };

  // NOVO: Função para alterar status de disponibilidade direto nesta tela
  const handleStatusChange = async (status: string) => {
    if (!proData || !user) return;
    const { error } = await supabase.from("professionals").update({ availability_status: status }).eq("id", proData.id);
    if (error) { toast({ title: "Erro ao atualizar status", variant: "destructive" }); return; }
    setProData({ ...proData, availability_status: status });
    toast({ title: "Status atualizado!" });
  };

  const handleShareProfile = async () => {
    if (!proData?.slug) return;
    const link = getPublicProfessionalProfileUrl(proData.slug);
    const title = `${profile?.full_name || "Meu perfil"} no Chamô`;
    const result = await shareUrl({ title, url: link });
    if (result === "copied") {
      toast({ title: "Link copiado!", description: link });
    } else if (result === "failed") {
      toast({ title: "Seu link:", description: link });
    }
  };

  const handleMigrateToClient = async () => {
    if (!user || !profile) return;
    setMigrating(true);
    try {
      const { error } = await supabase.from("profiles").update({ user_type: "client" }).eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast({ title: "Pronto! 🎉", description: "Seu perfil agora é de Cliente." });
      setToClientOpen(false);
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Erro ao mudar", description: e.message, variant: "destructive" });
    } finally {
      setMigrating(false);
    }
  };

  const handleMigrate = async () => {
    if (!user || !profile) return;
    const targetType = profile.user_type === "professional" ? "company" : "professional";
    const targetDocField = targetType === "company" ? "cnpj" : "cpf";
    const alreadyHasDoc = targetType === "company"
      ? (profile.cnpj || "").replace(/\D/g, "").length >= 14
      : (profile.cpf || "").replace(/\D/g, "").length >= 11;
    const docClean = migrateDoc.replace(/\D/g, "");

    if (!alreadyHasDoc) {
      if (targetType === "company" && docClean.length < 14) {
        toast({ title: "CNPJ inválido", description: "Informe um CNPJ válido com 14 dígitos.", variant: "destructive" });
        return;
      }
      if (targetType === "professional" && docClean.length < 11) {
        toast({ title: "CPF inválido", description: "Informe um CPF válido com 11 dígitos.", variant: "destructive" });
        return;
      }
    }

    setMigrating(true);
    try {
      const profileUpdate: Record<string, string> = { user_type: targetType };
      if (!alreadyHasDoc && docClean) profileUpdate[targetDocField] = docClean;

      const { error } = await supabase.from("profiles").update(profileUpdate).eq("user_id", user.id);
      if (error) throw error;

      if (proData) {
        await supabase.from("professionals").update({
          doc_type: targetType === "company" ? "cnpj" : "cpf",
        } as any).eq("id", proData.id);
      }

      await refreshProfile();
      toast({
        title: "Migração realizada! 🎉",
        description: `Seu perfil agora é ${targetType === "company" ? "Empresa" : "Profissional Individual"}.`,
      });
      setMigrateOpen(false);
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Erro ao migrar", description: e.message, variant: "destructive" });
    } finally {
      setMigrating(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== "EXCLUIR") return;
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke("admin-manage", {
        body: { action: "delete_own_account" },
      });
      if (res.error) {
        const body = res.data as { error?: string } | null;
        if (body?.error) throw new Error(body.error);
        throw res.error;
      }
      // Servidor já apagou o utilizador — revoke remoto pode falhar; só limpar local e ir à entrada do app.
      await clearLocalChamoSession();
      toast({ title: "Conta excluída", description: "Até logo!" });
      window.location.replace("/");
    } catch (e: any) {
      toast({ title: "Erro ao excluir conta", description: e.message, variant: "destructive" });
      setDeleting(false);
    }
  };

  if (!profile) return <AppLayout><main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Carregando...</main></AppLayout>;

  const typeLabel = linkedSponsor
    ? "Patrocinador"
    : profile.user_type === "professional"
      ? "Profissional"
      : profile.user_type === "company"
        ? "Empresa"
        : "Cliente";
  const initials = (profile.full_name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <div className="mb-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Meu Perfil</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Dados da conta e preferências</p>
        </div>

        {linkedSponsor ? (
          <div className="mb-4 space-y-3">
            <button
              type="button"
              onClick={() => setSponsorNovidadeOpen(true)}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-primary/35 bg-primary/5 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
            >
              <Megaphone className="w-5 h-5 shrink-0" />
              Lançar novidade
            </button>
            <SponsorPatrocinadorPanel key={sponsorPanelKey} sponsorId={linkedSponsor.id} />
            <Link
              to="/jobs"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-primary/35 bg-primary/5 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
            >
              <Briefcase className="w-5 h-5 shrink-0" />
              VAGAS DE EMPREGO
            </Link>
          </div>
        ) : null}

        {/* ── Pendências de cadastro ── */}
        {hasPending && !editing && (
          <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 bg-amber-100 px-4 py-3 border-b border-amber-200">
              <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
              <p className="text-sm font-bold text-amber-800">Cadastro incompleto</p>
              <p className="text-xs text-amber-600 ml-1">— Preencha os campos abaixo</p>
            </div>
            <div className="p-4 space-y-3">
              {missingName && (
                <div>
                  <label className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Nome completo <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={pendingName}
                    onChange={e => setPendingName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                </div>
              )}
              {missingPhone && (
                <div>
                  <label className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> Telefone <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={pendingPhone}
                    onChange={e => setPendingPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    type="tel"
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                </div>
              )}
              {missingCpf && (
                <div>
                  <label className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" /> Documento <span className="text-red-500">*</span>
                  </label>
                  {/* Toggle CPF / CNPJ igual ao cadastro inicial */}
                  <div className="flex gap-2 mb-2.5">
                    <button
                      type="button"
                      onClick={() => { setPendingDocType("cpf"); setPendingDoc(""); }}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        pendingDocType === "cpf"
                          ? "bg-amber-500 border-amber-500 text-white"
                          : "border-amber-300 text-amber-700 bg-white"
                      }`}
                    >
                      CPF
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPendingDocType("cnpj"); setPendingDoc(""); }}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        pendingDocType === "cnpj"
                          ? "bg-amber-500 border-amber-500 text-white"
                          : "border-amber-300 text-amber-700 bg-white"
                      }`}
                    >
                      CNPJ
                    </button>
                  </div>
                  <input
                    value={pendingDoc}
                    onChange={e =>
                      setPendingDoc(
                        pendingDocType === "cpf"
                          ? formatCpf(e.target.value)
                          : formatCnpj(e.target.value)
                      )
                    }
                    placeholder={pendingDocType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                    maxLength={pendingDocType === "cpf" ? 14 : 18}
                    className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                </div>
              )}
              <button
                onClick={handleSavePending}
                disabled={savingPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {savingPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {savingPending ? "Salvando..." : "Salvar e concluir cadastro"}
              </button>
            </div>
          </div>
        )}

        {!hasPending && profile && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2.5">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
            <p className="text-sm font-medium text-emerald-800">Cadastro completo</p>
          </div>
        )}

        {(() => {
          const locLine =
            profile.address_city && profile.address_state
              ? `${profile.address_city}, ${profile.address_state}`
              : profile.address_city || profile.address_state || "Definir localização";
          const locIncomplete = !profile.address_city || !profile.address_state;
          const consumerSide = profile.user_type === "client" || !!linkedSponsor;
          const locCaption = consumerSide
            ? "A região onde você vê profissionais e destaques"
            : "A localização que você atende";
          return (
            <Link
              to="/profile/settings/endereco"
              className={`block mb-3 rounded-2xl border-2 px-4 py-3.5 transition-colors active:scale-[0.99] ${
                locIncomplete
                  ? "border-amber-400 bg-amber-50/90 dark:bg-amber-950/30"
                  : "border-primary/50 bg-primary/5 hover:bg-primary/10"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                {locCaption}
              </p>
              <div className="flex items-center gap-3">
                <MapPin
                  className={`w-5 h-5 shrink-0 ${locIncomplete ? "text-amber-700 dark:text-amber-400" : "text-primary"}`}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-bold truncate ${
                      locIncomplete ? "text-amber-950 dark:text-amber-50" : "text-foreground"
                    }`}
                  >
                    {locLine}
                  </p>
                  {locIncomplete ? (
                    <p className="text-xs text-amber-900/90 dark:text-amber-100/85 mt-1 leading-snug">
                      Toque para informar cidade e CEP — destaques e patrocinadores seguem essa região.
                    </p>
                  ) : null}
                </div>
                <ChevronRight
                  className={`w-5 h-5 shrink-0 ${locIncomplete ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                />
              </div>
            </Link>
          );
        })()}

        <div className="bg-card border rounded-2xl shadow-card mb-4 overflow-hidden">
          {/* Capa do perfil */}
          {(profile.user_type === "professional" || profile.user_type === "company") && (
            <div className="h-32 w-full relative overflow-hidden">
              {proData?.cover_image_url ? (
                <img src={proData.cover_image_url} alt="Capa" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 60%, #c2410c 100%)" }} />
              )}
              <div className="absolute inset-0 bg-black/25" />
              {editing && proData && (
                <div className="absolute bottom-2 right-2 z-10">
                  <ImageCropUpload
                    onUpload={handleCoverUpload}
                    aspect={16 / 6}
                    shape="rect"
                    bucketPath="professionals"
                    currentImage={proData.cover_image_url || undefined}
                    label="Alterar capa"
                    variant="onDark"
                    maxSize={900}
                    quality={0.68}
                  />
                </div>
              )}
            </div>
          )}

          <div className="p-5">
          <div className="flex items-start gap-4" style={{ marginTop: (profile.user_type === "professional" || profile.user_type === "company") ? "-2rem" : 0 }}>
            <div className="relative flex-shrink-0">
              {profile.avatar_url ? (
                <img 
                  src={getOptimizedAvatar(profile.avatar_url)} 
                  alt="Avatar" 
                  className="w-20 h-20 rounded-2xl object-cover border-4 border-card shadow-lg"
                  loading="eager" 
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-muted border-4 border-card shadow-lg flex items-center justify-center text-xl font-bold text-muted-foreground">{initials}</div>
              )}
              {editing && (
                <div className="absolute -bottom-1 -right-1">
                  <ImageCropUpload onUpload={handleAvatarUpload} aspect={1} shape="round" bucketPath="avatars" currentImage={profile.avatar_url} label="" maxSize={336} quality={0.7} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0" style={{ paddingTop: (profile.user_type === "professional" || profile.user_type === "company") ? "2rem" : 0 }}>
              {editing ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase">Nome completo (documento)</p>
                    <div className="w-full border border-dashed rounded-xl px-3 py-2 text-sm bg-muted/30 text-muted-foreground select-none">
                      {profile.full_name || "—"}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 px-0.5">O nome legal não pode ser alterado aqui.</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase">Nome de exibição</p>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={profile.full_name || "Nome que aparece no app"}
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5 px-0.5">Nome fantasia, empresa ou apelido. Se vazio, usa o nome completo.</p>
                  </div>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" placeholder="Telefone" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                    <h2 className="text-lg font-bold text-foreground">{profile.display_name || profile.full_name || "Usuário"}</h2>
                    {proData?.slug && (
                      <button
                        type="button"
                        onClick={handleShareProfile}
                        className="text-muted-foreground hover:text-primary transition-colors p-0.5"
                        title="Compartilhar perfil"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5"><Mail className="w-3.5 h-3.5" /> {profile.email}</p>
                  {profile.phone && <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5"><Phone className="w-3.5 h-3.5" /> {profile.phone}</p>}
                  {linkedSponsor?.niche?.trim() ? (
                    <p className="text-sm text-muted-foreground mt-1">{linkedSponsor.niche}</p>
                  ) : null}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1.5 gap-1 ${linkedSponsor ? "bg-primary/10 text-primary" : profile.user_type === "company" ? "bg-primary/10 text-primary" : profile.user_type === "professional" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                    <Shield className="w-3 h-3" /> {typeLabel}
                  </span>
                </>
              )}
            </div>
          </div>

          {!editing && !hasPending && (
            <Button
              type="button"
              size="lg"
              className="w-full mt-5 h-12 rounded-xl text-base font-bold shadow-md shadow-primary/15 gap-2.5"
              onClick={() => setEditing(true)}
            >
              <Pencil className="w-5 h-5" />
              Editar perfil
            </Button>
          )}

          {!editing && proData?.slug && (profile.user_type === "professional" || profile.user_type === "company") && (
            <Link
              to={`/professional/${proData.slug}`}
              className="w-full mt-2 h-11 rounded-xl border-2 border-primary/40 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/5 active:scale-[0.99] transition-[background-color,transform]"
            >
              <User className="w-4 h-4" /> Ver meu perfil público
            </Link>
          )}

          {proData && !editing && (
            <div className="flex items-center gap-4 mt-4 pt-3 border-t text-sm">
              <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-amber-400 text-amber-400" /><strong>{Number(proData.rating).toFixed(1)}</strong></span>
              <span className="text-muted-foreground">{proData.total_services} serviços</span>
              <span className="text-muted-foreground">{proData.total_reviews} avaliações</span>
              <span className="text-xs text-muted-foreground ml-auto">{proData.category_name}</span>
            </div>
          )}

          {/* ✅ NOVO: Edição de Status Rápida (Sempre visível para o Pro) */}
          {proData && !editing && (
            <div className="mt-4 pt-3 border-t">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status de disponibilidade atual</label>
              <Select value={proData.availability_status} onValueChange={handleStatusChange}>
                <SelectTrigger className="rounded-xl w-full bg-background border">
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

          {/* Bloco de experiência/serviços/sobre: só aparece para profissional/empresa */}
          {(profile.user_type === "professional" || profile.user_type === "company") && (proData || editing) && (
            <div className="mt-3 pt-3 border-t space-y-4">
              {editing ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Experiência</label>
                    <textarea value={experience} onChange={(e) => setExperience(e.target.value)} rows={2} placeholder="Ex: Mais de 20 anos no mercado..." className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Serviços</label>
                    <div className="space-y-2">
                      {services.map((s, i) => (
                        <div key={i} className="flex gap-2">
                          <input value={s} onChange={(e) => { const v = [...services]; v[i] = e.target.value; setServices(v); }} placeholder={`Serviço ${i + 1}`} className="flex-1 border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                          <button type="button" onClick={() => setServices(services.filter((_, j) => j !== i).length ? services.filter((_, j) => j !== i) : [""])} className="p-2 rounded-lg border text-muted-foreground hover:bg-muted" aria-label="Remover"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setServices([...services, ""])} className="flex items-center gap-1.5 text-xs text-primary font-medium"><Plus className="w-3.5 h-3.5" /> Adicionar serviço</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Sobre</label>
                    <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Conte sobre você..." className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                  </div>
                </>
              ) : (
                <>
                  {proData?.experience && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Experiência</p>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{proData.experience}</p>
                    </div>
                  )}
                  {proData?.services && proData.services.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Serviços</p>
                      <ul className="text-sm text-foreground list-disc list-inside space-y-0.5">
                        {proData.services.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {proData?.bio && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Sobre</p>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{proData.bio}</p>
                    </div>
                  )}
                  {!proData?.experience && !(proData?.services?.length) && !proData?.bio && (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma informação de perfil preenchida. Use o botão{" "}
                      <strong className="text-foreground font-semibold">Editar perfil</strong> acima para adicionar.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {editing && (profile.user_type === "professional" || profile.user_type === "company") && (
            <div className="mt-4 pt-3 border-t space-y-2">
              <p className="text-xs text-muted-foreground px-0.5">
                Tipo da sua conta:{" "}
                <strong className="text-foreground">{profile.user_type === "company" ? "Empresa" : "Profissional"}</strong>
              </p>
              <button
                type="button"
                onClick={() => {
                  const targetType = profile.user_type === "professional" ? "company" : "professional";
                  const existing = targetType === "company"
                    ? (profile.cnpj ? formatCnpj(profile.cnpj) : "")
                    : (profile.cpf ? formatCpf(profile.cpf) : "");
                  setMigrateDoc(existing);
                  setMigrateOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-muted-foreground/25 rounded-xl text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Migrar para {profile.user_type === "professional" ? "Empresa" : "Profissional Individual"}
              </button>
              <button
                type="button"
                onClick={() => setToClientOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-muted-foreground/25 rounded-xl text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Mudar para Cliente
              </button>
            </div>
          )}

          {editing && (
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"><Save className="w-4 h-4" /> Salvar</button>
            </div>
          )}
          </div>{/* fim p-5 */}
        </div>

        <div className="flex flex-col gap-2">
          {[
            ...((profile.user_type === "professional" || profile.user_type === "company") ? [{ icon: Briefcase, label: "Painel Profissional", path: "/pro" }] : []),
            { icon: CalendarCheck, label: "Meus agendamentos", path: "/meus-agendamentos" },
            ...((profile.user_type === "professional" || profile.user_type === "company")
              ? [{ icon: BarChart2, label: "Relatórios", path: "/profile/relatorios" } as const]
              : []),
            { icon: Ticket, label: "Meus Cupons", path: "/coupons" },
            { icon: Settings, label: "Configurações", path: "/profile/settings" },
          ].map((item) => (
            <Link key={item.label} to={item.path} className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 transition-all">
              <item.icon className="w-5 h-5 text-primary" />
              <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          ))}

          {/* Logar via Web — abre o scanner de QR Code */}
          <Link to="/qr-scan" className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4 hover:border-primary/40 hover:bg-primary/10 transition-all">
            <QrCode className="w-5 h-5 text-primary" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground block">Logar via Web</span>
              <span className="text-xs text-muted-foreground">Escaneie o QR Code no site</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>

          <button onClick={handleLogout} className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-destructive/30 transition-all mt-2 w-full text-left">
            <LogOut className="w-5 h-5 text-destructive" />
            <span className="flex-1 text-sm font-medium text-destructive">Sair da conta</span>
          </button>
          <button onClick={() => setDeleteOpen(true)} className="flex items-center gap-2 justify-center w-full py-3 text-xs text-muted-foreground/50 hover:text-destructive/60 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
            Excluir minha conta
          </button>
        </div>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-destructive">Excluir conta</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Esta ação é <strong>irreversível</strong>. Todos os seus dados, mensagens, avaliações e histórico serão permanentemente removidos.</p>
              <p className="text-sm text-foreground">Digite <strong>EXCLUIR</strong> para confirmar:</p>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-destructive/30" placeholder="EXCLUIR" />
              <button onClick={handleDeleteAccount} disabled={confirmText !== "EXCLUIR" || deleting} className="w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm hover:bg-destructive/90 transition-colors disabled:opacity-50">
                {deleting ? "Excluindo..." : "Confirmar exclusão"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de migração de tipo de conta */}
        {profile && (profile.user_type === "professional" || profile.user_type === "company") && (() => {
          const targetType = profile.user_type === "professional" ? "company" : "professional";
          const isToCompany = targetType === "company";
          const alreadyHasDoc = isToCompany
            ? (profile.cnpj || "").replace(/\D/g, "").length >= 14
            : (profile.cpf || "").replace(/\D/g, "").length >= 11;
          const existingDoc = isToCompany
            ? (profile.cnpj ? formatCnpj(profile.cnpj) : null)
            : (profile.cpf ? formatCpf(profile.cpf) : null);

          const missingFields: string[] = [];
          if (!alreadyHasDoc) missingFields.push(isToCompany ? "CNPJ" : "CPF");
          if (!(profile.full_name || "").trim()) missingFields.push("Nome completo");
          if (!(profile.phone || "").trim()) missingFields.push("Telefone");

          return (
            <Dialog open={migrateOpen} onOpenChange={setMigrateOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {isToCompany
                      ? <><Building2 className="w-5 h-5 text-primary" /> Migrar para Empresa</>
                      : <><UserCheck className="w-5 h-5 text-primary" /> Migrar para Profissional</>
                    }
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-1">
                  <p className="text-sm text-muted-foreground">
                    Seu perfil passará a ser identificado como{" "}
                    <strong className="text-foreground">
                      {isToCompany ? "Empresa (CNPJ)" : "Profissional Individual (CPF)"}
                    </strong>.
                  </p>

                  {/* Análise de dados */}
                  <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase">Análise do cadastro</p>

                    {/* Nome */}
                    <div className="flex items-center gap-2 text-sm">
                      {(profile.full_name || "").trim()
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span className={(profile.full_name || "").trim() ? "text-foreground" : "text-amber-700 dark:text-amber-400"}>
                        Nome completo{!(profile.full_name || "").trim() && " — faltando"}
                      </span>
                    </div>

                    {/* Telefone */}
                    <div className="flex items-center gap-2 text-sm">
                      {(profile.phone || "").trim()
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span className={(profile.phone || "").trim() ? "text-foreground" : "text-amber-700 dark:text-amber-400"}>
                        Telefone{!(profile.phone || "").trim() && " — faltando"}
                      </span>
                    </div>

                    {/* Documento necessário */}
                    <div className="flex items-center gap-2 text-sm">
                      {alreadyHasDoc
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span className={alreadyHasDoc ? "text-foreground" : "text-amber-700 dark:text-amber-400"}>
                        {isToCompany ? "CNPJ" : "CPF"}
                        {alreadyHasDoc ? ` — ${existingDoc}` : " — faltando (preencha abaixo)"}
                      </span>
                    </div>

                    {/* Endereço */}
                    <div className="flex items-center gap-2 text-sm">
                      {(profile.address_city || profile.address_state)
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span className={(profile.address_city || profile.address_state) ? "text-foreground" : "text-amber-700 dark:text-amber-400"}>
                        Localização{!(profile.address_city || profile.address_state) && " — faltando"}
                      </span>
                    </div>
                  </div>

                  {/* Campo do documento (só se não tiver) */}
                  {!alreadyHasDoc && (
                    <div>
                      <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" />
                        {isToCompany ? "CNPJ da empresa" : "CPF"} <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={migrateDoc}
                        onChange={e =>
                          setMigrateDoc(
                            isToCompany ? formatCnpj(e.target.value) : formatCpf(e.target.value)
                          )
                        }
                        placeholder={isToCompany ? "00.000.000/0000-00" : "000.000.000-00"}
                        maxLength={isToCompany ? 18 : 14}
                        className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  )}

                  {missingFields.length > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                      Após migrar, complete os dados faltantes em <strong>Configurações</strong>.
                    </p>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    Seus documentos de verificação poderão ser solicitados novamente pela equipe.
                  </p>

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={() => setMigrateOpen(false)} disabled={migrating}>
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 gap-1.5"
                      onClick={handleMigrate}
                      disabled={migrating || (!alreadyHasDoc && migrateDoc.replace(/\D/g, "").length < (isToCompany ? 14 : 11))}
                    >
                      {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
                      {migrating ? "Migrando..." : "Confirmar migração"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}

        {/* Modal: mudar para Cliente */}
        {profile && (profile.user_type === "professional" || profile.user_type === "company") && (
          <Dialog open={toClientOpen} onOpenChange={setToClientOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-primary" /> Mudar para Cliente
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                <p className="text-sm text-muted-foreground">
                  Seu perfil deixará de ser{" "}
                  <strong className="text-foreground">{profile.user_type === "company" ? "Empresa" : "Profissional"}</strong>{" "}
                  e passará a ser <strong className="text-foreground">Cliente</strong>. Você não aparecerá mais nas buscas
                  como prestador e perderá o acesso ao Painel Profissional.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                  Se você tem um plano pago ativo, cancele a assinatura em <strong>Configurações</strong> para não ser cobrado.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setToClientOpen(false)} disabled={migrating}>
                    Cancelar
                  </Button>
                  <Button className="flex-1 gap-1.5" onClick={handleMigrateToClient} disabled={migrating}>
                    {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
                    {migrating ? "Mudando..." : "Confirmar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <SponsorLaunchNovidadeModal
          open={sponsorNovidadeOpen}
          onOpenChange={setSponsorNovidadeOpen}
          sponsor={linkedSponsor}
          onPublished={() => setSponsorPanelKey((k) => k + 1)}
        />
      </main>
    </AppLayout>
  );
};

export default Profile;