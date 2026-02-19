import { useState, useEffect } from "react";
import { Camera, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ImageCropUpload from "@/components/ImageCropUpload";

interface Props {
  accountType: "client" | "professional";
  onNext: (data: { avatarUrl: string; categoryId?: string; professionId?: string; bio?: string; services?: string }) => void;
  onBack: () => void;
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

const StepProfile = ({ accountType, onNext, onBack }: Props) => {
  const [avatarUrl, setAvatarUrl] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [professionId, setProfessionId] = useState("");
  const [bio, setBio] = useState("");
  const [services, setServices] = useState("");

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
      return;
    }
    setAvatarError(false);
    if (accountType === "professional" && !categoryId) return;
    onNext({
      avatarUrl,
      categoryId: accountType === "professional" ? categoryId : undefined,
      professionId: accountType === "professional" && professionId ? professionId : undefined,
      bio: accountType === "professional" ? bio : undefined,
      services: accountType === "professional" ? services : undefined,
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
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Biografia</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Conte um pouco sobre você e sua experiência..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Serviços prestados (opcional)</label>
                <textarea value={services} onChange={(e) => setServices(e.target.value)} rows={2} placeholder="Ex: Pintura, Elétrica, Hidráulica..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onBack}
              className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
              Voltar
            </button>
            <button onClick={handleNext}
              disabled={(accountType === "professional" && !categoryId) || !avatarUrl}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              Finalizar ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepProfile;
