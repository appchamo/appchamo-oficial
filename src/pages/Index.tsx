import { Link } from "react-router-dom";
import { ArrowRight, Shield, Gift, Users } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 py-4 flex items-center justify-between max-w-screen-lg mx-auto w-full">
        <span className="text-2xl font-extrabold text-gradient tracking-tight">Chamô</span>
        <Link to="/login" className="text-sm font-medium text-primary hover:underline">Entrar</Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center max-w-md mx-auto gap-6">
        <h1 className="text-3xl font-extrabold text-foreground leading-tight">
          Encontre profissionais de confiança <span className="text-gradient">perto de você</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Contrate com segurança e concorra a prêmios mensais.
        </p>
        <div className="flex gap-3 w-full">
          <Link to="/signup" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
            Criar conta <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/login" className="flex-1 flex items-center justify-center py-3 rounded-xl border font-medium text-sm text-foreground hover:bg-muted transition-colors">
            Entrar
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-3 w-full mt-4">
          <div className="bg-card border rounded-xl p-3 text-center">
            <Shield className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-[10px] font-medium text-foreground">Pagamento seguro</p>
          </div>
          <div className="bg-card border rounded-xl p-3 text-center">
            <Gift className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-[10px] font-medium text-foreground">Sorteios mensais</p>
          </div>
          <div className="bg-card border rounded-xl p-3 text-center">
            <Users className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-[10px] font-medium text-foreground">Profissionais verificados</p>
          </div>
        </div>
      </main>

      <footer className="text-center py-4 border-t">
        <p className="text-[10px] text-muted-foreground">
          © 2026 Chamô. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
};

export default Index;
