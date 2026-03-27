import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Lock, MapPin, Crown, Settings } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";

const ProfileSettings = () => {
  const { profile } = useAuth();
  const isPro = profile?.user_type === "professional" || profile?.user_type === "company";

  const items = [
    { icon: Lock, label: "Alterar senha", path: "/profile/settings/senha", desc: "Atualize sua senha de acesso" },
    { icon: MapPin, label: "Endereço", path: "/profile/settings/endereco", desc: "CEP, rua, cidade e estado" },
    ...(isPro
      ? [{ icon: Crown, label: "Planos e assinatura", path: "/subscriptions", desc: "Gerenciar seu plano no Chamô" } as const]
      : []),
  ];

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <Link
          to="/profile"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Settings className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Configurações</h1>
            <p className="text-sm text-muted-foreground">Conta, endereço e assinatura</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Link
              key={item.path + item.label}
              to={item.path}
              className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 transition-all"
            >
              <item.icon className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-foreground block">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.desc}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      </main>
    </AppLayout>
  );
};

export default ProfileSettings;
