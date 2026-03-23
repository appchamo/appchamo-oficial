import AppLayout from "@/components/AppLayout";
import { User, Mail, Shield, Ticket, ChevronRight, LogOut, Phone, Briefcase, Crown, Pencil, Star, Circle, Save, Trash2, Lock, FileQuestion, CalendarOff, Clock, CalendarCheck, Plus, AlertCircle, CheckCircle2, CreditCard, QrCode, Share2 } from "lucide-react";
import { formatCpf, formatCnpj } from "@/lib/formatters";
import { PasswordInput } from "@/components/ui/password-input";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ImageCropUpload from "@/components/ImageCropUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    return `${url}${separator}width=200&height=200&quality=75&resize=cover`;
  }
  return url;
};

const Profile = () => {
  const navigate = useNavigate();
  const { profile, user, signOut, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [experience, setExperience] = useState("");
  const [services, setServices] = useState<string[]>([""]);
  const [bio, setBio] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [proData, setProData] = useState<{ id: string; slug: string | null; experience: string | null; services: string[] | null; bio: string | null; rating: number; total_services: number; total_reviews: number; verified: boolean; availability_status: string; category_name: string } | null>(null);

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
    if (!user || !profile) return;
    setName(profile.full_name || "");
    setPhone(profile.phone || "");

    if (profile.user_type === "professional" || profile.user_type === "company") {
      const loadPro = async () => {
        const { data } = await supabase
          .from("professionals")
          .select("id, slug, experience, services, bio, rating, total_services, total_reviews, verified, availability_status, categories(name)")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) {
          setProData({
            ...data,
            slug: data.slug || null,
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

  const handleSave = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: name, phone }).eq("user_id", user.id);
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
    const link = `https://appchamo.com/professional/${proData.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${profile?.full_name || "Meu perfil"} no Chamô`, url: link });
        return;
      } catch { /* cancelado */ }
    }
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copiado!", description: link });
    } catch {
      toast({ title: "Seu link:", description: link });
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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-manage", {
        body: { action: "delete_own_account" },
      });
      if (res.error) throw res.error;
      await supabase.auth.signOut();
      navigate("/");
      toast({ title: "Conta excluída com sucesso." });
    } catch (e: any) {
      toast({ title: "Erro ao excluir conta", description: e.message, variant: "destructive" });
    }
    setDeleting(false);
  };

  if (!profile) return <AppLayout><main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Carregando...</main></AppLayout>;

  const typeLabel = profile.user_type === "professional" ? "Profissional" : profile.user_type === "company" ? "Empresa" : "Cliente";
  const initials = (profile.full_name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>
          {!editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          )}
        </div>

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

        <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
          <div className="flex items-start gap-4">
            <div className="relative flex-shrink-0">
              {profile.avatar_url ? (
                // ✨ APLICADO AQUI: Passamos a URL original para a função que devolve a URL minificada
                <img 
                  src={getOptimizedAvatar(profile.avatar_url)} 
                  alt="Avatar" 
                  className="w-20 h-20 rounded-2xl object-cover"
                  loading="eager" 
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">{initials}</div>
              )}
              {editing && (
                <div className="absolute -bottom-1 -right-1">
                  <ImageCropUpload onUpload={handleAvatarUpload} aspect={1} shape="round" bucketPath="avatars" currentImage={profile.avatar_url} label="" maxSize={400} quality={0.82} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" placeholder="Nome completo" />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" placeholder="Telefone" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">{profile.full_name || "Usuário"}</h2>
                    {proData?.slug && (
                      <button
                        onClick={handleShareProfile}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Compartilhar perfil"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5"><Mail className="w-3.5 h-3.5" /> {profile.email}</p>
                  {profile.phone && <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5"><Phone className="w-3.5 h-3.5" /> {profile.phone}</p>}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1.5 gap-1 ${profile.user_type === "company" ? "bg-primary/10 text-primary" : profile.user_type === "professional" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                    <Shield className="w-3 h-3" /> {typeLabel}
                  </span>
                </>
              )}
            </div>
          </div>

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
                    <p className="text-sm text-muted-foreground">Nenhuma informação de perfil preenchida. Clique em Editar para adicionar.</p>
                  )}
                </>
              )}
            </div>
          )}

          {editing && (
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"><Save className="w-4 h-4" /> Salvar</button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {[
            ...((profile.user_type === "professional" || profile.user_type === "company") ? [{ icon: Briefcase, label: "Painel Profissional", path: "/pro" }] : []),
            { icon: CalendarCheck, label: "Meus agendamentos", path: "/meus-agendamentos" },
            ...((profile.user_type === "professional" || profile.user_type === "company") ? [{ icon: Crown, label: "Planos e Assinatura", path: "/subscriptions" }] : []),
            { icon: Ticket, label: "Meus Cupons", path: "/coupons" },
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

          <button onClick={() => setPasswordOpen(true)} className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 transition-all w-full text-left">
            <Lock className="w-5 h-5 text-primary" />
            <span className="flex-1 text-sm font-medium text-foreground">Alterar senha</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
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

        {/* Change Password Dialog */}
        <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Alterar senha</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <PasswordInput label="Senha atual" value={currentPassword} onChange={setCurrentPassword} placeholder="••••••••" autoComplete="current-password" />
              <PasswordInput label="Nova senha" value={newPassword} onChange={setNewPassword} placeholder="••••••••" autoComplete="new-password" />
              <PasswordInput label="Confirmar nova senha" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" autoComplete="new-password" />
              <button onClick={async () => {
                if (!currentPassword) { toast({ title: "Digite sua senha atual.", variant: "destructive" }); return; }
                if (newPassword.length < 6) { toast({ title: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" }); return; }
                if (newPassword !== confirmPassword) { toast({ title: "As senhas não conferem.", variant: "destructive" }); return; }
                setSavingPassword(true);
                // Verify current password by re-signing in
                const { error: signInError } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPassword });
                if (signInError) { toast({ title: "Senha atual incorreta.", variant: "destructive" }); setSavingPassword(false); return; }
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) { toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" }); }
                else { toast({ title: "Senha alterada com sucesso!" }); setPasswordOpen(false); setNewPassword(""); setConfirmPassword(""); setCurrentPassword(""); }
                setSavingPassword(false);
              }} disabled={savingPassword || newPassword.length < 6 || !currentPassword}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {savingPassword ? "Salvando..." : "Salvar nova senha"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default Profile;