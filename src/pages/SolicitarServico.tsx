import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { fetchViaCep } from "@/lib/viacep";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CategoryRow = { id: string; name: string };
type Urgency = "now" | "today" | "flexible";

const URGENCY_OPTIONS: { value: Urgency; label: string; hint: string }[] = [
  { value: "now", label: "Agora", hint: "Preciso o mais rápido possível" },
  { value: "today", label: "Hoje", hint: "Ainda hoje, horário a combinar" },
  { value: "flexible", label: "Flexível", hint: "Nos próximos dias" },
];

function maskCepInput(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

const SolicitarServico = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [categoryId, setCategoryId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [zip, setZip] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [locationOk, setLocationOk] = useState(false);
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("flexible");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCats(true);
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (error) {
        setCategories([]);
        setLoadingCats(false);
        return;
      }
      setCategories((data as CategoryRow[]) || []);
      setLoadingCats(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!profile?.address_zip) return;
    const digits = profile.address_zip.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setZip(maskCepInput(digits));
  }, [profile?.address_zip]);

  useEffect(() => {
    const digits = zip.replace(/\D/g, "");
    if (digits.length !== 8) return;
    const t = setTimeout(() => {
      void applyViaCep(digits, { silent: true });
    }, 450);
    return () => clearTimeout(t);
  }, [zip, applyViaCep]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate("/login", { state: { from: "/solicitar-servico" } });
      return;
    }
    if (!categoryId) {
      toast({ title: "Escolha uma categoria", variant: "destructive" });
      return;
    }
    const desc = description.trim();
    if (desc.length < 3) {
      toast({ title: "Descreva melhor o serviço", description: "Use pelo menos 3 caracteres.", variant: "destructive" });
      return;
    }
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
      toast({
        title: "Localização incompleta",
        description: "Busque o CEP novamente para preencher cidade e UF.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("open_service_requests").insert({
      client_id: user.id,
      category_id: categoryId,
      description: desc,
      neighborhood: neighborhood.trim() || null,
      city: c,
      state: st,
      urgency,
      status: "open",
      max_professional_interests: 5,
    });
    setSubmitting(false);

    if (error) {
      toast({
        title: "Não foi possível enviar",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
      return;
    }

    try {
      window.dispatchEvent(new CustomEvent("chamo-open-requests-changed"));
    } catch {
      /* ignore */
    }

    toast({
      title: "Pedido publicado!",
      description:
        "Profissionais da categoria na mesma UF foram notificados e podem manifestar interesse.",
    });
    navigate("/client/pedidos-abertos");
  };

  const handleZipBlur = () => {
    const digits = zip.replace(/\D/g, "");
    if (digits.length === 8) void applyViaCep(digits, { silent: false });
    else if (digits.length > 0) {
      setLocationOk(false);
      setCity("");
      setStateUf("");
    }
  };

  return (
    <AppLayout>
      <div className="max-w-screen-lg mx-auto px-4 py-4 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-border hover:bg-muted transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Pedido aberto</h1>
            <p className="text-sm text-muted-foreground">Descreva o que precisa — até 5 profissionais podem demonstrar interesse</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="space-y-2">
            <Label htmlFor="category">Categoria</Label>
            {loadingCats ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando categorias…
              </div>
            ) : (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue placeholder="Selecione (ex.: eletricista, diarista…)" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(60vh,320px)]">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Troca de tomadas na sala; preciso de orçamento com material."
              className="min-h-[120px] resize-y"
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">{description.length}/2000</p>
          </div>

          <div className="space-y-3">
            <Label>Local do serviço (CEP)</Label>
            <div className="space-y-1.5">
              <Label htmlFor="cep" className="text-xs font-normal text-muted-foreground">
                CEP
              </Label>
              <div className="relative max-w-[200px]">
                <Input
                  id="cep"
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
                />
                {cepLoading ? (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            </div>
            {locationOk && city && stateUf ? (
              <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-semibold text-foreground">{city}</p>
                  <p className="text-xs text-muted-foreground">UF {stateUf} · confirmado pelo CEP</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ao sair do campo (ou ao terminar 8 dígitos), buscamos cidade e UF automaticamente.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="neighborhood" className="text-xs font-normal text-muted-foreground">
                Bairro (opcional — preenchido pelo CEP se disponível)
              </Label>
              <Input
                id="neighborhood"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Ajuste o bairro se quiser"
                maxLength={120}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Profissionais da <strong className="text-foreground font-medium">categoria escolhida</strong>, ativos e com
              UF igual à do CEP no perfil, recebem notificação e veem o pedido em Pedidos na região.{" "}
              <Link to="/profile/settings/endereco" className="text-primary font-medium underline-offset-2 hover:underline">
                Seu CEP no perfil
              </Link>
            </p>
          </div>

          <div className="space-y-3">
            <Label>Urgência</Label>
            <RadioGroup value={urgency} onValueChange={(v) => setUrgency(v as Urgency)} className="grid gap-3">
              {URGENCY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer transition-colors ${
                    urgency === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <RadioGroupItem value={opt.value} id={`urgency-${opt.value}`} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-foreground">{opt.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          <Button type="submit" className="w-full py-6 text-base font-bold" disabled={submitting || loadingCats}>
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Enviando…
              </>
            ) : (
              "Confirmar e publicar pedido"
            )}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
};

export default SolicitarServico;
