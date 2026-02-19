import { useState, useEffect, useCallback } from "react";
import { Mail, Lock, User, Phone, FileText, MapPin, Search, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AccountType = "client" | "professional";

export interface BasicData {
  name: string;
  email: string;
  phone: string;
  document: string;
  documentType: "cpf" | "cnpj";
  password: string;
  birthDate: string;
  addressZip: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressCountry: string;
}

interface Props {
  accountType: AccountType;
  onNext: (data: BasicData) => void;
  onBack: () => void;
}

import { formatCpf, formatCnpj, formatPhone } from "@/lib/formatters";

const InputRow = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
    <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      {children}
    </div>
  </div>
);

const TermsDialogFromAdmin = ({ open, onClose, onAccept }: { open: boolean; onClose: () => void; onAccept: () => void }) => {
  const [termsOfUse, setTermsOfUse] = useState("");
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [loadingTerms, setLoadingTerms] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoadingTerms(true);
    supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["terms_of_use", "privacy_policy"])
      .then(({ data }) => {
        if (data) {
          for (const s of data) {
            const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value).replace(/^"|"$/g, "");
            if (s.key === "terms_of_use") setTermsOfUse(val);
            if (s.key === "privacy_policy") setPrivacyPolicy(val);
          }
        }
        setLoadingTerms(false);
      });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Termos de Uso e Privacidade</DialogTitle></DialogHeader>
        {loadingTerms ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : (
          <div className="text-sm text-muted-foreground space-y-4 leading-relaxed">
            {termsOfUse && (
              <div>
                <h3 className="font-semibold text-foreground mb-2">Termos de Uso</h3>
                <p className="whitespace-pre-wrap">{termsOfUse}</p>
              </div>
            )}
            {privacyPolicy && (
              <div>
                <h3 className="font-semibold text-foreground mb-2">Política de Privacidade (LGPD)</h3>
                <p className="whitespace-pre-wrap">{privacyPolicy}</p>
              </div>
            )}
            {!termsOfUse && !privacyPolicy && (
              <p>Nenhum termo cadastrado ainda.</p>
            )}
          </div>
        )}
        <button onClick={onAccept}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors mt-2">
          Concordo
        </button>
      </DialogContent>
    </Dialog>
  );
};

const StepBasicData = ({ accountType, onNext, onBack }: Props) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [documentType, setDocumentType] = useState<"cpf" | "cnpj">("cpf");
  const [document, setDocument] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressCountry, setAddressCountry] = useState("Brasil");
  const [birthDate, setBirthDate] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [validating, setValidating] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  const isUnderage = (dateStr: string) => {
    if (!dateStr) return false;
    const birth = new Date(dateStr);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age < 18;
  };

  // Auto-fetch CEP when 8 digits
  const fetchCepAuto = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddressStreet(data.logradouro || "");
        setAddressNeighborhood(data.bairro || "");
        setAddressCity(data.localidade || "");
        setAddressState(data.uf || "");
      }
    } catch {}
    setLoadingCep(false);
  }, []);

  // City autocomplete via IBGE API
  const fetchCitySuggestions = useCallback(async (query: string) => {
    if (query.length < 3) { setCitySuggestions([]); return; }
    try {
      const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome`);
      const data = await res.json();
      const filtered = data
        .map((c: any) => `${c.nome} - ${c.microrregiao?.mesorregiao?.UF?.sigla || ""}`)
        .filter((name: string) => name.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 5);
      setCitySuggestions(filtered);
      setShowCitySuggestions(filtered.length > 0);
    } catch { setCitySuggestions([]); }
  }, []);

  const handleCepChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 8);
    setAddressZip(clean);
    if (clean.length === 8) fetchCepAuto(clean);
  };

  const handleCityChange = (val: string) => {
    setAddressCity(val);
    fetchCitySuggestions(val);
  };

  const selectCity = (city: string) => {
    const parts = city.split(" - ");
    setAddressCity(parts[0]);
    if (parts[1]) setAddressState(parts[1]);
    setShowCitySuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !phone || !birthDate) { toast({ title: "Preencha todos os campos obrigatórios." }); return; }
    if (!addressCity || !addressState) { toast({ title: "Informe pelo menos sua cidade e estado." }); return; }
    if (isUnderage(birthDate)) { toast({ title: "Você precisa ter 18 anos ou mais para se cadastrar.", variant: "destructive" }); return; }
    if (!termsAccepted) { toast({ title: "Aceite os termos de uso para continuar." }); return; }
    if (password.length < 6) { toast({ title: "A senha deve ter pelo menos 6 caracteres." }); return; }
    if (password !== confirmPassword) { toast({ title: "As senhas não conferem." }); return; }
    
    const docClean = document.replace(/\D/g, "");
    if (accountType === "professional" && !docClean) { toast({ title: "CPF ou CNPJ é obrigatório para profissionais." }); return; }

    // Validate uniqueness of CPF/CNPJ
    if (docClean) {
      setValidating(true);
      const field = documentType === "cpf" ? "cpf" : "cnpj";
      const { data: existing } = await supabase.from("profiles").select("id").eq(field, docClean).limit(1);
      setValidating(false);
      if (existing && existing.length > 0) {
        toast({ title: `Este ${documentType.toUpperCase()} já está cadastrado.`, variant: "destructive" });
        return;
      }
    }

    onNext({
      name, email, phone: phone.replace(/\D/g, ""),
      document: docClean, documentType,
      password, birthDate,
      addressZip: addressZip.replace(/\D/g, ""),
      addressStreet, addressNumber, addressComplement,
      addressNeighborhood, addressCity, addressState,
      addressCountry,
    });
  };


  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
          <p className="text-sm text-muted-foreground">
            Etapa 1 de {accountType === "professional" ? "3" : "2"} · <strong>Dados pessoais</strong>
          </p>
          <button onClick={onBack} className="text-xs text-primary mt-1 hover:underline">← Alterar tipo de conta</button>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-5 shadow-card space-y-3">
          <InputRow icon={User} label="Nome completo *">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
          </InputRow>

          <InputRow icon={Mail} label="E-mail *">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
          </InputRow>

          <InputRow icon={Phone} label="Telefone *">
            <input type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(00) 00000-0000"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
          </InputRow>

          <InputRow icon={Calendar} label="Data de nascimento *">
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
          </InputRow>
          {birthDate && isUnderage(birthDate) && (
            <p className="text-xs text-destructive font-medium px-1">Você precisa ter 18 anos ou mais para se cadastrar.</p>
          )}

          {accountType === "professional" && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo de documento *</label>
                <div className="flex gap-2">
                  {(["cpf", "cnpj"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => { setDocumentType(t); setDocument(""); }}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${documentType === t ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <InputRow icon={FileText} label={`${documentType.toUpperCase()} *`}>
                <input type="text" value={document}
                  onChange={(e) => setDocument(documentType === "cpf" ? formatCpf(e.target.value) : formatCnpj(e.target.value))}
                  placeholder={documentType === "cpf" ? "000.000.000-00" : "00.000.000/0001-00"}
                  maxLength={documentType === "cpf" ? 14 : 18}
                  className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
              </InputRow>
            </>
          )}

          <InputRow icon={Lock} label="Senha *">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
          </InputRow>

          <InputRow icon={Lock} label="Confirmar senha *">
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a senha"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
          </InputRow>

          {/* Address section */}
          <div className="border-t pt-3 mt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Localização *</p>
            <InputRow icon={MapPin} label="CEP">
              <input type="text" value={addressZip} onChange={(e) => handleCepChange(e.target.value)} placeholder="00000-000"
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
              {loadingCep && <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />}
            </InputRow>
            <div className="space-y-2 mt-2">
              {addressStreet && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground block mb-1">Rua</label>
                      <input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)}
                        className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Nº</label>
                      <input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="123"
                        className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  <input value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} placeholder="Complemento (opcional)"
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                  <input value={addressNeighborhood} onChange={(e) => setAddressNeighborhood(e.target.value)} placeholder="Bairro"
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <label className="text-xs text-muted-foreground block mb-1">Cidade *</label>
                  <input value={addressCity} onChange={(e) => handleCityChange(e.target.value)} placeholder="Ex: São Paulo"
                    onBlur={() => setTimeout(() => setShowCitySuggestions(false), 200)}
                    onFocus={() => citySuggestions.length > 0 && setShowCitySuggestions(true)}
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                  {showCitySuggestions && (
                    <div className="absolute z-50 top-full left-0 right-0 bg-card border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                      {citySuggestions.map((city) => (
                        <button key={city} type="button" onMouseDown={() => selectCity(city)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors text-foreground">
                          {city}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Estado *</label>
                  <input value={addressState} onChange={(e) => setAddressState(e.target.value)} placeholder="UF" maxLength={2}
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">País</label>
                <input value={addressCountry} onChange={(e) => setAddressCountry(e.target.value)} placeholder="Brasil"
                  className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5 rounded border-input" />
            <span className="text-xs text-muted-foreground">
              Li e concordo com os{" "}
              <button type="button" onClick={() => setTermsOpen(true)} className="text-primary hover:underline">Termos de Uso e Privacidade (LGPD)</button>
            </span>
          </label>

          <button type="submit" disabled={validating}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
            {validating ? "Validando..." : "Próximo →"}
          </button>
        </form>
      </div>

      <TermsDialogFromAdmin open={termsOpen} onClose={() => setTermsOpen(false)} onAccept={() => { setTermsAccepted(true); setTermsOpen(false); }} />
    </div>
  );
};

export default StepBasicData;
