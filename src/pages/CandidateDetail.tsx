import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, User, MapPin, Send, Share2, X } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { fetchCandidate, sendProposal, type CandidateCard } from "@/lib/jobSeeker";
import { getPublicAppBaseUrl } from "@/lib/publicAppUrl";

const CandidateDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [candidate, setCandidate] = useState<CandidateCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [chamarOpen, setChamarOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const c = await fetchCandidate(userId);
      if (!cancelled) { setCandidate(c); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const isSelf = !!user && user.id === userId;

  const handleSend = async () => {
    if (!user || !userId || sending) return;
    setSending(true);
    const { error } = await sendProposal(user.id, userId, message);
    setSending(false);
    if (error) {
      toast({ title: "Não foi possível enviar", description: error, variant: "destructive" });
      return;
    }
    setChamarOpen(false);
    setMessage("");
    toast({ title: "Proposta enviada!", description: "A pessoa foi notificada e verá sua mensagem." });
  };

  const handleShare = async () => {
    const url = `${getPublicAppBaseUrl().replace(/\/$/, "")}/curriculos/${userId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: candidate?.full_name || "Currículo", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!" });
      }
    } catch { /* cancelado */ }
  };

  if (loading) {
    return <AppLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  }

  if (!candidate) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto px-4 py-10 text-center">
          <p className="text-muted-foreground mb-4">Currículo não encontrado ou indisponível.</p>
          <button onClick={() => navigate(-1)} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Voltar</button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-4 pb-24">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="flex items-center gap-4 mb-4">
          {candidate.avatar_url ? (
            <img src={candidate.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-primary/30" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center"><User className="w-9 h-9 text-primary" /></div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{candidate.full_name || "Candidato"}</h1>
            {(candidate.city || candidate.state) && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {[candidate.city, candidate.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        {candidate.headline && <p className="text-sm text-foreground/90 mb-4 leading-relaxed">{candidate.headline}</p>}

        {!isSelf && (
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setChamarOpen(true)}
              className="flex-1 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg shadow-primary/30"
            >
              CHAMAR
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="px-4 rounded-xl border-2 border-primary/30 text-primary font-semibold text-xs hover:bg-primary/5 transition-colors flex items-center gap-1"
            >
              <Share2 className="w-4 h-4" /> Compartilhar
            </button>
          </div>
        )}

        {candidate.objetivo && <Section title="Objetivo"><p className="text-sm text-foreground/90">{candidate.objetivo}</p></Section>}
        {candidate.experiencia && <Section title="Experiência"><p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{candidate.experiencia}</p></Section>}
        {candidate.skills && candidate.skills.length > 0 && (
          <Section title="Serviços / habilidades">
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((s) => (
                <span key={s} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{s}</span>
              ))}
            </div>
          </Section>
        )}
        {candidate.sobre && <Section title="Sobre"><p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{candidate.sobre}</p></Section>}
      </main>

      {chamarOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 px-4 py-6" onClick={() => setChamarOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-foreground">Chamar {candidate.full_name?.split(" ")[0] || "candidato"}</h3>
              <button onClick={() => setChamarOpen(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Escreva uma mensagem com sua proposta. A pessoa será notificada (app e push).</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Ex.: Olá! Tenho uma oportunidade de auxiliar de cozinha. Podemos conversar?"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none mb-3"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Enviando..." : "Enviar proposta"}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 mb-3">
      <h2 className="text-sm font-bold text-foreground mb-2">{title}</h2>
      {children}
    </div>
  );
}

export default CandidateDetail;
