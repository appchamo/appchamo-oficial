import { useEffect, useState } from "react";
import { Loader2, Plus, X, Save, User, Inbox } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  fetchMyResume, saveMyResume, fetchReceivedProposals,
  type JobSeekerProfile, type ReceivedProposal,
} from "@/lib/jobSeeker";

const DEFAULTS: Omit<JobSeekerProfile, "user_id"> = {
  is_public: false,
  visible_to_all: false,
  visible_to_companies: true,
  visible_to_pros: true,
  headline: "",
  objetivo: "",
  experiencia: "",
  sobre: "",
  skills: [],
  city: null,
  state: null,
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "agora";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
};

const MyResumeEditor = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<JobSeekerProfile, "user_id">>(DEFAULTS);
  const [skillInput, setSkillInput] = useState("");
  const [proposals, setProposals] = useState<ReceivedProposal[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [row, props] = await Promise.all([fetchMyResume(user.id), fetchReceivedProposals(user.id)]);
      if (cancelled) return;
      if (row) {
        setForm({
          is_public: row.is_public,
          visible_to_all: row.visible_to_all,
          visible_to_companies: row.visible_to_companies,
          visible_to_pros: row.visible_to_pros,
          headline: row.headline ?? "",
          objetivo: row.objetivo ?? "",
          experiencia: row.experiencia ?? "",
          sobre: row.sobre ?? "",
          skills: row.skills ?? [],
          city: row.city,
          state: row.state,
        });
      }
      setProposals(props);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const addSkill = () => {
    const s = skillInput.trim();
    if (!s) return;
    if (!form.skills.includes(s)) set("skills", [...form.skills, s]);
    setSkillInput("");
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await saveMyResume(user.id, {
      ...form,
      // Localização puxada do perfil (usada na busca por proximidade e no card).
      city: profile?.address_city ?? form.city ?? null,
      state: profile?.address_state ?? form.state ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar currículo", description: error, variant: "destructive" });
      return;
    }
    toast({ title: form.is_public ? "Currículo publicado!" : "Currículo salvo (oculto)" });
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-xl font-bold text-foreground mb-1">Meu currículo</h1>
      <p className="text-sm text-muted-foreground mb-5">Monte seu perfil pra empresas e profissionais te chamarem com propostas.</p>

      {/* Visibilidade */}
      <div className="rounded-2xl border bg-card p-4 space-y-3 mb-4">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-foreground block">Perfil público</span>
            <span className="text-xs text-muted-foreground">Aparecer na lista de currículos e receber propostas.</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.is_public}
            onClick={() => set("is_public", !form.is_public)}
            className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_public ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.is_public ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </label>

        {form.is_public && (
          <div className="pt-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">Quem pode ver seu perfil?</p>
            <div className="flex flex-wrap gap-2">
              {([
                ["visible_to_all", "Todos"],
                ["visible_to_companies", "Empresas"],
                ["visible_to_pros", "Profissionais"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set(key, !form[key])}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    form[key] ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {form.visible_to_all && <p className="text-[11px] text-muted-foreground mt-1.5">Com "Todos" ligado, qualquer usuário vê seu currículo.</p>}
          </div>
        )}
      </div>

      {/* Campos */}
      <div className="rounded-2xl border bg-card p-4 space-y-4">
        <Field label="Frase de apresentação (headline)" value={form.headline ?? ""} onChange={(v) => set("headline", v)} placeholder="Ex.: Auxiliar de cozinha com 5 anos de experiência" />
        <Field label="Objetivo" value={form.objetivo ?? ""} onChange={(v) => set("objetivo", v)} placeholder="Ex.: Comercial, Cozinha, Obra..." />
        <Field label="Experiência" value={form.experiencia ?? ""} onChange={(v) => set("experiencia", v)} textarea placeholder="Conte sua experiência profissional." />
        <Field label="Sobre você" value={form.sobre ?? ""} onChange={(v) => set("sobre", v)} textarea placeholder="Fale um pouco sobre você." />

        {/* Habilidades / serviços */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Serviços / habilidades</label>
          <div className="flex gap-2 mb-2">
            <input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
              placeholder="Ex.: Alvenaria"
              className="flex-1 border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button type="button" onClick={addSkill} className="px-3 rounded-xl bg-primary text-primary-foreground shrink-0"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-xs text-foreground">
                {s}
                <button type="button" onClick={() => set("skills", form.skills.filter((x) => x !== s))}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar currículo"}
        </button>
      </div>

      {/* Propostas recebidas */}
      <div className="rounded-2xl border bg-card p-4 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Quem te chamou</h2>
        </div>
        {proposals.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Ninguém te chamou ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {proposals.map((p) => (
              <div key={p.id} className="flex items-start gap-3 rounded-xl border bg-background p-3">
                {p.from_avatar ? (
                  <img src={p.from_avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-primary" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{p.from_name || "Alguém"}</p>
                  {p.message && <p className="text-xs text-muted-foreground">{p.message}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(p.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function Field({ label, value, onChange, placeholder, textarea }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
        />
      )}
    </div>
  );
}

export default MyResumeEditor;
