import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { fetchViaCep } from "@/lib/viacep";
import { forwardGeocodeBrazil } from "@/lib/geocode";

const ProfileSettingsAddress = () => {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setLoading(false);
        return;
      }
      setZip(data.address_zip || "");
      setStreet(data.address_street || "");
      setNumber(data.address_number || "");
      setComplement(data.address_complement || "");
      setNeighborhood(data.address_neighborhood || "");
      setCity(data.address_city || "");
      setState(data.address_state || "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleCepBlur = async () => {
    const raw = zip.replace(/\D/g, "");
    if (raw.length !== 8) return;
    setCepLoading(true);
    const v = await fetchViaCep(zip);
    setCepLoading(false);
    if (!v) {
      toast({ title: "CEP não encontrado", variant: "destructive" });
      return;
    }
    if (v.logradouro) setStreet(v.logradouro);
    if (v.bairro) setNeighborhood(v.bairro);
    if (v.localidade) setCity(v.localidade);
    if (v.uf) setState(v.uf);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const zipClean = zip.replace(/\D/g, "") || null;
    const payload = {
      address_zip: zipClean,
      address_street: street.trim() || null,
      address_number: number.trim() || null,
      address_complement: complement.trim() || null,
      address_neighborhood: neighborhood.trim() || null,
      address_city: city.trim() || null,
      address_state: state.trim() || null,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("user_id", user.id);
    if (error) {
      toast({ title: "Erro ao salvar endereço", variant: "destructive" });
      setSaving(false);
      return;
    }

    if (city.trim() && state.trim()) {
      const geo = await forwardGeocodeBrazil(`${city.trim()}, ${state.trim()}, Brasil`);
      if (geo) {
        await supabase
          .from("profiles")
          .update({ latitude: geo.lat, longitude: geo.lon } as any)
          .eq("user_id", user.id);
      }
    }

    await refreshProfile();
    toast({ title: "Endereço salvo!" });
    setSaving(false);
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <Link
          to="/profile/settings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Configurações
        </Link>

        <h1 className="text-xl font-bold text-foreground mb-1">Endereço</h1>
        <p className="text-sm text-muted-foreground mb-6">Usado para busca por proximidade e exibição no perfil.</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-3 max-w-md">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">CEP</label>
              <div className="relative">
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  onBlur={handleCepBlur}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="00000-000"
                />
                {cepLoading ? (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Rua / logradouro</label>
              <input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Número</label>
                <input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Complemento</label>
                <input
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Bairro</label>
              <input
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Cidade</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Estado (UF)</label>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="MG"
                  maxLength={2}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 mt-2"
            >
              {saving ? "Salvando..." : "Salvar endereço"}
            </button>
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default ProfileSettingsAddress;
