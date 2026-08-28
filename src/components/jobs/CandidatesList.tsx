import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin, User, ChevronRight, Briefcase } from "lucide-react";
import { fetchCandidates, type CandidateCard } from "@/lib/jobSeeker";

const CandidatesList = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<CandidateCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchCandidates("");
        if (!cancelled) setCandidates(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const t = search.trim().toLowerCase();
  const filtered = !t
    ? candidates
    : candidates.filter(
        (c) =>
          (c.full_name || "").toLowerCase().includes(t) ||
          (c.objetivo || "").toLowerCase().includes(t) ||
          (c.headline || "").toLowerCase().includes(t) ||
          (c.city || "").toLowerCase().includes(t) ||
          (c.skills || []).some((s) => s.toLowerCase().includes(t)),
      );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Currículos</h1>
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "pessoa disponível" : "pessoas disponíveis"} pra proposta
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30 mb-5">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, objetivo, habilidade ou cidade..."
          className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Briefcase className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium">Nenhum currículo disponível</p>
          <p className="text-xs max-w-[240px]">Quando alguém publicar o currículo, aparece aqui pra você chamar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <button
              key={c.user_id}
              type="button"
              onClick={() => navigate(`/curriculos/${c.user_id}`)}
              className="flex items-center gap-3 bg-card border rounded-2xl p-4 hover:border-primary/30 hover:shadow-card transition-all active:scale-[0.99] text-left w-full"
            >
              {c.avatar_url ? (
                <img src={c.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover border border-border flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm truncate">{c.full_name || "Candidato"}</h3>
                {(c.objetivo || c.headline) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {c.objetivo ? `Objetivo: ${c.objetivo}` : c.headline}
                  </p>
                )}
                {(c.city || c.state) && (
                  <span className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    <MapPin className="w-2.5 h-2.5" /> {[c.city, c.state].filter(Boolean).join("/")}
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CandidatesList;
