import { Link } from "react-router-dom";
import { Wallet, ChevronRight } from "lucide-react";

interface HomeBalanceCardProps {
  walletBalance: number;
  walletLoaded: boolean;
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

/** Seção de saldo do profissional na home (leva para a Carteira). */
const HomeBalanceCard = ({ walletBalance, walletLoaded }: HomeBalanceCardProps) => {
  return (
    <Link
      to="/pro/carteira"
      className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-5 shadow-lg shadow-primary/20 active:scale-[0.99] transition-transform"
      style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 60%, #c2410c 100%)" }}
    >
      <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10" />
      <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5" />
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
        <Wallet className="h-6 w-6 text-white" strokeWidth={2.25} aria-hidden />
      </div>
      <div className="relative min-w-0 flex-1">
        <p className="text-xs font-medium text-white/80">Seu saldo</p>
        <p className="text-2xl font-extrabold text-white leading-tight">
          {walletLoaded ? brl(walletBalance) : "—"}
        </p>
      </div>
      <span className="relative flex shrink-0 items-center gap-0.5 text-sm font-bold text-white">
        Carteira
        <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
    </Link>
  );
};

export default HomeBalanceCard;
