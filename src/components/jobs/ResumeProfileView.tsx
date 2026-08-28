import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Loader2, User, MapPin, Send, Share2, X, Pencil, UserPlus, UserCheck, Plus, Check,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  fetchCandidate, saveMyResume, sendProposal, isFollowingUser, setFollowUser,
  type CandidateCard, type JobSeekerProfile,
} from "@/lib/jobSeeker";
import { getPublicAppBaseUrl } from "@/lib/publicAppUrl";

interface Props {
  targetUserId: string;
  isOwner: boolean;
}

type Draft = Omit<JobSeekerProfile, "user_id">;

const emptyDraft = (): Draft => ({
  is_public: false, visible_to_all: false, visible_to_companies: true, visible_to_pros: true,
  headline: "", objetivo: "", experiencia: "", sobre: "", skills: [], city: null, state: null,
});

const ResumeProfileView = ({ targetUserId, isOwner }: Props) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [candidate, setCandidate] = useState<CandidateCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  // Visitante
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [chamarOpen, setChamarOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    const c = await fetchCandidate(targetUserId);
    setCandidate(c);
    if (c) {
      setDraft({
        is_public: c.is_public, visible_to_all: c.visible_to_all,
        visible_to_companies: c.visible_to_companies, visible_to_pros: c.visible_to_pros,
        headline: c.headline ?? "", objetivo: c.objetivo ?? "", experiencia: c.experiencia ?? "",
        sobre: c.sobre ?? "", skills: c.skills ?? [], city: c.city, state: c.state,
      });
    }
    if (!isOwner && user) setFollowing(await isFollowingUser(user.id, targetUserId));
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [targetUserId]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const handleSaveAll = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await saveMyResume(user.id, {
      ...draft,
      city: profile?.address_city ?? draft.city ?? null,
      state: profile?.address_state ?? draft.state ?? null,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error, variant: "destructive" }); return; }
    toast({ title: draft.is_public ? "Currículo publicado!" : "Currículo salvo (oculto)" });
    setEditing(false);
    void load();
  };

  const handleFollow = async () => {
    if (!user) { navigate("/login"); return; }
    setFollowBusy(true);
    const next = !following;
    const { error } = await setFollowUser(user.id, targetUserId, next);
    setFollowBusy(false);
    if (error) { toast({ title: "Não foi possível", description: error, variant: "destructive" }); return; }
    setFollowing(next);
    toast({ title: next ? "Seguindo! Você será avisado das novidades." : "Deixou de seguir" });
  };

  const handleSend = async () => {
    if (!user || sending) return;
    setSending(true);
    const { error } = await sendProposal(user.id, targetUserId, message);
    setSending(false);
    if (error) { toast({ title: "Não foi possível enviar", description: error, variant: "destructive" }); return; }
    setChamarOpen(false); setMessage("");
    toast({ title: "Proposta enviada!", description: "A pessoa foi notificada e verá sua mensagem." });
  };

  const handleShare = async () => {
    const url = `${getPublicAppBaseUrl().replace(/\/$/, "")}/curriculos/${targetUserId}`;
    try {
      if (navigator.share) await navigator.share({ title: candidate?.full_name || "Currículo", url });
      else { await navigator.clipboard.writeText(url); toast({ title: "Link copiado!" }); }
    } catch { /* cancelado */ }
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !draft.skills.includes(s)) set("skills", [...draft.skills, s]);
    setSkillInput("");
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!candidate && !isOwner) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <p className="text-muted-foreground mb-4">Currículo não encontrado ou indisponível.</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Voltar</button>
      </div>
    );
  }

  const name = candidate?.full_name || (isOwner ? (profile?.full_name || "Você") : "Candidato");
  const avatar = candidate?.avatar_url || profile?.avatar_url || null;
  const cityLabel = [candidate?.city ?? profile?.address_city, candidate?.state ?? profile?.address_state].filter(Boolean).join(", ");
  const EditPencil = ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0" aria-label="Editar">
      <Pencil className="w-4 h-4 text-muted-foreground" />
    </button>
  );

  return (
    <div className="max-w-md mx-auto pb-28">
      {/* Cabeçalho */}
      <div className="relative -mx-4 mb-0 bg-muted/60 px-4 pt-3 pb-12 rounded-b-3xl">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
            <ArrowLeft className="w-5 h-5" /> Voltar
          </button>
          <span className="text-sm text-muted-foreground">{isOwner ? "Meu perfil" : "Currículo"}</span>
          {isOwner ? <EditPencil onClick={() => setEditing((e) => !e)} /> : <span className="w-8" />}
        </div>
      </div>

      <div>
        <div className="-mt-12 mb-3">
          {avatar ? (
            <img src={avatar} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-background bg-card shadow-md" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center border-4 border-background shadow-md"><User className="w-10 h-10 text-primary" /></div>
          )}
        </div>

        {/* Visibilidade (dono) */}
        {isOwner && (
          <div className="rounded-2xl border bg-card p-3 mb-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-foreground">Perfil público</span>
              <div className="inline-flex rounded-full bg-muted p-0.5">
                <button type="button" onClick={() => set("is_public", true)} className={`px-3 py-1 rounded-full text-xs font-bold ${draft.is_public ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Sim</button>
                <button type="button" onClick={() => set("is_public", false)} className={`px-3 py-1 rounded-full text-xs font-bold ${!draft.is_public ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Não</button>
              </div>
            </div>
            {draft.is_public && (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Quem pode ver seu perfil?</p>
                <div className="flex flex-wrap gap-2">
                  {([["visible_to_all", "Todos"], ["visible_to_companies", "Empresas"], ["visible_to_pros", "Profissionais"]] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => set(k, !draft[k])}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${draft[k] ? "bg-primary/10 text-primary border-primary/30" : "bg-card text-muted-foreground border-border"}`}>
                      {draft[k] && <Check className="w-3 h-3" />}{label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Nome + localização */}
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-extrabold text-foreground">{name}</h1>
          {cityLabel && <span className="text-sm text-primary flex items-center gap-0.5"><MapPin className="w-3.5 h-3.5" /> {cityLabel}</span>}
        </div>

        {/* Headline */}
        {editing ? (
          <textarea value={draft.headline ?? ""} onChange={(e) => set("headline", e.target.value)} rows={3}
            placeholder="Frase de apresentação (ex.: Auxiliar de cozinha com 5 anos...)"
            className="w-full mt-2 border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        ) : (candidate?.headline || (isOwner && draft.headline)) ? (
          <p className="text-sm text-foreground/80 mt-1.5 leading-relaxed">{candidate?.headline || draft.headline}</p>
        ) : null}

        {/* Ações */}
        <div className="flex gap-2 my-4">
          <button type="button" disabled={isOwner} onClick={() => setChamarOpen(true)}
            className="flex-1 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg shadow-primary/30 disabled:opacity-40">
            CHAMAR
          </button>
          {!isOwner && (
            <button type="button" onClick={handleFollow} disabled={followBusy}
              className={`px-4 rounded-xl border-2 font-semibold text-xs flex flex-col items-center justify-center gap-0.5 transition-colors ${following ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-muted"}`}>
              {followBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : following ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {following ? "Seguindo" : "Seguir"}
            </button>
          )}
          <button type="button" onClick={handleShare}
            className="px-4 rounded-xl border-2 border-border text-foreground font-semibold text-xs flex flex-col items-center justify-center gap-0.5 hover:bg-muted transition-colors">
            <Share2 className="w-4 h-4" /> Compartilhar
          </button>
        </div>

        {/* Objetivo */}
        <SectionRow title={editing ? "" : `Objetivo: ${candidate?.objetivo || draft.objetivo || "—"}`} owner={isOwner} onEdit={() => setEditing(true)} inline>
          {editing && (
            <input value={draft.objetivo ?? ""} onChange={(e) => set("objetivo", e.target.value)} placeholder="Objetivo (ex.: Comercial)"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          )}
        </SectionRow>

        {/* Experiência */}
        {(editing || candidate?.experiencia || draft.experiencia) && (
          <Card title="Experiência" owner={isOwner} onEdit={() => setEditing(true)}>
            {editing ? (
              <textarea value={draft.experiencia ?? ""} onChange={(e) => set("experiencia", e.target.value)} rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            ) : (
              <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{candidate?.experiencia || draft.experiencia}</p>
            )}

            {/* Serviços */}
            {(editing || (candidate?.skills?.length ?? draft.skills.length) > 0) && (
              <div className="mt-4">
                <p className="text-sm font-bold text-foreground mb-2">Serviços</p>
                {editing ? (
                  <>
                    <div className="flex gap-2 mb-2">
                      <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                        placeholder="Ex.: Alvenaria" className="flex-1 border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                      <button type="button" onClick={addSkill} className="px-3 rounded-xl bg-primary text-primary-foreground"><Plus className="w-4 h-4" /></button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {draft.skills.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-xs">{s}
                          <button type="button" onClick={() => set("skills", draft.skills.filter((x) => x !== s))}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <ul className="space-y-1">
                    {(candidate?.skills || draft.skills).map((s) => (
                      <li key={s} className="text-sm text-foreground/80 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" /> {s}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Sobre */}
        {(editing || candidate?.sobre || draft.sobre) && (
          <Card title="Sobre" owner={isOwner} onEdit={() => setEditing(true)}>
            {editing ? (
              <textarea value={draft.sobre ?? ""} onChange={(e) => set("sobre", e.target.value)} rows={4}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            ) : (
              <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{candidate?.sobre || draft.sobre}</p>
            )}
          </Card>
        )}
      </div>

      {/* Barra salvar (dono, editando) */}
      {isOwner && editing && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
          <div className="max-w-md mx-auto flex gap-2">
            <button type="button" onClick={() => { setEditing(false); void load(); }} className="flex-1 py-3 rounded-xl border bg-card text-sm font-semibold">Cancelar</button>
            <button type="button" onClick={handleSaveAll} disabled={saving} className="flex-[2] py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar alterações
            </button>
          </div>
        </div>
      )}

      {/* Modal CHAMAR */}
      {chamarOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 px-4 py-6" onClick={() => setChamarOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-foreground">Chamar {name.split(" ")[0]}</h3>
              <button onClick={() => setChamarOpen(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Escreva sua proposta. A pessoa será notificada (app e push).</p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
              placeholder="Ex.: Olá! Tenho uma oportunidade que pode te interessar. Podemos conversar?"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none mb-3" />
            <button type="button" onClick={handleSend} disabled={sending}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{sending ? "Enviando..." : "Enviar proposta"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function Card({ title, owner, onEdit, children }: { title: string; owner: boolean; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {owner && <button type="button" onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>}
      </div>
      {children}
    </div>
  );
}

function SectionRow({ title, owner, onEdit, inline, children }: { title: string; owner: boolean; onEdit: () => void; inline?: boolean; children?: React.ReactNode }) {
  return (
    <div className={inline ? "flex items-center gap-2 my-3" : "my-3"}>
      {title && <h2 className="text-lg font-bold text-foreground">{title}</h2>}
      {owner && title && <button type="button" onClick={onEdit} className="p-1 rounded-lg hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>}
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default ResumeProfileView;
