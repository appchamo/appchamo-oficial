import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Loader2, User, MapPin, Send, Share2, X, Pencil, UserPlus, UserCheck, Plus, Check, Inbox, CornerUpLeft,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  fetchCandidate, saveMyResume, startDirectChat, isFollowingUser, setFollowUser, fetchReceivedProposals,
  type CandidateCard, type JobSeekerProfile, type ReceivedProposal,
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
  const [original, setOriginal] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [chamarOpen, setChamarOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [proposals, setProposals] = useState<ReceivedProposal[]>([]);
  const [replyTo, setReplyTo] = useState<ReceivedProposal | null>(null);
  const [replyMsg, setReplyMsg] = useState("");
  const [replying, setReplying] = useState(false);

  const load = async () => {
    setLoading(true);
    const c = await fetchCandidate(targetUserId);
    setCandidate(c);
    const d: Draft = c ? {
      is_public: c.is_public, visible_to_all: c.visible_to_all,
      visible_to_companies: c.visible_to_companies, visible_to_pros: c.visible_to_pros,
      headline: c.headline ?? "", objetivo: c.objetivo ?? "", experiencia: c.experiencia ?? "",
      sobre: c.sobre ?? "", skills: c.skills ?? [], city: c.city, state: c.state,
    } : emptyDraft();
    setDraft(d);
    setOriginal(d);
    if (!isOwner && user) setFollowing(await isFollowingUser(user.id, targetUserId));
    if (isOwner && user) setProposals(await fetchReceivedProposals(user.id));
    setLoading(false);
  };

  const handleReply = async () => {
    if (!user || !replyTo || replying) return;
    setReplying(true);
    const { threadId, error } = await startDirectChat(user.id, replyTo.from_user, replyMsg);
    setReplying(false);
    if (error || !threadId) { toast({ title: "Não foi possível responder", description: error ?? "", variant: "destructive" }); return; }
    setReplyTo(null); setReplyMsg("");
    navigate(`/messages/${threadId}`);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [targetUserId]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const showSaveBar = isOwner && (editing || dirty);

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
    toast({ title: draft.is_public ? "Currículo salvo e publicado!" : "Currículo salvo (oculto)" });
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

  const handleChamar = () => {
    if (isOwner) { toast({ title: "Esse é o seu perfil", description: "É assim que as pessoas te veem." }); return; }
    setChamarOpen(true);
  };

  const handleSend = async () => {
    if (!user || sending) return;
    setSending(true);
    const { threadId, error } = await startDirectChat(user.id, targetUserId, message);
    setSending(false);
    if (error || !threadId) { toast({ title: "Não foi possível abrir a conversa", description: error ?? "", variant: "destructive" }); return; }
    setChamarOpen(false); setMessage("");
    navigate(`/messages/${threadId}`);
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
  const startEdit = () => setEditing(true);

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
  const avatar = candidate?.avatar_url || (isOwner ? profile?.avatar_url : null) || null;
  const cityLabel = [candidate?.city ?? (isOwner ? profile?.address_city : null), candidate?.state ?? (isOwner ? profile?.address_state : null)].filter(Boolean).join(", ");
  const objetivo = candidate?.objetivo ?? draft.objetivo;
  const experiencia = candidate?.experiencia ?? draft.experiencia;
  const sobre = candidate?.sobre ?? draft.sobre;
  const skills = (candidate?.skills ?? draft.skills) || [];
  const headline = candidate?.headline ?? draft.headline;
  const hasCard = editing || !!(experiencia || skills.length || sobre);

  return (
    <div className="max-w-md mx-auto pb-28">
      {/* Cabeçalho cinza com degradê e base ondulada */}
      <div className="-mx-4 bg-gradient-to-b from-zinc-300 via-zinc-200 to-zinc-100 px-4 pt-3 pb-12 rounded-b-[44px]">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-base font-bold text-foreground">
            <ArrowLeft className="w-5 h-5" /> Voltar
          </button>
          <span className="text-base text-muted-foreground">{isOwner ? "Meu perfil" : "Currículo"}</span>
          {isOwner
            ? <button type="button" onClick={() => setEditing((e) => !e)} className="p-1"><Pencil className="w-5 h-5 text-muted-foreground" /></button>
            : <span className="w-7" />}
        </div>
      </div>

      {/* Avatar + visibilidade (dono) */}
      <div className="flex gap-3 items-start">
        {avatar ? (
          <img src={avatar} alt="" className="w-20 h-20 rounded-full object-cover border-[3px] border-primary bg-card shrink-0 -mt-11" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-[3px] border-primary shrink-0 -mt-11"><User className="w-9 h-9 text-primary" /></div>
        )}
        {isOwner && (
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">Perfil Público</span>
              <div className="inline-flex rounded-full bg-muted p-0.5">
                <button type="button" onClick={() => set("is_public", true)} className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${draft.is_public ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Sim</button>
                <button type="button" onClick={() => set("is_public", false)} className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${!draft.is_public ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Não</button>
              </div>
            </div>
            <p className="text-sm font-bold text-foreground mt-1.5">Quem pode ver seu perfil?</p>
            <div className="flex items-center gap-2 mt-1">
              {([["visible_to_all", "Todos"], ["visible_to_companies", "Empresas"], ["visible_to_pros", "Profissionais"]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => set(k, !draft[k])} className="inline-flex items-center gap-1">
                  <span className={`w-4 h-4 rounded flex items-center justify-center border ${draft[k] ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                    {draft[k] && <Check className="w-3 h-3 text-primary-foreground" />}
                  </span>
                  <span className="text-[11px] text-foreground">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Aviso: a foto vem da conta */}
      {isOwner && (
        <button type="button" onClick={() => navigate("/profile")} className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <User className="w-3 h-3" /> A foto é a mesma da sua conta. Toque para alterar em Perfil.
        </button>
      )}

      {/* Nome + localização */}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <h1 className="text-2xl font-extrabold text-foreground leading-tight">{name}</h1>
        {cityLabel && <span className="text-sm text-primary flex items-center gap-0.5"><MapPin className="w-4 h-4" /> {cityLabel}</span>}
      </div>

      {/* Headline */}
      {editing ? (
        <textarea value={draft.headline ?? ""} onChange={(e) => set("headline", e.target.value)} rows={3} placeholder="Frase de apresentação"
          className="w-full mt-2 border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
      ) : headline ? (
        <p className="text-sm text-foreground/70 mt-1.5 leading-relaxed">{headline}</p>
      ) : null}

      {/* Ações: CHAMAR · Seguir · Compartilhar */}
      <div className="flex items-stretch gap-2 my-4">
        <button type="button" onClick={handleChamar}
          className="flex-1 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all">CHAMAR</button>
        <button type="button" onClick={isOwner ? undefined : handleFollow} disabled={followBusy}
          className={`w-20 rounded-xl border-2 text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5 transition-colors ${following ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground"}`}>
          {followBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : following ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {following ? "Seguindo" : "Seguir"}
        </button>
        <button type="button" onClick={handleShare}
          className="w-24 rounded-xl border-2 border-border text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5 text-foreground">
          <Share2 className="w-4 h-4" /> Compartilhar
        </button>
      </div>

      {/* Objetivo */}
      {editing ? (
        <div className="mb-3">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Objetivo</label>
          <input value={draft.objetivo ?? ""} onChange={(e) => set("objetivo", e.target.value)} placeholder="Ex.: Comercial"
            className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      ) : objetivo ? (
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xl font-bold text-foreground">Objetivo: {objetivo}</h2>
          {isOwner && <button type="button" onClick={startEdit} className="p-1"><Pencil className="w-4 h-4 text-muted-foreground" /></button>}
        </div>
      ) : isOwner ? (
        <button type="button" onClick={startEdit} className="mb-3 inline-flex items-center gap-1.5 text-sm text-primary font-medium"><Pencil className="w-4 h-4" /> Adicionar objetivo e experiência</button>
      ) : null}

      {/* Card: Experiência · Serviços · Sobre */}
      {hasCard && (
        <div className="rounded-2xl border bg-card p-5 space-y-5">
          {/* Experiência */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-foreground">Experiência</h3>
              {isOwner && !editing && <button type="button" onClick={startEdit} className="p-1"><Pencil className="w-4 h-4 text-muted-foreground" /></button>}
            </div>
            {editing ? (
              <textarea value={draft.experiencia ?? ""} onChange={(e) => set("experiencia", e.target.value)} rows={3} placeholder="Conte sua experiência"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            ) : experiencia ? (
              <p className="text-sm text-foreground/70 whitespace-pre-wrap leading-relaxed">{experiencia}</p>
            ) : <p className="text-sm text-muted-foreground/60">—</p>}
          </div>

          {/* Serviços */}
          <div>
            <h3 className="text-lg font-bold text-foreground mb-2">Serviços</h3>
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
            ) : skills.length ? (
              <ul className="space-y-1.5">
                {skills.map((s) => (
                  <li key={s} className="text-sm text-foreground/70 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" /> {s}</li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground/60">—</p>}
          </div>

          {/* Sobre */}
          <div>
            <h3 className="text-lg font-bold text-foreground mb-2">Sobre</h3>
            {editing ? (
              <textarea value={draft.sobre ?? ""} onChange={(e) => set("sobre", e.target.value)} rows={4} placeholder="Fale sobre você"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            ) : sobre ? (
              <p className="text-sm text-foreground/70 whitespace-pre-wrap leading-relaxed">{sobre}</p>
            ) : <p className="text-sm text-muted-foreground/60">—</p>}
          </div>
        </div>
      )}

      {/* Quem te chamou (propostas recebidas) — dono */}
      {isOwner && (
        <div className="rounded-2xl border bg-card p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <Inbox className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Quem te chamou</h3>
          </div>
          {proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">Ninguém te chamou ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {proposals.map((p) => (
                <div key={p.id} className="flex items-start gap-3 rounded-xl border bg-background p-3">
                  {p.from_avatar ? (
                    <img src={p.from_avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User className="w-5 h-5 text-primary" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => navigate(`/curriculos/${p.from_user}`)} className="text-sm font-semibold text-foreground truncate block text-left">{p.from_name || "Alguém"}</button>
                    {p.message && <p className="text-sm text-foreground/70 mt-0.5">{p.message}</p>}
                    <button type="button" onClick={() => { setReplyTo(p); setReplyMsg(""); }} className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-primary">
                      <CornerUpLeft className="w-3.5 h-3.5" /> Responder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barra salvar (no fluxo, sempre acessível ao rolar) */}
      {showSaveBar && (
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={() => { setDraft(original); setEditing(false); }} className="flex-1 py-3 rounded-xl border bg-card text-sm font-semibold">Cancelar</button>
          <button type="button" onClick={handleSaveAll} disabled={saving} className="flex-[2] py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar alterações
          </button>
        </div>
      )}

      {/* Modal RESPONDER */}
      {replyTo && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4 py-6" onClick={() => setReplyTo(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-foreground">Responder {(replyTo.from_name || "").split(" ")[0]}</h3>
              <button onClick={() => setReplyTo(null)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            {replyTo.message && <p className="text-xs text-muted-foreground mb-3 rounded-lg bg-muted/50 px-3 py-2">"{replyTo.message}"</p>}
            <textarea value={replyMsg} onChange={(e) => setReplyMsg(e.target.value)} rows={3} placeholder="Escreva sua resposta..."
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none mb-3" />
            <button type="button" onClick={handleReply} disabled={replying}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {replying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{replying ? "Enviando..." : "Enviar resposta"}
            </button>
          </div>
        </div>
      )}

      {/* Modal CHAMAR */}
      {chamarOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4 py-6" onClick={() => setChamarOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-foreground">Chamar {name.split(" ")[0]}</h3>
              <button onClick={() => setChamarOpen(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Escreva sua proposta. A pessoa será notificada (app e push).</p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
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

export default ResumeProfileView;
