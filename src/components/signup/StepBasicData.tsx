import { useState, useEffect, useCallback } from "react";
import { Mail, Lock, User, Phone, FileText, MapPin, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCpf, formatCnpj, formatPhone } from "@/lib/formatters";

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

const InputRow = ({ icon: Icon, label, children }: any) => (
  <div>
    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
      {label}
    </label>
    <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      {children}
    </div>
  </div>
);

const StepBasicData = ({ accountType, onNext, onBack }: Props) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [documentType, setDocumentType] = useState<"cpf" | "cnpj">("cpf");
  const [document, setDocument] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressCountry, setAddressCountry] = useState("Brasil");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [validating, setValidating] = useState(false);

  const isUnderage = (dateStr: string) => {
    if (!dateStr) return false;
    const birth = new Date(dateStr);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age < 18;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || !password || !phone || !birthDate) {
      toast({ title: "Preencha todos os campos obrigatórios." });
      return;
    }

    if (!addressCity || !addressState) {
      toast({ title: "Informe pelo menos sua cidade e estado." });
      return;
    }

    if (isUnderage(birthDate)) {
      toast({
        title: "Você precisa ter 18 anos ou mais.",
        variant: "destructive",
      });
      return;
    }

    if (!termsAccepted) {
      toast({ title: "Aceite os termos para continuar." });
      return;
    }

    if (password.length < 6) {
      toast({ title: "A senha deve ter pelo menos 6 caracteres." });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: "As senhas não conferem." });
      return;
    }

    const docClean = document.replace(/\D/g, "");

    // 🔥 CPF obrigatório para TODOS
    if (!docClean) {
      toast({ title: "CPF é obrigatório." });
      return;
    }

    setValidating(true);

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("cpf", docClean)
      .limit(1);

    setValidating(false);

    if (existing && existing.length > 0) {
      toast({
        title: "Este CPF já está cadastrado.",
        variant: "destructive",
      });
      return;
    }

    onNext({
      name,
      email,
      phone: phone.replace(/\D/g, ""),
      document: docClean,
      documentType: "cpf",
      password,
      birthDate,
      addressZip: addressZip.replace(/\D/g, ""),
      addressStreet,
      addressNumber,
      addressComplement,
      addressNeighborhood,
      addressCity,
      addressState,
      addressCountry,
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
          <button
            onClick={onBack}
            className="text-xs text-primary mt-1 hover:underline"
          >
            ← Alterar tipo de conta
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card border rounded-2xl p-5 shadow-card space-y-3"
        >
          <InputRow icon={User} label="Nome completo *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </InputRow>

          <InputRow icon={Mail} label="E-mail *">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </InputRow>

          <InputRow icon={Phone} label="Telefone *">
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </InputRow>

          <InputRow icon={Calendar} label="Data de nascimento *">
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </InputRow>

          {/* CPF obrigatório para todos */}
          <InputRow icon={FileText} label="CPF *">
            <input
              value={document}
              onChange={(e) => setDocument(formatCpf(e.target.value))}
              maxLength={14}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </InputRow>

          <InputRow icon={Lock} label="Senha *">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </InputRow>

          <InputRow icon={Lock} label="Confirmar senha *">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </InputRow>

          <button
            type="submit"
            disabled={validating}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
          >
            {validating ? "Validando..." : "Próximo →"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default StepBasicData;