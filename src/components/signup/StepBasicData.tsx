import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Mail, Lock, User, Phone, FileText, MapPin, Calendar, ScrollText, CheckCircle2, UserCircle } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

type AccountType = "client" | "professional";

export type GenderOption = "male" | "female" | "prefer_not_say";

export interface BasicData {
  name: string;
  email: string;
  phone: string;
  document: string;
  documentType: "cpf" | "cnpj";
  password: string;
  birthDate: string;
  gender: GenderOption;
  addressZip: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressCountry: string;
  /** Preenchido após validação do CPF/CNPJ no Asaas (cadastro profissional). */
  asaas_customer_id?: string;
}

interface Props {
  accountType: AccountType;
  onNext: (data: BasicData) => void;
  onBack: () => void;
  initialData?: Partial<BasicData>; // ✅ ADICIONADO: Para receber dados do Google
}

import { formatCpf, formatCnpj, formatPhone } from "@/lib/formatters";
import { fetchViaCep } from "@/lib/viacep";

const TermsDialogFromAdmin = lazy(() =>
  import("./SignupTermsModals").then((m) => ({ default: m.TermsDialogFromAdmin }))
);

const InputRow = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
    <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      {children}
    </div>
  </div>
);

const StepBasicData = ({ accountType, onNext, onBack, initialData }: Props) => {
  /** iOS WebView: evita travar junto com SIGNED_IN + primeiro paint pesado */
  const [nativeFormReady, setNativeFormReady] = useState(() => !Capacitor.isNativePlatform());
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    setNativeFormReady(false);
    const t = window.setTimeout(() => setNativeFormReady(true), 600);
    return () => clearTimeout(t);
  }, []);
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
  /** Nativo: exibição DD/MM/AAAA */
  const [birthDateBr, setBirthDateBr] = useState("");
  const [gender, setGender] = useState<BasicData["gender"]>(initialData?.gender ?? "prefer_not_say");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [validating, setValidating] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const citySuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ Identifica se é login social para esconder senhas
  const isSocialSignup = !!initialData?.email;

  const formatBirthBrInput = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`;
  };
  const brBirthToIso = (br: string): string | null => {
    const p = br.trim().split("/");
    if (p.length !== 3) return null;
    const dd = p[0].padStart(2, "0").slice(-2);
    const mm = p[1].padStart(2, "0").slice(-2);
    const yyyy = p[2].slice(0, 4);
    if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return null;
    const day = parseInt(dd, 10);
    const month = parseInt(mm, 10);
    const year = parseInt(yyyy, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dt = new Date(year, month - 1, day);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
    return `${year}-${mm}-${dd}`;
  };

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

  /**
   * Evita travar o app (especialmente iOS): a API do IBGE retorna ~5,5 mil municípios de uma vez.
   * Usamos busca por UF quando o estado tem 2 letras + debounce; senão só cidade manual (CEP já preenche).
   */
  const fetchCitySuggestions = useCallback(async (query: string, uf: string) => {
    const u = (uf || "").trim().toUpperCase();
    if (query.length < 2 || u.length !== 2) {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      return;
    }
    try {
      const res = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${u}/municipios?orderBy=nome`
      );
      const data = await res.json();
      if (!Array.isArray(data)) {
        setCitySuggestions([]);
        return;
      }
      const q = query.toLowerCase().trim();
      const filtered = data
        .map((c: { nome?: string }) => `${c.nome} - ${u}`)
        .filter((name: string) => name.toLowerCase().includes(q))
        .slice(0, 8);
      setCitySuggestions(filtered);
      setShowCitySuggestions(filtered.length > 0);
    } catch {
      setCitySuggestions([]);
    }
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
    if (citySuggestTimer.current) clearTimeout(citySuggestTimer.current);
    citySuggestTimer.current = setTimeout(() => {
      fetchCitySuggestions(val, addressState);
    }, 350);
  };

  const selectCity = (city: string) => {
    const parts = city.split(" - ");
    setAddressCity(parts[0]);
    if (parts[1]) setAddressState(parts[1]);
    setShowCitySuggestions(false);
    setCitySuggestions([]);
  };

  useEffect(() => {
    return () => {
      if (citySuggestTimer.current) clearTimeout(citySuggestTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !initialData?.birthDate) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(initialData.birthDate.trim());
    if (m) setBirthDateBr(`${m[3]}/${m[2]}/${m[1]}`);
  }, [initialData?.birthDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ Validação ajustada: Senha só é obrigatória se NÃO for social
    const birthOk = Capacitor.isNativePlatform() ? birthDateBr.replace(/\D/g, "").length >= 8 : !!birthDate;
    if (!name || !email || (!isSocialSignup && !password) || !phone || !birthOk) {
      toast({ title: "Preencha todos os campos obrigatórios." });
      return;
    }
    const birthIso = Capacitor.isNativePlatform()
      ? brBirthToIso(birthDateBr) || ""
      : birthDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthIso)) {
      toast({
        title: "Data de nascimento",
        description: Capacitor.isNativePlatform()
          ? "Use dia, mês e ano completos (DD/MM/AAAA)."
          : "Data inválida.",
        variant: "destructive",
      });
      return;
    }
    if (new Date(birthIso).toString() === "Invalid Date") {
      toast({ title: "Data de nascimento inválida.", variant: "destructive" });
      return;
    }
    
    if (!addressCity || !addressState) { toast({ title: "Informe pelo menos sua cidade e estado." }); return; }
    if (isUnderage(birthIso)) { toast({ title: "Você precisa ter 18 anos ou mais para se cadastrar.", variant: "destructive" }); return; }
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
      if (existing && existing.length > 0) {
        setValidating(false);
        toast({ title: `Este ${documentType.toUpperCase()} já está cadastrado.`, variant: "destructive" });
        return;
      }

      // Profissional: validar CPF/CNPJ + nome no Asaas (verifica se documento existe e confere com o nome)
      if (accountType === "professional") {
        const { data: validation } = await supabase.functions.invoke("validate-cpf-signup", {
          body: { name: name.trim(), cpfCnpj: docClean },
        });
        setValidating(false);
        if (validation?.valid !== true) {
          toast({
            title: validation?.message || "CPF/CNPJ inválido ou não confere com o nome.",
            variant: "destructive",
          });
          return;
        }
        // Guardar asaas_customer_id para o complete-signup salvar no perfil e reutilizar em assinaturas
        onNext({
          name, email, phone: phone.replace(/\D/g, ""),
          document: docClean, documentType,
          password, birthDate: birthIso, gender,
          addressZip: addressZip.replace(/\D/g, ""),
          addressStreet, addressNumber, addressComplement,
          addressNeighborhood, addressCity, addressState,
          addressCountry,
          asaas_customer_id: validation.asaas_customer_id,
        });
        return;
      }
      setValidating(false);
    }

    onNext({
      name, email, phone: phone.replace(/\D/g, ""),
      document: docClean, documentType,
      password, birthDate: birthIso, gender,
      addressZip: addressZip.replace(/\D/g, ""),
      addressStreet, addressNumber, addressComplement,
      addressNeighborhood, addressCity, addressState,
      addressCountry,
    });
  };


  if (!nativeFormReady) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
        <h1 className="text-2xl font-extrabold text-gradient mb-3">Chamô</h1>
        <p className="text-sm text-muted-foreground mb-4 text-center">Preparando formulário…</p>
        <div className="w-9 h-9 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
          <p className="text-sm text-muted-foreground">
            Etapa 1 de {accountType === "professional" ? "3" : "2"} · <strong>Dados pessoais</strong>
          </p>
          <button type="button" onClick={onBack} className="text-xs text-primary mt-1 hover:underline">← Alterar tipo de conta</button>
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
            {Capacitor.isNativePlatform() ? (
              <input
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/AAAA"
                value={birthDateBr}
                onChange={(e) => setBirthDateBr(formatBirthBrInput(e.target.value))}
                maxLength={10}
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              />
            ) : (
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              />
            )}
          </InputRow>
          {(() => {
            const iso = Capacitor.isNativePlatform() ? brBirthToIso(birthDateBr) : birthDate;
            return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && isUnderage(iso) ? (
            <p className="text-xs text-destructive font-medium px-1">Você precisa ter 18 anos ou mais para se cadastrar.</p>
            ) : null;
          })()}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sexo</label>
            <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
              <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as BasicData["gender"])}
                className="flex-1 bg-transparent text-sm outline-none text-foreground"
              >
                <option value="male">Masculino</option>
                <option value="female">Feminino</option>
                <option value="prefer_not_say">Prefiro não informar</option>
              </select>
            </div>
          </div>

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
                <PasswordInput noIcon value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
              </InputRow>

              <InputRow icon={Lock} label="Confirmar senha *">
                <PasswordInput noIcon value={confirmPassword} onChange={setConfirmPassword} placeholder="Repita a senha" autoComplete="new-password" />
              </InputRow>
            </>
          )}

          {/* Endereço: CEP (busca cidade/estado); número e rua o usuário preenche */}
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
                <p className="text-[10px] text-muted-foreground mb-1">Preencha o estado (UF) antes para sugestões de cidade.</p>
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

      {termsOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[100] bg-background/90 flex items-center justify-center">
              <div className="w-9 h-9 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <TermsDialogFromAdmin
            open={termsOpen}
            onClose={() => setTermsOpen(false)}
            onAccept={() => {
              setTermsAccepted(true);
              setTermsOpen(false);
            }}
            variant={accountType}
          />
        </Suspense>
      )}
    </div>
  );
};

export default StepBasicData;