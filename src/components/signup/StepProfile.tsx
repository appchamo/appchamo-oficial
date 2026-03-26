import { useState, useEffect } from "react";
import { Camera, ChevronDown, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ImageCropUpload from "@/components/ImageCropUpload";

export interface StepProfileData {
  avatarUrl: string;
  categoryId?: string;
  professionId?: string;
  experience?: string;
  services?: string[];
  bio?: string;
}

interface Props {
  accountType: "client" | "professional";
  onNext: (data: StepProfileData) => void;
  onBack: () => void;
  onExitToLogin?: () => void | Promise<void>;
}

interface Category {
  id: string;
  name: string;
}

interface Profession {
  id: string;
  name: string;
  category_id: string;
}

const StepProfile = ({ accountType, onNext, onBack, onExitToLogin }: Props) => {
  const [avatarUrl, setAvatarUrl] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [professionId, setProfessionId] = useState("");
  const [experience, setExperience] = useState("");
  const [services, setServices] = useState<string[]>([""]);
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (accountType === "professional") {
      supabase.from("categories").select("id, name").eq("active", true).order("sort_order").then(({ data }) => {
        setCategories(data || []);
      });
      supabase.from("professions" as any).select("id, name, category_id").eq("active", true).order("sort_order").then(({ data }) => {
        setProfessions((data as any[]) || []);
      });
    }
  }, [accountType]);

  const filteredProfessions = professions.filter(p => p.category_id === categoryId);

  const [avatarError, setAvatarError] = useState(false);

  const handleNext = () => {
    if (!avatarUrl) {
      setAvatarError(true);
      toast({
        title: "Foto de perfil obrigatória",
        description: "Toque no ícone laranja abaixo da foto, escolha uma imagem e confirme o recorte para enviar.",
        variant: "destructive",
      });
      return;
    }
    setAvatarError(false);
    if (accountType === "professional" && !categoryId) {
      toast({ title: "Selecione sua categoria / área.", variant: "destructive" });
      return;
    }
    const servicesFiltered = accountType === "professional" ? services.filter(s => s.trim()) : undefined;
    onNext({
      avatarUrl,
      categoryId: accountType === "professional" ? categoryId : undefined,
      professionId: accountType === "professional" && professionId ? professionId : undefined,
      experience: accountType === "professional" ? experience.trim() || undefined : undefined,
      services: servicesFiltered?.length ? servicesFiltered : undefined,
      bio: accountType === "professional" ? bio.trim() || undefined : undefined,
    });
  };

  const stepLabel = accountType === "professional" ? "Etapa 3 de 3" : "Etapa 2 de 2";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
          <p className="text-sm text-muted-foreground">{stepLabel} · <strong>Perfil</strong></p>
          <button onClick={onBack} className="text-xs text-primary mt-1 hover:underline">← Voltar</button>
        </div>

        <div className="bg-card border rounded-2xl p-5 shadow-card space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="absolute bottom-0 right-0">
                <ImageCropUpload
                  onUpload={(url) => setAvatarUrl(url)}
                  aspect={1}
                  shape="round"
                  bucketPath="avatars"
                  label=""
                  maxSize={400}
                  quality={0.82}
                />
              </div>
            </div>
            <p className={`text-xs ${avatarError ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {avatarError ? "⚠ Foto de perfil obrigatória" : "Adicione uma foto de perfil *"}
            </p>
          </div>

          {accountType === "professional" && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Categoria / Área *</label>
                <div className="relative">
                  <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setProfessionId(""); }}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 appearance-none">
                    <option value="">Selecione sua área</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {categoryId && filteredProfessions.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Profissão</label>
                  <div className="relative">
                    <select value={professionId} onChange={(e) => setProfessionId(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 appearance-none">
                      <option value="">Selecione sua profissão</option>
                      {filteredProfessions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Experiência</label>
                <textarea value={experience} onChange={(e) => setExperience(e.target.value)} rows={2} placeholder="Ex: Mais de 20 anos no mercado, funilaria e pintura..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Serviços que você oferece</label>
                <p className="text-[11px] text-muted-foreground mb-1.5">Adicione um serviço por linha. Use o botão + para mais.</p>
                <div className="space-y-2">
                  {services.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={s} onChange={(e) => { const v = [...services]; v[i] = e.target.value; setServices(v); }}
                        placeholder={`Serviço ${i + 1}`} className="flex-1 border rounded-xl px-3 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                      <button type="button" onClick={() => { const v = services.filter((_, j) => j !== i); setServices(v.length ? v : [""]); }} className="p-2 rounded-lg border text-muted-foreground hover:bg-muted" aria-label="Remover">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setServices([...services, ""])} className="flex items-center gap-1.5 text-xs text-primary font-medium">
                    <Plus className="w-3.5 h-3.5" /> Adicionar outro serviço
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sobre</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Conte um pouco sobre você..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onBack}
              className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
              Voltar
            </button>
            <button type="button" onClick={handleNext}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
              Finalizar ✓
            </button>
          </div>
        </div>

        {onExitToLogin && (
          <p className="text-center text-xs text-muted-foreground mt-6 pb-4">
            Já tem uma conta?{" "}
            <button
              type="button"
              onClick={() => void onExitToLogin()}
              className="text-primary font-bold hover:underline bg-transparent border-none cursor-pointer p-0"
            >
              Entrar
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default StepProfile;
