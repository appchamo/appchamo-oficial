import { useState, useEffect, useMemo, startTransition } from "react";
import { UserRound, ChevronDown, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ImageCropUpload from "@/components/ImageCropUpload";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  /** Pré-preenche a foto (ex.: avatar já salvo no perfil do cliente). */
  initialAvatarUrl?: string | null;
  /** Chamado após upload bem-sucedido da foto (URL público no storage). */
  onAvatarUploaded?: (publicUrl: string) => void;
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

const StepProfile = ({ accountType, onNext, onBack, onExitToLogin, initialAvatarUrl, onAvatarUploaded }: Props) => {
  const [avatarUrl, setAvatarUrl] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [professionId, setProfessionId] = useState("");
  const [professionPopoverOpen, setProfessionPopoverOpen] = useState(false);
  const [professionQuery, setProfessionQuery] = useState("");
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

  useEffect(() => {
    const u = initialAvatarUrl?.trim();
    if (!u) return;
    setAvatarUrl((prev) => (prev.trim() ? prev : u));
  }, [initialAvatarUrl]);

  useEffect(() => {
    setProfessionQuery("");
    setProfessionPopoverOpen(false);
  }, [categoryId]);

  const filteredProfessions = useMemo(
    () => professions.filter((p) => p.category_id === categoryId),
    [professions, categoryId],
  );

  const professionListVisible = useMemo(() => {
    const q = professionQuery.trim().toLowerCase();
    if (!q) return filteredProfessions.slice(0, 48);
    return filteredProfessions.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 80);
  }, [filteredProfessions, professionQuery]);

  const selectedProfessionLabel = useMemo(
    () => filteredProfessions.find((p) => p.id === professionId)?.name ?? "",
    [filteredProfessions, professionId],
  );

  const [avatarError, setAvatarError] = useState(false);
  const [categoryFieldError, setCategoryFieldError] = useState(false);

  const handleNext = () => {
    // Foto obrigatória só para profissional; cliente pode concluir sem foto.
    if (accountType === "professional" && !avatarUrl) {
      setAvatarError(true);
      toast({
        title: "Foto de perfil obrigatória",
        description: "Toque na foto de perfil, escolha galeria ou câmera e confirme o recorte.",
        variant: "destructive",
      });
      requestAnimationFrame(() => {
        document.getElementById("signup-field-profile-avatar")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setAvatarError(false);
    if (accountType === "professional" && !categoryId) {
      setCategoryFieldError(true);
      toast({ title: "Selecione sua categoria / área.", variant: "destructive" });
      requestAnimationFrame(() => {
        document.getElementById("signup-field-profile-category")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setCategoryFieldError(false);
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
          <div id="signup-field-profile-avatar" className="flex flex-col items-center gap-3">
            <div
              className={cn(
                "relative w-28 h-28 shrink-0 rounded-full overflow-hidden border-2 transition-colors",
                avatarError && "border-destructive ring-2 ring-destructive/30",
                !avatarError && avatarUrl && "border-primary/25 ring-2 ring-primary/10",
                !avatarError && !avatarUrl && "border-border bg-gradient-to-b from-muted/80 to-muted/40",
              )}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <UserRound className="h-12 w-12 text-muted-foreground/45" strokeWidth={1.25} />
                </div>
              )}
              <ImageCropUpload
                onUpload={(url) => {
                  setAvatarUrl(url);
                  setAvatarError(false);
                  onAvatarUploaded?.(url);
                }}
                aspect={1}
                shape="round"
                bucketPath="avatars"
                label=""
                maxSize={336}
                quality={0.7}
                signupAvatarMode
                signupTrigger={
                  <button
                    type="button"
                    className={cn(
                      "absolute z-10 flex items-center justify-center rounded-full touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      avatarUrl
                        ? "bottom-0 right-0 mb-0.5 mr-0.5 h-10 w-10 bg-primary text-primary-foreground shadow-md border-2 border-background"
                        : "inset-0 bg-transparent",
                    )}
                    aria-label={avatarUrl ? "Alterar foto de perfil" : "Adicionar foto de perfil"}
                  >
                    {!avatarUrl ? (
                      <span className="pointer-events-none flex h-[46px] w-[46px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/35">
                        <Upload className="h-[22px] w-[22px]" strokeWidth={2.5} />
                      </span>
                    ) : (
                      <Upload className="h-[18px] w-[18px]" strokeWidth={2.5} />
                    )}
                  </button>
                }
              />
            </div>
            <p className={`text-xs text-center max-w-[16rem] ${avatarError ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {avatarError ? "⚠ Foto de perfil obrigatória" : "Adicione uma foto de perfil *"}
            </p>
          </div>

          {accountType === "professional" && (
            <>
              <div id="signup-field-profile-category">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Categoria / Área *</label>
                <div className="relative">
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryFieldError(false);
                      const v = e.target.value;
                      startTransition(() => {
                        setCategoryId(v);
                        setProfessionId("");
                      });
                    }}
                    className={cn(
                      "w-full border rounded-xl px-3 py-2.5 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 appearance-none transition-colors",
                      categoryFieldError && "border-destructive border-2 ring-2 ring-destructive/25",
                    )}
                  >
                    <option value="">Selecione sua área</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
                {categoryFieldError ? (
                  <p className="text-xs text-destructive font-medium mt-1.5">Selecione sua categoria ou área de atuação.</p>
                ) : null}
              </div>

              {categoryId && filteredProfessions.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Profissão</label>
                  <Popover open={professionPopoverOpen} onOpenChange={setProfessionPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full border rounded-xl px-3 py-2.5 text-sm bg-transparent text-left outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between gap-2 touch-manipulation"
                      >
                        <span className={selectedProfessionLabel ? "text-foreground truncate" : "text-muted-foreground truncate"}>
                          {selectedProfessionLabel || "Toque para buscar ou escolher"}
                        </span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[min(calc(100vw-2rem),22rem)] p-2"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <input
                        type="search"
                        autoComplete="off"
                        value={professionQuery}
                        onChange={(e) => setProfessionQuery(e.target.value)}
                        placeholder="Digite para filtrar…"
                        className="w-full border rounded-lg px-2 py-2 text-sm bg-background mb-2 outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <div className="max-h-56 overflow-y-auto overscroll-contain -mx-0.5">
                        {professionListVisible.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setProfessionId(p.id);
                              setProfessionPopoverOpen(false);
                              setProfessionQuery("");
                            }}
                            className={cn(
                              "w-full text-left px-2 py-2.5 text-sm rounded-lg hover:bg-muted transition-colors",
                              professionId === p.id && "bg-muted font-medium",
                            )}
                          >
                            {p.name}
                          </button>
                        ))}
                        {professionListVisible.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-2 py-2">Nenhuma profissão encontrada.</p>
                        ) : null}
                      </div>
                    </PopoverContent>
                  </Popover>
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
