import AdminLayout from "@/components/AdminLayout";
import { Save, Loader2, Lock, Volume2, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import ImageCropUpload from "@/components/ImageCropUpload";
import { iconMap } from "@/components/PlatformStats";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AdminSettings = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statsRows, setStatsRows] = useState<any[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [uploadingSound, setUploadingSound] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Erro ao alterar senha", description: translateError(error.message), variant: "destructive" });
    } else {
      toast({ title: "Senha alterada com sucesso!" });
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPassword(false);
  };

  useEffect(() => {
    const fetchAll = async () => {
      const [{ data: settingsData }, { data: statsData }] = await Promise.all([
        supabase.from("platform_settings").select("*"),
        supabase.from("platform_stats").select("*").order("sort_order"),
      ]);
      if (settingsData) {
        const map: Record<string, string> = {};
        for (const s of settingsData) {
          const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value).replace(/^"|"$/g, "");
          map[s.key] = val;
        }
        setSettings(map);
      }
      if (statsData) setStatsRows(statsData);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const set = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));

  const updateStat = (id: string, field: string, value: any) =>
    setStatsRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const handleSave = async () => {
    setSaving(true);
    // Save platform_settings
    for (const [key, value] of Object.entries(settings)) {
      await supabase.from("platform_settings").upsert(
        { key, value: value as any },
        { onConflict: "key" }
      );
    }
    // Save platform_stats
    for (const row of statsRows) {
      await supabase.from("platform_stats").update({
        icon_name: row.icon_name,
        label: row.label,
        value_mode: row.value_mode,
        manual_value: row.manual_value || 0,
        sort_order: row.sort_order,
        active: row.active,
      }).eq("id", row.id);
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("admin_logs").insert({
        admin_user_id: session.user.id,
        action: "update_settings",
        target_type: "settings",
      });
    }
    toast({ title: "Configurações salvas!" });
    setSaving(false);
  };

  if (loading) {
    return <AdminLayout title="Configurações"><div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div></AdminLayout>;
  }

  return (
    <AdminLayout title="Configurações">
      <div className="max-w-lg space-y-6">
        {/* Change Password */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Lock className="w-4 h-4" /> Alterar Senha do Admin</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nova senha</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Confirmar nova senha</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <button onClick={handleChangePassword} disabled={changingPassword}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
            {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {changingPassword ? "Alterando..." : "Alterar senha"}
          </button>
        </div>

        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Imagem & Marca</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Imagem principal (Landing)</label>
            <ImageCropUpload aspect={16 / 9} shape="rect" bucketPath="branding" currentImage={settings.hero_image_url || null}
              onUpload={(url) => set("hero_image_url", url)} label="Enviar imagem" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Imagem de fundo do Login</label>
            <ImageCropUpload aspect={9 / 16} shape="rect" bucketPath="branding" currentImage={settings.login_bg_url || null}
              onUpload={(url) => set("login_bg_url", url)} label="Enviar imagem de fundo" />
            {settings.login_bg_url && (
              <button type="button" onClick={() => set("login_bg_url", "")}
                className="mt-2 text-xs text-destructive hover:underline">
                Remover imagem de fundo
              </button>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título principal</label>
            <input value={settings.landing_headline || ""} onChange={(e) => set("landing_headline", e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Subtítulo</label>
            <input value={settings.landing_subheadline || ""} onChange={(e) => set("landing_subheadline", e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <h3 className="font-medium text-sm text-foreground pt-4 border-t mt-4">Tela de carregamento (ao abrir o app)</h3>
          <p className="text-xs text-muted-foreground">Exibida por alguns segundos ao abrir o app. Logo + fundo + efeito de entrada.</p>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Logo da tela de carregamento</label>
            <ImageCropUpload aspect={1} shape="rect" bucketPath="branding" currentImage={settings.splash_logo_url || null}
              onUpload={(url) => set("splash_logo_url", url)} label="Enviar logo" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cor de fundo da tela de carregamento</label>
            <div className="flex items-center gap-2">
              <input type="color" value={settings.splash_bg_color || "#f97316"}
                onChange={(e) => set("splash_bg_color", e.target.value)}
                className="w-12 h-10 rounded-lg border cursor-pointer bg-background" />
              <input type="text" value={settings.splash_bg_color || "#f97316"} onChange={(e) => set("splash_bg_color", e.target.value)}
                className="flex-1 border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" placeholder="#f97316" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Efeito de entrada da logo</label>
            <select value={settings.splash_animation || "scaleIn"} onChange={(e) => set("splash_animation", e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">
              <option value="fadeIn">Fade in (aparecer suave)</option>
              <option value="scaleIn">Scale in (aumentar do centro)</option>
              <option value="slideUp">Slide up (subir de baixo)</option>
              <option value="slideDown">Slide down (descer de cima)</option>
              <option value="slideLeft">Slide left (entrar pela esquerda)</option>
              <option value="slideRight">Slide right (entrar pela direita)</option>
              <option value="zoomIn">Zoom in (aproximar)</option>
              <option value="bounceIn">Bounce in (quicar)</option>
              <option value="flipIn">Flip in (virar)</option>
              <option value="pulseIn">Pulse in (pulsar)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Duração (segundos)</label>
            <input type="number" min={1} max={5} step={0.5} value={settings.splash_duration_seconds || "2"}
              onChange={(e) => set("splash_duration_seconds", e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        {/* Coupon Rules */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Regras de cupons</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cupons sorteio no cadastro</label>
              <input type="number" value={settings.coupon_on_registration || "1"} onChange={(e) => set("coupon_on_registration", e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cupons sorteio por pagamento</label>
              <input type="number" value={settings.coupon_on_payment || "1"} onChange={(e) => set("coupon_on_payment", e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <h3 className="font-medium text-sm text-foreground pt-2">Cupom de desconto (pós-pagamento)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ativar cupom desconto</label>
              <select value={settings.discount_coupon_enabled || "true"} onChange={(e) => set("discount_coupon_enabled", e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo de desconto</label>
              <select value={settings.discount_coupon_type || "percentage"} onChange={(e) => set("discount_coupon_type", e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">
                <option value="percentage">Porcentagem (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                {(settings.discount_coupon_type || "percentage") === "percentage" ? "% de desconto" : "Valor fixo (R$)"}
              </label>
              <input type="number" step="0.5" value={settings.discount_coupon_percent || "5"} onChange={(e) => set("discount_coupon_percent", e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Qtd cupons desconto/mês</label>
              <input type="number" value={settings.discount_coupons_per_month || "100"} onChange={(e) => set("discount_coupons_per_month", e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Validade (dias)</label>
              <input type="number" value={settings.discount_coupon_validity_days || "30"} onChange={(e) => set("discount_coupon_validity_days", e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
        </div>

        {/* Raffle */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Sorteio Mensal</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Prêmio</label>
            <input value={settings.raffle_prize_title || ""} onChange={(e) => set("raffle_prize_title", e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Data do sorteio</label>
            <input type="date" value={settings.raffle_draw_date || ""} onChange={(e) => set("raffle_draw_date", e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Regras</label>
            <textarea value={settings.raffle_rules || ""} onChange={(e) => set("raffle_rules", e.target.value)} rows={3}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>

        {/* Terms */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Termos de Uso</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Versão</label>
            <input value={settings.terms_version || "1.0"} onChange={(e) => set("terms_version", e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Texto dos Termos</label>
            <textarea value={settings.terms_of_use || ""} onChange={(e) => set("terms_of_use", e.target.value)} rows={5}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Política de Privacidade</label>
            <textarea value={settings.privacy_policy || ""} onChange={(e) => set("privacy_policy", e.target.value)} rows={5}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>

        {/* Home Stats */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Estatísticas da Home</h2>
          {statsRows.map((row) => {
            const Icon = iconMap[row.icon_name] || iconMap.Briefcase;
            return (
              <div key={row.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  {Icon && <Icon className="w-5 h-5 text-primary" />}
                  <span className="font-medium text-sm text-foreground">{row.label || "Sem label"}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ícone</label>
                    <Select value={row.icon_name} onValueChange={(v) => updateStat(row.id, "icon_name", v)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(iconMap).map((name) => {
                          const I = iconMap[name];
                          return (
                            <SelectItem key={name} value={name}>
                              <span className="flex items-center gap-2"><I className="w-4 h-4" />{name}</span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Label</label>
                    <input value={row.label} onChange={(e) => updateStat(row.id, "label", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Modo do valor</label>
                    <Select value={row.value_mode} onValueChange={(v) => updateStat(row.id, "value_mode", v)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto_professionals">Auto: Profissionais</SelectItem>
                        <SelectItem value="auto_services">Auto: Serviços</SelectItem>
                        <SelectItem value="auto_coupons">Auto: Cupons</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {row.value_mode === "manual" && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Valor manual</label>
                      <input type="number" value={row.manual_value || 0} onChange={(e) => updateStat(row.id, "manual_value", parseInt(e.target.value) || 0)}
                        className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ordem</label>
                    <input type="number" value={row.sort_order} onChange={(e) => updateStat(row.id, "sort_order", parseInt(e.target.value) || 0)}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notification Sound */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Volume2 className="w-4 h-4" /> Som de Notificação</h2>
          <p className="text-xs text-muted-foreground">Faça upload de um arquivo de áudio (.mp3, .wav, .ogg) que será tocado quando o usuário receber uma nova notificação.</p>
          {settings.notification_sound_url ? (
            <div className="space-y-2">
              <audio controls src={settings.notification_sound_url} className="w-full h-10" />
              <button type="button" onClick={() => set("notification_sound_url", "")}
                className="flex items-center gap-1.5 text-xs text-destructive hover:underline">
                <Trash2 className="w-3.5 h-3.5" /> Remover som
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Nenhum som configurado. Será usado um som padrão.</p>
          )}
          <div>
            <input
              type="file"
              accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/webm,.mp3,.wav,.ogg"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  toast({ title: "Arquivo muito grande", description: "Máximo 5MB", variant: "destructive" });
                  return;
                }
                setUploadingSound(true);
                const ext = file.name.split(".").pop() || "mp3";
                const fileName = `branding/notification-sound.${ext}`;
                const { error: uploadError } = await supabase.storage.from("uploads").upload(fileName, file, { contentType: file.type, upsert: true });
                if (uploadError) {
                  toast({ title: "Erro ao enviar áudio", variant: "destructive" });
                  setUploadingSound(false);
                  return;
                }
                const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
                set("notification_sound_url", `${urlData.publicUrl}?v=${Date.now()}`);
                toast({ title: "Som de notificação enviado!" });
                setUploadingSound(false);
              }}
              className="hidden"
              id="notification-sound-upload"
            />
            <label htmlFor="notification-sound-upload"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium cursor-pointer hover:bg-muted transition-colors">
              {uploadingSound ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
              {uploadingSound ? "Enviando..." : "Fazer upload de áudio"}
            </label>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;
