import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense, memo } from "react";
import { Mail, Lock, User, Phone, FileText, MapPin, Calendar, ScrollText, CheckCircle2, UserCircle } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

type AccountType = "client" | "professional";

export type GenderOption = "male" | "female" | "prefer_not_say";

export interface BasicData {
  /** Nome completo (como no documento). */
  name: string;
  /** Preenchido automaticamente com o nome completo (compatível com a API). */
  displayName: string;
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
  /** Código Indique e ganhe (opcional). */
  referralCode?: string;
}

/** Campos do passo 1 com erro visual + scroll. */
export type BasicFieldKey =
  | "name"
  | "email"
  | "phone"
  | "birthDate"
  | "document"
  | "password"
  | "confirmPassword"
  | "addressCity"
  | "addressState"
  | "addressNumber"
  | "terms"
  | "referral";

const BASIC_FIELD_SCROLL_ORDER: BasicFieldKey[] = [
  "name",
  "email",
  "phone",
  "birthDate",
  "document",
  "password",
  "confirmPassword",
  "addressCity",
  "addressState",
  "addressNumber",
  "referral",
  "terms",
];

function scrollToFirstBasicFieldError(errs: Partial<Record<BasicFieldKey, string>>) {
  const k = BASIC_FIELD_SCROLL_ORDER.find((key) => errs[key]);
  if (!k) return;
  requestAnimationFrame(() => {
    document.getElementById(`signup-field-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

interface Props {
  accountType: AccountType;
  onNext: (data: BasicData) => void;
  onBack: () => void;
  /** Sai do cadastro e vai ao login (rodapé dentro do fluxo, evita sobrepor o formulário). */
  onExitToLogin: () => void | Promise<void>;
  initialData?: Partial<BasicData>; // ✅ ADICIONADO: Para receber dados do Google
  /** Preenchido pela URL ?ref= ao cadastrar como profissional */
  initialReferralCode?: string;
}

import { formatCpf, formatCnpj, formatPhone, validateCpf, validateCnpj } from "@/lib/formatters";
import { fetchViaCep } from "@/lib/viacep";
import { fetchMunicipioLabelsForUf, filterMunicipioLabels } from "@/lib/ibgeMunicipiosCache";
import { cn } from "@/lib/utils";

const TermsDialogFromAdmin = lazy(() =>
  import("./SignupTermsModals").then((m) => ({ default: m.TermsDialogFromAdmin }))
);

const InputRow = ({
  icon: Icon,
  label,
  fieldId,
  error,
  children,
}: {
  icon: any;
  label: string;
  fieldId?: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div id={fieldId}>
    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
    <div
      className={cn(
        "flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30 transition-colors",
        error && "border-destructive border-2 ring-2 ring-destructive/25",
      )}
    >
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      {children}
    </div>
    {error ? <p className="text-xs text-destructive font-medium mt-1.5 px-0.5">{error}</p> : null}
  </div>
);

const NATIVE_FORM_DEFER_MS = 200;

const StepBasicDataComponent = ({ accountType, onNext, onBack, onExitToLogin, initialData, initialReferralCode }: Props) => {
  /** iOS WebView: pequeno defer após SIGNED_IN para não competir com o primeiro paint (600ms deixava a tela “morta” por muito tempo). */
  const [nativeFormReady, setNativeFormReady] = useState(() => !Capacitor.isNativePlatform());
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    setNativeFormReady(false);
    const t = window.setTimeout(() => setNativeFormReady(true), NATIVE_FORM_DEFER_MS);
    return () => clearTimeout(t);
  }, []);
  const [name, setName] = useState(initialData?.name || initialData?.displayName || "");
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
  /** Exibição DD/MM/AAAA (DIA/MES/ANO). */
  const [birthDateBr, setBirthDateBr] = useState("");
  /** Campo removido do formulário; enviamos sempre "prefiro não informar", exceto se o OAuth já trouxe valor. */
  const gender: GenderOption = (initialData?.gender as GenderOption | undefined) ?? "prefer_not_say";
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [referralCode, setReferralCode] = useState(() => {
    const fromProp = initialReferralCode?.trim();
    if (fromProp) return fromProp.toUpperCase();
    try {
      const s = sessionStorage.getItem("chamo_signup_referral")?.trim();
      return s ? s.toUpperCase() : "";
    } catch {
      return "";
    }
  });
  const [loadingCep, setLoadingCep] = useState(false);
  const [validating, setValidating] = useState(false);
  const [referralValidating, setReferralValidating] = useState(false);
  const [referralValidated, setReferralValidated] = useState(false);
  const [referralValidatedCode, setReferralValidatedCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BasicFieldKey, string>>>({});

  const clearFieldError = useCallback((key: BasicFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const citySuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressStateRef = useRef(addressState);
  addressStateRef.current = addressState;

  useEffect(() => {
    const v = initialReferralCode?.trim();
    if (!v) return;
    const u = v.toUpperCase();
    setReferralCode(u);
    try {
      sessionStorage.setItem("chamo_signup_referral", u);
    } catch {
      /* ignore */
    }
  }, [initialReferralCode]);

  // ✅ Identifica se é login social para esconder senhas
  const isSocialSignup = !!initialData?.email;

  const passwordStrengthMeter = useMemo(() => {
    if (password.length === 0) return null;
    const len = password.length;
    const hasNum = /\d/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    let pct = 0;
    if (len >= 1 && len < 6) pct = Math.round((len / 6) * 60);
    if (len >= 6) pct = 70;
    if (len >= 6 && hasNum) pct += 15;
    if (len >= 6 && hasUpper) pct += 15;
    pct = Math.min(100, pct);
    const barColor =
      pct < 35 ? "bg-red-500" :
      pct < 70 ? "bg-orange-400" :
      pct < 85 ? "bg-yellow-400" :
      "bg-emerald-500";
    return (
      <div className="mt-2 px-0.5">
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-300", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Certifique-se de ter uma senha segura (6+ caracteres, número e letra maiúscula).
        </p>
      </div>
    );
  }, [password]);

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
        clearFieldError("addressCity");
        clearFieldError("addressState");
      } else {
        toast({ title: "CEP não encontrado.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao buscar CEP. Tente novamente.", variant: "destructive" });
    }
    setLoadingCep(false);
  }, [clearFieldError]);

  /**
   * Sugestões de cidade: lista por UF fica em cache (um fetch por estado); só filtramos em memória.
   */
  const fetchCitySuggestions = useCallback(async (query: string, uf: string) => {
    const u = (uf || "").trim().toUpperCase();
    if (query.length < 2 || u.length !== 2) {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      return;
    }
    try {
      const labels = await fetchMunicipioLabelsForUf(u);
      const filtered = filterMunicipioLabels(labels, query, 8);
      setCitySuggestions(filtered);
      setShowCitySuggestions(filtered.length > 0);
    } catch {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    }
  }, []);

  /** Pré-carrega municípios quando a UF fica válida — evita espera na primeira letra da cidade. */
  useEffect(() => {
    if (accountType !== "professional") return;
    const u = addressState.trim().toUpperCase();
    if (u.length !== 2) return;
    void fetchMunicipioLabelsForUf(u).catch(() => {});
  }, [accountType, addressState]);

  // ✅ APENAS ESTA FUNÇÃO FOI AJUSTADA PARA APLICAR A MÁSCARA VISUAL 00000-000
  const handleCepChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 8);
    const masked = clean.replace(/^(\d{5})(\d)/, "$1-$2");
    setAddressZip(masked);
    if (clean.length === 8) fetchCepAuto(clean);
  };

  const handleCityChange = (val: string) => {
    clearFieldError("addressCity");
    setAddressCity(val);
    if (citySuggestTimer.current) clearTimeout(citySuggestTimer.current);
    citySuggestTimer.current = setTimeout(() => {
      fetchCitySuggestions(val, addressStateRef.current);
    }, 350);
  };

  const handleReferralCodeChange = (val: string) => {
    clearFieldError("referral");
    const u = val.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    setReferralCode(u);
    if (u !== referralValidatedCode) {
      setReferralValidated(false);
      setReferralValidatedCode("");
    }
  };

  const handleApplyReferralCode = async () => {
    const raw = referralCode.trim();
    if (raw.length < 6) {
      toast({ title: "Código incompleto", description: "Digite o código de convite (mínimo 6 caracteres).", variant: "destructive" });
      return;
    }
    setReferralValidating(true);
    try {
      const { data, error } = await supabase.rpc("validate_invite_code", { p_raw_code: raw });
      if (error) {
        toast({ title: "Não foi possível validar", description: error.message, variant: "destructive" });
        setReferralValidated(false);
        setReferralValidatedCode("");
        return;
      }
      const r = data as { ok?: boolean; error?: string } | null;
      if (!r?.ok) {
        if (r?.error === "self_referral") {
          toast({ title: "Código inválido", description: "Você não pode usar o próprio código.", variant: "destructive" });
        } else if (r?.error === "invalid_format") {
          toast({ title: "Código inválido", description: "Verifique o código e tente de novo.", variant: "destructive" });
        } else {
          toast({ title: "Código não encontrado", description: "Confira com quem te convidou.", variant: "destructive" });
        }
        setReferralValidated(false);
        setReferralValidatedCode("");
        return;
      }
      setReferralValidated(true);
      setReferralValidatedCode(raw);
      clearFieldError("referral");
      toast({ title: "Código aplicado!", description: "Você ganhará os cupons ao concluir o cadastro." });
    } finally {
      setReferralValidating(false);
    }
  };

  const selectCity = (city: string) => {
    const parts = city.split(" - ");
    setAddressCity(parts[0]);
    if (parts[1]) setAddressState(parts[1]);
    clearFieldError("addressCity");
    clearFieldError("addressState");
    setShowCitySuggestions(false);
    setCitySuggestions([]);
  };

  useEffect(() => {
    return () => {
      if (citySuggestTimer.current) clearTimeout(citySuggestTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!initialData?.birthDate) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(initialData.birthDate.trim());
    if (m) setBirthDateBr(`${m[3]}/${m[2]}/${m[1]}`);
  }, [initialData?.birthDate]);

  const underageHint = useMemo(() => {
    const iso = brBirthToIso(birthDateBr) || "";
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !isUnderage(iso)) return null;
    return (
      <p className="text-xs text-destructive font-medium px-1">Você precisa ter 18 anos ou mais para se cadastrar.</p>
    );
  }, [birthDateBr]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errs: Partial<Record<BasicFieldKey, string>> = {};
    const docClean = document.replace(/\D/g, "");

    if (!name.trim()) errs.name = "Campo obrigatório.";
    if (!email.trim()) errs.email = "Campo obrigatório.";
    if (!phone.replace(/\D/g, "")) errs.phone = "Campo obrigatório.";

    const birthDigits = birthDateBr.replace(/\D/g, "");
    if (!birthDigits.length) errs.birthDate = "Campo obrigatório.";
    else if (birthDigits.length < 8)
      errs.birthDate = "Use 8 números (DD/MM/AAAA). O ano precisa de 4 dígitos (ex.: 1994, não 94).";
    else {
      const isoTry = brBirthToIso(birthDateBr);
      if (!isoTry || !/^\d{4}-\d{2}-\d{2}$/.test(isoTry))
        errs.birthDate = "Data inválida. Confira dia, mês e ano (DD/MM/AAAA).";
      else if (new Date(isoTry).toString() === "Invalid Date")
        errs.birthDate = "Data de nascimento inválida.";
      else if (isUnderage(isoTry)) errs.birthDate = "É necessário ter 18 anos ou mais para se cadastrar.";
    }

    if (!isSocialSignup) {
      if (!password) errs.password = "Campo obrigatório.";
      else if (password.length < 6) errs.password = "A senha deve ter pelo menos 6 caracteres.";
      if (!confirmPassword) errs.confirmPassword = "Confirme a senha.";
      else if (password.length >= 6 && password !== confirmPassword) errs.confirmPassword = "As senhas não conferem.";
    }

    // CPF/CNPJ: obrigatório para todos. Profissional pode usar CNPJ; cliente só CPF.
    if (!docClean) {
      errs.document =
        accountType === "professional"
          ? "CPF ou CNPJ é obrigatório."
          : "CPF é obrigatório.";
    } else if (documentType === "cpf" && !validateCpf(docClean)) {
      errs.document = "CPF inválido. Confira os números digitados.";
    } else if (documentType === "cnpj" && !validateCnpj(docClean)) {
      errs.document = "CNPJ inválido. Confira os números digitados.";
    }

    if (accountType === "professional") {
      if (!addressCity?.trim()) errs.addressCity = "Informe a cidade.";
      if (!addressState?.trim()) errs.addressState = "Informe o estado (UF).";
      if (!addressNumber?.trim()) errs.addressNumber = "Informe o número do endereço.";
    }

    if (!termsAccepted) errs.terms = "Leia e aceite os termos para continuar.";

    const refTrim = referralCode.trim();
    if (refTrim.length >= 6 && !referralValidated) {
      errs.referral = 'Toque em "Aplicar código" para validar ou apague o campo.';
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      toast({
        title: "Corrija os campos em destaque",
        description: "Eles estão com borda vermelha.",
        variant: "destructive",
      });
      scrollToFirstBasicFieldError(errs);
      return;
    }

    setFieldErrors({});
    const birthIso = brBirthToIso(birthDateBr) as string;
    const displayName = name.trim();

    const referralToSubmit =
      refTrim.length >= 6 && referralValidated && refTrim === referralValidatedCode ? refTrim : undefined;

    const addressPayload =
      accountType === "professional"
        ? {
            addressZip: addressZip.replace(/\D/g, ""),
            addressStreet,
            addressNumber,
            addressComplement,
            addressNeighborhood,
            addressCity,
            addressState,
            addressCountry,
          }
        : {
            addressZip: "",
            addressStreet: "",
            addressNumber: "",
            addressComplement: "",
            addressNeighborhood: "",
            addressCity: "",
            addressState: "",
            addressCountry: "Brasil",
          };

    // CPF/CNPJ: 1) duplicidade no nosso banco, 2) Asaas valida dígitos + duplicidade externa.
    // Vale para todos os tipos de conta (cliente e profissional).
    let asaasCustomerId: string | undefined;
    setValidating(true);
    try {
      const field = documentType === "cpf" ? "cpf" : "cnpj";
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq(field, docClean)
        .limit(1);
      if (existing && existing.length > 0) {
        const msg = `Este ${documentType.toUpperCase()} já está cadastrado.`;
        setFieldErrors({ document: msg });
        toast({ title: msg, variant: "destructive" });
        scrollToFirstBasicFieldError({ document: msg });
        return;
      }

      const invokePromise = supabase.functions.invoke("validate-cpf-signup", {
        body: { name: name.trim(), cpfCnpj: docClean },
      });
      // Asaas costuma responder em 1-3s. 32s era suficiente para o usuário
      // desistir antes de ver o erro em rede 4G fraca; 15s dá folga razoável
      // sem prender a UI por muito tempo.
      const timeoutMs = 15000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("validate_timeout")), timeoutMs)
      );
      let validation: { valid?: boolean; message?: string; asaas_customer_id?: string } | null = null;
      try {
        const result = await Promise.race([invokePromise, timeoutPromise]);
        if (result.error) {
          toast({
            title: "Não foi possível validar o documento",
            description: "Verifique sua conexão e tente novamente.",
            variant: "destructive",
          });
          return;
        }
        validation = result.data as typeof validation;
      } catch (err: unknown) {
        const isTimeout = err instanceof Error && err.message === "validate_timeout";
        toast({
          title: isTimeout ? "Tempo esgotado" : "Erro na validação",
          description: isTimeout
            ? "A validação do documento demorou demais. Tente de novo."
            : "Não foi possível concluir a validação. Tente novamente.",
          variant: "destructive",
        });
        return;
      }

      if (validation?.valid !== true) {
        const msg = validation?.message || "CPF/CNPJ inválido ou não confere com o nome.";
        setFieldErrors({ document: msg });
        toast({ title: msg, variant: "destructive" });
        scrollToFirstBasicFieldError({ document: msg });
        return;
      }

      asaasCustomerId = validation.asaas_customer_id;
    } finally {
      setValidating(false);
    }

    onNext({
      name: name.trim(),
      displayName,
      email,
      phone: phone.replace(/\D/g, ""),
      document: docClean,
      documentType,
      password,
      birthDate: birthIso,
      gender,
      ...addressPayload,
      asaas_customer_id: asaasCustomerId,
      referralCode: referralToSubmit,
    });
  };


  if (!nativeFormReady) {
    return (
      <div className="min-h-[50vh] bg-background flex flex-col items-center justify-center px-4 py-8">
        <h1 className="text-2xl font-extrabold text-gradient mb-3">Chamô</h1>
        <p className="text-sm text-muted-foreground mb-4 text-center">Preparando formulário…</p>
        <div className="w-9 h-9 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-full w-full bg-background flex flex-col items-center justify-start px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom,0px)+0.75rem)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
          <p className="text-sm text-muted-foreground">
            Etapa 1 de {accountType === "professional" ? "3" : "2"} · <strong>Dados pessoais</strong>
          </p>
          <button type="button" onClick={onBack} className="text-xs text-primary mt-1 hover:underline">← Alterar tipo de conta</button>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-5 shadow-card space-y-3">
          <InputRow icon={User} label="Nome completo *" fieldId="signup-field-name" error={fieldErrors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                clearFieldError("name");
                setName(e.target.value);
              }}
              placeholder="Como no documento"
              autoCapitalize="words"
              autoCorrect="off"
              autoComplete="name"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
            />
          </InputRow>

          <InputRow icon={Mail} label="E-mail *" fieldId="signup-field-email" error={fieldErrors.email}>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                clearFieldError("email");
                setEmail(e.target.value);
              }}
              placeholder="seu@email.com"
              disabled={isSocialSignup}
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="email"
              className={`flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground ${isSocialSignup ? "opacity-60 cursor-not-allowed" : ""}`}
            />
          </InputRow>

          <InputRow icon={Phone} label="Telefone *" fieldId="signup-field-phone" error={fieldErrors.phone}>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                clearFieldError("phone");
                setPhone(formatPhone(e.target.value));
              }}
              placeholder="(00) 00000-0000"
              inputMode="tel"
              autoComplete="tel"
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
            />
          </InputRow>

          <InputRow icon={Calendar} label="Data de nascimento *" fieldId="signup-field-birthDate" error={fieldErrors.birthDate}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              value={birthDateBr}
              onChange={(e) => {
                clearFieldError("birthDate");
                setBirthDateBr(formatBirthBrInput(e.target.value));
              }}
              maxLength={10}
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
            />
          </InputRow>
          {underageHint}

          {/* Documento */}
          <div id="signup-field-document">
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
                  onClick={() => {
                    clearFieldError("document");
                    setDocumentType("cpf");
                    setDocument("");
                  }}
                  className={`px-3 py-1 text-xs rounded-lg border ${documentType === "cpf" ? "bg-primary text-white" : ""}`}
                >
                  CPF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearFieldError("document");
                    setDocumentType("cnpj");
                    setDocument("");
                  }}
                  className={`px-3 py-1 text-xs rounded-lg border ${documentType === "cnpj" ? "bg-primary text-white" : ""}`}
                >
                  CNPJ
                </button>
              </div>
            )}

            <div
              className={cn(
                "flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30 transition-colors",
                fieldErrors.document && "border-destructive border-2 ring-2 ring-destructive/25",
              )}
            >
              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={document}
                onChange={(e) => {
                  clearFieldError("document");
                  setDocument(
                    accountType === "professional"
                      ? documentType === "cpf"
                        ? formatCpf(e.target.value)
                        : formatCnpj(e.target.value)
                      : formatCpf(e.target.value),
                  );
                }}
                placeholder={
                  accountType === "professional"
                    ? documentType === "cpf"
                      ? "000.000.000-00"
                      : "00.000.000/0000-00"
                    : "000.000.000-00"
                }
                maxLength={
                  accountType === "professional" ? (documentType === "cpf" ? 14 : 18) : 14
                }
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>
            {fieldErrors.document ? (
              <p className="text-xs text-destructive font-medium mt-1.5 px-0.5">{fieldErrors.document}</p>
            ) : null}
          </div>

          {/* ✅ CAMPOS DE SENHA ESCONDIDOS SE FOR SOCIAL */}
          {!isSocialSignup && (
            <>
              {/* Campo senha + barra de força */}
              <div id="signup-field-password">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Senha *</label>
                <div
                  className={cn(
                    "flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30 transition-colors",
                    fieldErrors.password && "border-destructive border-2 ring-2 ring-destructive/25",
                  )}
                >
                  <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <PasswordInput
                    noIcon
                    value={password}
                    onChange={(v) => {
                      clearFieldError("password");
                      setPassword(v);
                    }}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                  />
                </div>
                {/* Barra de força de senha */}
                {passwordStrengthMeter}
                {fieldErrors.password && (
                  <p className="text-xs text-destructive font-medium mt-1.5 px-0.5">{fieldErrors.password}</p>
                )}
              </div>

              <InputRow
                icon={Lock}
                label="Confirmar senha *"
                fieldId="signup-field-confirmPassword"
                error={fieldErrors.confirmPassword}
              >
                <PasswordInput
                  noIcon
                  value={confirmPassword}
                  onChange={(v) => {
                    clearFieldError("confirmPassword");
                    setConfirmPassword(v);
                  }}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                />
              </InputRow>
            </>
          )}

          {/* Endereço: obrigatório só para profissional (Asaas / cadastro) */}
          {accountType === "professional" && (
            <div className="border-t pt-3 mt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Endereço *</p>
              <InputRow icon={MapPin} label="CEP">
                <input
                  type="text"
                  value={addressZip}
                  onChange={(e) => handleCepChange(e.target.value)}
                  placeholder="00000-000"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  autoCorrect="off"
                  className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                />
                {loadingCep && <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full flex-shrink-0" />}
              </InputRow>
              <div className="space-y-2 mt-2">
                <div className="relative" id="signup-field-addressCity">
                  <label className="text-xs text-muted-foreground block mb-1">Cidade *</label>
                  <p className="text-[10px] text-muted-foreground mb-1">Preencha o estado (UF) antes para sugestões de cidade.</p>
                  <input
                    value={addressCity}
                    onChange={(e) => handleCityChange(e.target.value)}
                    placeholder="Sua cidade"
                    onBlur={() => setTimeout(() => setShowCitySuggestions(false), 200)}
                    onFocus={() => citySuggestions.length > 0 && setShowCitySuggestions(true)}
                    autoCapitalize="words"
                    autoCorrect="off"
                    autoComplete="address-level2"
                    className={cn(
                      "w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-colors",
                      fieldErrors.addressCity && "border-destructive border-2 ring-2 ring-destructive/25",
                    )}
                  />
                  {fieldErrors.addressCity ? (
                    <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.addressCity}</p>
                  ) : null}
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
                  <input
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    placeholder="Sua rua"
                    autoCapitalize="words"
                    autoCorrect="off"
                    autoComplete="address-line1"
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Bairro</label>
                  <input
                    value={addressNeighborhood}
                    onChange={(e) => setAddressNeighborhood(e.target.value)}
                    placeholder="Seu bairro"
                    autoCapitalize="words"
                    autoCorrect="off"
                    autoComplete="address-line2"
                    className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div id="signup-field-addressNumber">
                    <label className="text-xs text-muted-foreground block mb-1">Número *</label>
                    <input
                      value={addressNumber}
                      onChange={(e) => {
                        clearFieldError("addressNumber");
                        setAddressNumber(e.target.value);
                      }}
                      placeholder="Ex: 123"
                      inputMode="numeric"
                      autoComplete="off"
                      className={cn(
                        "w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-colors",
                        fieldErrors.addressNumber && "border-destructive border-2 ring-2 ring-destructive/25",
                      )}
                    />
                    {fieldErrors.addressNumber ? (
                      <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.addressNumber}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Complemento</label>
                    <input value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} placeholder="Opcional"
                      className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div id="signup-field-addressState">
                    <label className="text-xs text-muted-foreground block mb-1">Estado *</label>
                    <input
                      value={addressState}
                      onChange={(e) => {
                        clearFieldError("addressState");
                        setAddressState(e.target.value.toUpperCase());
                      }}
                      placeholder="UF"
                      maxLength={2}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      autoComplete="address-level1"
                      spellCheck={false}
                      className={cn(
                        "w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-colors uppercase",
                        fieldErrors.addressState && "border-destructive border-2 ring-2 ring-destructive/25",
                      )}
                    />
                    {fieldErrors.addressState ? (
                      <p className="text-xs text-destructive font-medium mt-1">{fieldErrors.addressState}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">País</label>
                    <input value={addressCountry} onChange={(e) => setAddressCountry(e.target.value)} placeholder="Brasil"
                      className="w-full border rounded-lg px-2.5 py-2 text-sm bg-transparent text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div id="signup-field-referral" className="border-t pt-3 mt-2 space-y-2">
            <label className="text-xs font-medium text-muted-foreground block">Código de convite (opcional)</label>
            <div className="flex items-stretch gap-2">
              <div
                className={cn(
                  "flex flex-1 min-w-0 items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30 transition-colors",
                  fieldErrors.referral && "border-destructive border-2 ring-2 ring-destructive/25",
                )}
              >
                <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => handleReferralCodeChange(e.target.value)}
                  placeholder="XXXX..."
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground font-mono tracking-wide"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button
                type="button"
                onClick={() => void handleApplyReferralCode()}
                disabled={referralValidating || referralCode.trim().length < 6}
                className={cn(
                  "shrink-0 self-stretch px-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 min-w-[5.5rem]",
                  referralValidated && referralCode.trim() === referralValidatedCode
                    ? "bg-emerald-600 text-white"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {referralValidating
                  ? "…"
                  : referralValidated && referralCode.trim() === referralValidatedCode
                    ? "APLICADO"
                    : "APLICAR"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed px-0.5">
              Com código válido aplicado, ao concluir o cadastro você e quem indicou ganham cada um +1 cupom para o sorteio mensal (além do cupom padrão do cadastro).
            </p>
            {fieldErrors.referral ? (
              <p className="text-xs text-destructive font-medium px-0.5">{fieldErrors.referral}</p>
            ) : null}
          </div>

          {/* Termos: só avança depois de ler e aceitar nos modais */}
          <div
            id="signup-field-terms"
            className={cn(
              "border rounded-xl p-4 bg-muted/30 space-y-3 transition-colors",
              fieldErrors.terms && "border-destructive border-2 ring-2 ring-destructive/25",
            )}
          >
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
                {fieldErrors.terms ? (
                  <p className="text-xs text-destructive font-medium">{fieldErrors.terms}</p>
                ) : null}
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

        <p className="text-center text-xs text-muted-foreground mt-8 mb-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
          Já tem uma conta?{" "}
          <button
            type="button"
            onClick={() => void onExitToLogin()}
            className="text-primary font-bold hover:underline bg-transparent border-none cursor-pointer p-0"
          >
            Entrar
          </button>
        </p>
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
              clearFieldError("terms");
            }}
            variant={accountType}
          />
        </Suspense>
      )}
    </div>
  );
};

const StepBasicData = memo(StepBasicDataComponent);
export default StepBasicData;