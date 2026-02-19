import AppLayout from "@/components/AppLayout";
import { BookOpen, UserCheck, CreditCard, Wallet, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const sections = [
  {
    id: "usar",
    icon: BookOpen,
    title: "Como usar o Chamô",
    steps: [
      "Crie sua conta gratuitamente",
      "Busque profissionais pela categoria desejada",
      "Veja avaliações e portfólio dos profissionais",
      "Solicite um orçamento diretamente pelo app",
    ],
  },
  {
    id: "contratar",
    icon: UserCheck,
    title: "Como contratar",
    steps: [
      "Escolha o profissional ideal",
      "Envie uma solicitação de orçamento",
      "Aguarde a resposta do profissional",
      "Confirme o serviço e realize o pagamento pelo app",
    ],
  },
  {
    id: "pagamento",
    icon: CreditCard,
    title: "Como realizar um pagamento",
    steps: [
      "Após confirmar o serviço, clique em 'Pagar pelo app'",
      "Escolha a forma de pagamento (Pix, cartão, etc.)",
      "Confirme o pagamento",
      "Receba um cupom para o sorteio mensal!",
    ],
  },
  {
    id: "saques",
    icon: Wallet,
    title: "Assinaturas e saques",
    steps: [
      "Profissionais podem assinar planos para maior visibilidade",
      "O saldo é acumulado a cada serviço concluído",
      "Solicite o saque quando atingir o valor mínimo",
      "O valor é transferido em até 3 dias úteis",
    ],
  },
];

const HowItWorks = () => {
  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="text-xl font-bold text-foreground mb-5">Como funciona o Chamô</h1>
        <div className="flex flex-col gap-5">
          {sections.map((s) => (
            <div key={s.id} id={s.id} className="bg-card border rounded-2xl p-5 shadow-card scroll-mt-20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                  <s.icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <h2 className="font-semibold text-foreground">{s.title}</h2>
              </div>
              <ol className="flex flex-col gap-2 ml-1">
                {s.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </main>
    </AppLayout>
  );
};

export default HowItWorks;
