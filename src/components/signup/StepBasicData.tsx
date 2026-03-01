import { useState, useEffect, useCallback, useRef } from "react";
import { Mail, Lock, User, Phone, FileText, MapPin, Search, Calendar, ScrollText, CheckCircle2 } from "lucide-react";
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
  initialData?: Partial<BasicData>; // ✅ ADICIONADO: Para receber dados do Google
}

import { formatCpf, formatCnpj, formatPhone } from "@/lib/formatters";
import { fetchViaCep } from "@/lib/viacep";

const InputRow = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
    <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      {children}
    </div>
  </div>
);

/** Modal de um único termo (Uso ou Privacidade): texto rolável; só habilita "Aceitar" quando rolar até o fim. */
const TermsScrollModal = ({
  open,
  onClose,
  onAccept,
  title,
  content,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  title: string;
  content: string;
  loading: boolean;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 30;
    setScrolledToBottom(isAtBottom);
  }, []);

  useEffect(() => {
    if (!open) setScrolledToBottom(false);
  }, [open]);

  useEffect(() => {
    if (!open || loading || !content) return;
    const t = setTimeout(() => checkScroll(), 100);
    return () => clearTimeout(t);
  }, [open, loading, content, checkScroll]);

  const handleAcceptClick = () => {
    if (!scrolledToBottom) {
      toast({ title: "Leia por completo os termos antes de aceitar.", variant: "destructive" });
      return;
    }
    onAccept();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={checkScroll}
              className="flex-1 min-h-[200px] max-h-[50vh] overflow-y-auto border rounded-xl px-3 py-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
            >
              {content || "Nenhum texto cadastrado."}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Arraste até o final para habilitar o botão Aceitar.</p>
            <button
              onClick={handleAcceptClick}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors mt-2 ${
                scrolledToBottom
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              Aceitar
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const TermsDialogFromAdmin = ({ open, onClose, onAccept }: { open: boolean; onClose: () => void; onAccept: () => void }) => {
  const [termsOfUse, setTermsOfUse] = useState("");
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [step, setStep] = useState<"use" | "privacy" | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("use");
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

  const handleAcceptUse = () => {
    if (privacyPolicy && privacyPolicy.trim()) {
      setStep("privacy");
    } else {
      onAccept();
      onClose();
    }
  };

  const handleAcceptPrivacy = () => {
    onAccept();
    onClose();
  };

  const openUse = open && step === "use";
  const openPrivacy = open && step === "privacy";

  return (
    <>
      <TermsScrollModal
        open={openUse}
        onClose={onClose}
        onAccept={handleAcceptUse}
        title="Termos de Uso"
        content={termsOfUse}
        loading={loadingTerms}
      />
      <TermsScrollModal
        open={openPrivacy}
        onClose={onClose}
        onAccept={handleAcceptPrivacy}
        title="Política de Privacidade (LGPD)"
        content={privacyPolicy}
        loading={false}
      />
    </>
  );
};

const StepBasicData = ({ accountType, onNext, onBack, initialData }: Props) => {
  const [name, setName] = useState(initialData?.name || ""); // ✅ Preenche se vier do Google
  const [email, setEmail] = useState(initialData?.email || ""); // ✅ Preenche se vier do Google
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

  // ✅ Identifica se é login social para esconder senhas
  const isSocialSignup = !!initialData?.email;

  const isUnderage = (dateStr: string) => {
    if (!dateStr) return false;
    const birth = new Date(dateStr);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age < 18;
  };

  // Busca endereço pelo CEP (ViaCEP) e preenche cidade, rua, bairro; número fica para o cliente
  const fetchCepAuto = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setLoadingCep(true);
    try {
      const data = await fetchViaCep(clean);
      if (data) {
        setAddressStreet(data.logradouro || "");
        setAddressNeighborhood(data.bairro || "");
        setAddressCity(data.localidade || "");
        setAddressState(data.uf || "");
      } else {
        toast({ title: "CEP não encontrado.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao buscar CEP. Tente novamente.", variant: "destructive" });
    }
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

  // ✅ APENAS ESTA FUNÇÃO FOI AJUSTADA PARA APLICAR A MÁSCARA VISUAL 00000-000
  const handleCepChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 8);
    const masked = clean.replace(/^(\d{5})(\d)/, "$1-$2");
    setAddressZip(masked);
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
    
    // ✅ Validação ajustada: Senha só é obrigatória se NÃO for social
    if (!name || !email || (!isSocialSignup && !password) || !phone || !birthDate) { 
      toast({ title: "Preencha todos os campos obrigatórios." }); 
      return; 
    }
    
    if (!addressCity || !addressState) { toast({ title: "Informe pelo menos sua cidade e estado." }); return; }
    if (isUnderage(birthDate)) { toast({ title: "Você precisa ter 18 anos ou mais para se cadastrar.", variant: "destructive" }); return; }
    if (!termsAccepted) { toast({ title: "Aceite os termos de uso para continuar." }); return; }
    
    // ✅ Validação de senha condicional
    if (!isSocialSignup) {
      if (password.length < 6) { toast({ title: "A senha deve ter pelo menos 6 caracteres." }); return; }
      if (password !== confirmPassword) { toast({ title: "As senhas não conferem." }); return; }
    }
    
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
              disabled={isSocialSignup} // ✅ Bloqueia edição se vier do Google
              className={`flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground ${isSocialSignup ? 'opacity-60 cursor-not-allowed' : ''}`} />
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
{/* Documento */}
<div>
  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
    {accountType === "professional"
      ? documentType === "cpf"
        ? "CPF *"
        : "CNPJ *"
      : "CPF *"}
  </label>

  {accountType === "professional" && (
    <div className="flex gap-2 mb-2">
      <button
        type="button"
        onClick={() => { setDocumentType("cpf"); setDocument(""); }}
        className={`px-3 py-1 text-xs rounded-lg border ${
          documentType === "cpf" ? "bg-primary text-white" : ""
        }`}
      >
        CPF
      </button>
      <button
        type="button"
        onClick={() => { setDocumentType("cnpj"); setDocument(""); }}
        className={`px-3 py-1 text-xs rounded-lg border ${
          documentType === "cnpj" ? "bg-primary text-white" : ""
        }`}
      >
        CNPJ
      </button>
    </div>
  )}

  <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    <input
      type="text"
      value={document}
      onChange={(e) =>
        setDocument(
          accountType === "professional"
            ? documentType === "cpf"
              ? formatCpf(e.target.value)
              : formatCnpj(e.target.value)
            : formatCpf(e.target.value)
        )
      }
      placeholder={
        accountType === "professional"
          ? documentType === "cpf"
            ? "000.000.000-00"
            : "00.000.000/0000-00"
          : "000.000.000-00"
      }
      maxLength={
        accountType === "professional"
          ? documentType === "cpf"
            ? 14
            : 18
          : 14
      }
      className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
    />
  </div>
</div>

          {/* ✅ CAMPOS DE SENHA ESCONDIDOS SE FOR SOCIAL */}
          {!isSocialSignup && (
            <>
              <InputRow icon={Lock} label="Senha *">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
                  className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
              </InputRow>

              <InputRow icon={Lock} label="Confirmar senha *">
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a senha"
                  className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
              </InputRow>
            </>
          )}

          {/* Endereço: CEP busca cidade, rua e bairro automaticamente; só o número o cliente preenche */}
          <div className="border-t pt-3 mt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Endereço *</p>
            <InputRow icon={MapPin} label="CEP">
              <input type="text" value={addressZip} onChange={(e) => handleCepChange(e.target.value)} placeholder="00000-000"
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
              {loadingCep && <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full flex-shrink-0" />}
            </InputRow>
            <div className="space-y-2 mt-2">
              <div className="relative">
                <label className="text-xs text-muted-foreground block mb-1">Cidade *</label>
                <input value={addressCity} onChange={(e) => handleCityChange(e.target.value)} placeholder="Sua cidade"
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
                <label className="text-xs text-muted-foreground block mb-1">Rua</label>
                <input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Sua rua"
                  className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Bairro</label>
                <input value={addressNeighborhood} onChange={(e) => setAddressNeighborhood(e.target.value)} placeholder="Seu bairro"
                  className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Número *</label>
                  <input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="Ex: 123"
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Complemento</label>
                  <input value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} placeholder="Opcional"
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Estado *</label>
                  <input value={addressState} onChange={(e) => setAddressState(e.target.value)} placeholder="UF" maxLength={2}
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">País</label>
                  <input value={addressCountry} onChange={(e) => setAddressCountry(e.target.value)} placeholder="Brasil"
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </div>
          </div>

          {/* Termos: só avança depois de ler e aceitar nos modais */}
          <div className="border rounded-xl p-4 bg-muted/30 space-y-3">
            {termsAccepted ? (
              <div className="flex items-center gap-3 text-foreground">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Termos aceitos</p>
                  <p className="text-xs text-muted-foreground">Você leu e aceitou os Termos de Uso e a Política de Privacidade.</p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-foreground font-medium">Termos de Uso e Privacidade</p>
                <p className="text-xs text-muted-foreground">Para continuar, é necessário ler e aceitar os termos na íntegra.</p>
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  <ScrollText className="w-4 h-4" />
                  Ler termos
                </button>
              </>
            )}
          </div>

          <button type="submit" disabled={validating || !termsAccepted}
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