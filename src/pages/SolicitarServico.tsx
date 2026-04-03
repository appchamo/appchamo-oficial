import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
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

const SolicitarServico = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [categoryId, setCategoryId] = useState<string>("");
  const [description, setDescription] = useState("");
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

  useEffect(() => {
    if (!profile) return;
    setNeighborhood((profile.address_neighborhood || "").trim());
    setCity((profile.address_city || "").trim());
    setStateUf((profile.address_state || "").trim().toUpperCase().slice(0, 2));
  }, [profile?.address_neighborhood, profile?.address_city, profile?.address_state]);

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
    const c = city.trim();
    const st = stateUf.trim().toUpperCase().slice(0, 2);
    if (!c || st.length !== 2) {
      toast({
        title: "Localização incompleta",
        description: "Informe cidade e UF (2 letras).",
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
      description: "Profissionais da sua região podem manifestar interesse em breve.",
    });
    navigate("/client/pedidos-abertos");
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
            <Label>Localização</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="neighborhood" className="text-xs font-normal text-muted-foreground">
                  Bairro (opcional)
                </Label>
                <Input
                  id="neighborhood"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Centro, Jardins…"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city" className="text-xs font-normal text-muted-foreground">
                  Cidade
                </Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="São Paulo"
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="uf" className="text-xs font-normal text-muted-foreground">
                  UF
                </Label>
                <Input
                  id="uf"
                  value={stateUf}
                  onChange={(e) => setStateUf(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                  placeholder="SP"
                  maxLength={2}
                  className="uppercase max-w-[88px]"
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Profissionais com perfil na mesma UF verão seu pedido.{" "}
              <Link to="/profile/settings/endereco" className="text-primary font-medium underline-offset-2 hover:underline">
                Ajustar endereço no perfil
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
