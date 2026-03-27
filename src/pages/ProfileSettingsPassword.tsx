import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";

const ProfileSettingsPassword = () => {
  const { profile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!profile?.email) {
      toast({ title: "Sessão inválida", variant: "destructive" });
      return;
    }
    if (!currentPassword) {
      toast({ title: "Digite sua senha atual.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "As senhas não conferem.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword,
    });
    if (signInError) {
      toast({ title: "Senha atual incorreta.", variant: "destructive" });
      setSaving(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Senha alterada com sucesso!" });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <Link
          to="/profile/settings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Configurações
        </Link>

        <h1 className="text-xl font-bold text-foreground mb-1">Alterar senha</h1>
        <p className="text-sm text-muted-foreground mb-6">Use uma senha forte que você não usa em outros sites.</p>

        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-4 max-w-md">
          <PasswordInput
            label="Senha atual"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <PasswordInput
            label="Nova senha"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirmar nova senha"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || newPassword.length < 6 || !currentPassword}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar nova senha"}
          </button>
        </div>
      </main>
    </AppLayout>
  );
};

export default ProfileSettingsPassword;
