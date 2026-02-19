import AppLayout from "@/components/AppLayout";
import { CreditCard, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const HowToPay = () => {
  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/how-it-works" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="text-xl font-bold text-foreground mb-4">Como Pagar</h1>
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <CreditCard className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-sm">Tutorial em breve</p>
        </div>
      </main>
    </AppLayout>
  );
};

export default HowToPay;
