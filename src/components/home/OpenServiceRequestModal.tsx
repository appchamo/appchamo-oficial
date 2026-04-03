import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { fetchViaCep } from "@/lib/viacep";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, MapPin, Radio, Sparkles } from "lucide-react";

type CategoryRow = { id: string; name: string };
type Urgency = "now" | "today" | "flexible";

const URGENCY_OPTIONS: { value: Urgency; label: string; hint: string }[] = [
  { value: "now", label: "Agora", hint: "O mais rápido possível" },
  { value: "today", label: "Hoje", hint: "Ainda hoje, horário a combinar" },
  { value: "flexible", label: "Flexível", hint: "Nos próximos dias" },
];

const STEPS = [
  { n: 1, label: "Categoria do serviço" },
  { n: 2, label: "O que você precisa" },
  { n: 3, label: "Onde e com que urgência" },
] as const;

function maskCepInput(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

type OpenServiceRequestModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const OpenServiceRequestModal = ({ open, onOpenChange }: OpenServiceRequestModalProps) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [zip, setZip] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [locationOk, setLocationOk] = useState(false);
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("flexible");

  const resetForm = useCallback(() => {
    setStep(1);
    setCategoryId("");
    setDescription("");
    setZip("");
    setLocationOk(false);
    setNeighborhood("");
    setCity("");
    setStateUf("");
    setUrgency("flexible");
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
    if (profile?.address_zip) {
      const digits = profile.address_zip.replace(/\D/g, "");
      if (digits.length === 8) setZip(maskCepInput(digits));
    }
  }, [open, profile?.address_zip, resetForm]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingCats(true);
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (error) setCategories([]);
      else setCategories((data as CategoryRow[]) || []);
      setLoadingCats(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const applyViaCep = useCallback(async (cepRaw: string, opts?: { silent?: boolean }) => {
    const digits = cepRaw.replace(/\D/g, "");
    if (digits.length !== 8) {
      setLocationOk(false);
      return;
    }
    setCepLoading(true);
    const v = await fetchViaCep(cepRaw);
    setCepLoading(false);
    if (!v?.localidade || !v?.uf) {
      setLocationOk(false);
      setCity("");
      setStateUf("");
      if (!opts?.silent) {
        toast({ title: "CEP não encontrado", description: "Confira os números e tente de novo.", variant: "destructive" });
      }
      return;
    }
    setCity(v.localidade.trim());
    setStateUf(v.uf.trim().toUpperCase().slice(0, 2));
    if (v.bairro?.trim()) {
      setNeighborhood((prev) => (prev.trim() ? prev : v.bairro!.trim()));
    }
    setLocationOk(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const digits = zip.replace(/\D/g, "");
    if (digits.length !== 8) return;
    const t = setTimeout(() => void applyViaCep(digits, { silent: true }), 450);
    return () => clearTimeout(t);
  }, [zip, applyViaCep, open]);

  const selectedCategoryName = categories.find((c) => c.id === categoryId)?.name ?? "";

  const handleZipBlur = () => {
    const digits = zip.replace(/\D/g, "");
    if (digits.length === 8) void applyViaCep(digits, { silent: false });
    else if (digits.length > 0) {
      setLocationOk(false);
      setCity("");
      setStateUf("");
    }
  };

  const goNext = () => {
    if (step === 1) {
      if (!user) {
        navigate("/login", { state: { from: "/solicitar-servico" } });
        onOpenChange(false);
        return;
      }
      if (!categoryId) {
        toast({ title: "Escolha uma categoria", variant: "destructive" });
        return;
      }
    }
    if (step === 2) {
      if (description.trim().length < 3) {
        toast({ title: "Descreva melhor o serviço", description: "Use pelo menos 3 caracteres.", variant: "destructive" });
        return;
      }
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleSubmit = async () => {
    if (!user) return;
    const cepDigits = zip.replace(/\D/g, "");
    if (cepDigits.length !== 8 || !locationOk) {
      toast({
        title: "CEP inválido",
        description: "Digite o CEP com 8 dígitos e aguarde a busca da cidade.",
        variant: "destructive",
      });
      return;
    }
    const c = city.trim();
    const st = stateUf.trim().toUpperCase().slice(0, 2);
    if (!c || st.length !== 2) {
      toast({ title: "Localização incompleta", description: "Busque o CEP novamente.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("open_service_requests").insert({
      client_id: user.id,
      category_id: categoryId,
      description: description.trim(),
      neighborhood: neighborhood.trim() || null,
      city: c,
      state: st,
      urgency,
      status: "open",
      max_professional_interests: 5,
    });
    setSubmitting(false);

    if (error) {
      toast({ title: "Não foi possível enviar", description: error.message || "Tente novamente.", variant: "destructive" });
      return;
    }

    try {
      window.dispatchEvent(new CustomEvent("chamo-open-requests-changed"));
    } catch {
      /* ignore */
    }

    toast({
      title: "Pedido publicado!",
      description: "Profissionais da categoria na mesma UF foram notificados.",
    });
    onOpenChange(false);
    navigate("/client/pedidos-abertos");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[min(calc(100vw-1.25rem),26rem)] sm:max-w-md max-h-[min(92vh,640px)] p-0 gap-0 overflow-hidden rounded-3xl border-2 border-primary/30 shadow-xl shadow-primary/10",
          "bg-gradient-to-b from-amber-50/90 via-background to-background dark:from-primary/10 dark:via-background",
        )}
      >
        <div className="h-1 w-full bg-gradient-to-r from-primary via-amber-400 to-primary shrink-0" aria-hidden />

        <DialogHeader className="px-5 pt-5 pb-3 space-y-3 text-left border-b border-primary/10">
          <div className="flex items-center gap-3 pr-8">
            <div className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center shadow-md shadow-primary/25 shrink-0">
              <Radio className="w-5 h-5 text-primary-foreground" aria-hidden />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground leading-tight">
                Solicitar serviço
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Até 5 profissionais podem manifestar interesse na sua região
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="h-2 rounded-full bg-primary/10 overflow-hidden ring-1 ring-primary/10">
              <div
                className="h-full bg-gradient-to-r from-primary to-amber-500 rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
            <p className="text-xs font-bold text-center text-foreground">
              <span className="text-primary">Etapa {step} de 3</span>
              <span className="text-muted-foreground font-medium"> · {STEPS[step - 1].label}</span>
            </p>
          </div>
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0 max-h-[min(52vh,420px)]">
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="w-4 h-4 shrink-0" />
                <p className="text-sm font-semibold text-foreground">Qual tipo de serviço você precisa?</p>
              </div>
              {loadingCats ? (
                <div className="flex justify-center py-12 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-[min(38vh,300px)] overflow-y-auto pr-1 -mr-1">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={cn(
                        "rounded-2xl border-2 px-3 py-3 text-left text-sm font-semibold transition-all active:scale-[0.98]",
                        categoryId === c.id
                          ? "border-primary bg-primary/10 text-primary shadow-sm ring-2 ring-primary/15"
                          : "border-border/80 bg-card hover:border-primary/35 hover:bg-primary/5 text-foreground",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {categories.length === 0 && !loadingCats && (
                <p className="text-xs text-center text-muted-foreground py-4">Nenhuma categoria disponível.</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
              <p className="text-sm font-semibold text-foreground">
                Conte o que precisa{selectedCategoryName ? ` — ${selectedCategoryName}` : ""}
              </p>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Troca de tomadas na sala; preciso de orçamento com material."
                className="min-h-[140px] rounded-2xl border-primary/20 resize-none text-[15px] leading-relaxed"
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground text-right">{description.length}/2000</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground">CEP do serviço</Label>
                <div className="relative max-w-[11rem]">
                  <Input
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={zip}
                    onChange={(e) => {
                      setZip(maskCepInput(e.target.value));
                      setLocationOk(false);
                    }}
                    onBlur={handleZipBlur}
                    placeholder="00000-000"
                    maxLength={9}
                    className="rounded-xl border-primary/25 text-base tracking-wide"
                  />
                  {cepLoading ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
                  ) : null}
                </div>
                {locationOk && city && stateUf ? (
                  <div className="flex items-start gap-2 rounded-2xl border-2 border-primary/25 bg-primary/5 px-3 py-2.5">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">{city}</p>
                      <p className="text-xs text-muted-foreground">UF {stateUf}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Digite 8 dígitos — cidade e UF são preenchidos automaticamente.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bairro (opcional)</Label>
                <Input
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Ajuste se quiser"
                  maxLength={120}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground">Urgência</Label>
                <RadioGroup value={urgency} onValueChange={(v) => setUrgency(v as Urgency)} className="grid gap-2">
                  {URGENCY_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border-2 p-3 cursor-pointer transition-all",
                        urgency === opt.value
                          ? "border-primary bg-primary/8 shadow-sm"
                          : "border-border hover:border-primary/30",
                      )}
                    >
                      <RadioGroupItem value={opt.value} id={`m-urgency-${opt.value}`} className="mt-0.5" />
                      <div className="min-w-0">
                        <span className="font-semibold text-sm">{opt.label}</span>
                        <p className="text-xs text-muted-foreground">{opt.hint}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Profissionais da mesma categoria e UF do CEP recebem notificação.{" "}
                <Link to="/profile/settings/endereco" className="text-primary font-medium underline-offset-2 hover:underline">
                  Endereço no perfil
                </Link>
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-primary/10 bg-background/95 backdrop-blur-sm flex gap-2 shrink-0">
          {step > 1 ? (
            <Button type="button" variant="outline" className="rounded-xl font-semibold border-primary/30" onClick={goBack}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="rounded-xl text-muted-foreground" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <Button type="button" className="rounded-xl font-bold px-6 shadow-md shadow-primary/20" onClick={goNext}>
              Continuar
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-xl font-bold px-6 shadow-md shadow-primary/20 min-w-[8.5rem]"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Publicar pedido"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OpenServiceRequestModal;
