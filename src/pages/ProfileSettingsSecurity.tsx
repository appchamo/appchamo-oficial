import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, FileText, CheckCircle2, Clock, XCircle, AlertTriangle, Camera, ImageIcon, X, Upload, Loader2, ShieldCheck } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useEffect, useRef, useState, useCallback } from "react";
import { uploadProfessionalDocument } from "@/lib/uploadProfessionalDocument";
import { cn } from "@/lib/utils";
import DocumentCamera from "@/components/signup/DocumentCamera";

interface DocRow {
  id: string;
  type: string;
  status: string;
  created_at: string;
}

interface UploadedDoc {
  file: File;
  preview: string;
  label: string;
  isPdf?: boolean;
}

const MAX_FILE_BYTES = 12 * 1024 * 1024;

const statusInfo = (status: string) => {
  if (status === "approved") return { icon: CheckCircle2, label: "Aprovado", cls: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30" };
  if (status === "rejected") return { icon: XCircle, label: "Reprovado", cls: "text-destructive", bg: "bg-destructive/5" };
  return { icon: Clock, label: "Em análise", cls: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" };
};

const ProfileSettingsSecurity = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isPro = profile?.user_type === "professional" || profile?.user_type === "company";

  const [proId, setProId] = useState<string | null>(null);
  const [docRows, setDocRows] = useState<DocRow[]>([]);
  const [reuploadRequested, setReuploadRequested] = useState(false);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [loadingPro, setLoadingPro] = useState(true);

  // Upload state
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [currentSlot, setCurrentSlot] = useState("");
  const [pickForSlot, setPickForSlot] = useState<string | null>(null);
  const [missingSlotKeys, setMissingSlotKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docsRef = useRef(docs);
  docsRef.current = docs;

  const docType = profile?.cpf ? "cpf" : "cnpj";
  const slots =
    docType === "cnpj"
      ? [
          { key: "id_front", label: "Documento com foto (frente)" },
          { key: "id_back", label: "Documento com foto (verso)" },
          { key: "cnpj_doc", label: "Comprovante de CNPJ" },
        ]
      : [
          { key: "id_front", label: "Documento com foto (frente)" },
          { key: "id_back", label: "Documento com foto (verso)" },
        ];

  const fetchProData = useCallback(async () => {
    if (!user || !isPro) { setLoadingPro(false); return; }
    setLoadingPro(true);
    const { data: pro } = await supabase
      .from("professionals")
      .select("id, profile_status, doc_reupload_requested")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pro) { setLoadingPro(false); return; }
    setProId(pro.id);
    setProfileStatus((pro as any).profile_status);
    setReuploadRequested(!!(pro as any).doc_reupload_requested);

    const { data: docsData } = await supabase
      .from("professional_documents")
      .select("id, type, status, created_at")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false });
    setDocRows((docsData as DocRow[]) || []);
    setLoadingPro(false);
  }, [user, isPro]);

  useEffect(() => { fetchProData(); }, [fetchProData]);

  useEffect(() => {
    return () => {
      docsRef.current.forEach((d) => {
        if (d.preview.startsWith("blob:")) URL.revokeObjectURL(d.preview);
      });
    };
  }, []);

  const clearSlotHighlight = (label: string) => {
    const sk = slots.find((s) => s.label === label)?.key;
    if (!sk) return;
    setMissingSlotKeys((prev) => prev.filter((k) => k !== sk));
  };

  const handleCapture = (file: File, preview: string) => {
    clearSlotHighlight(currentSlot);
    setDocs((prev) => {
      const old = prev.find((d) => d.label === currentSlot);
      if (old?.preview.startsWith("blob:")) URL.revokeObjectURL(old.preview);
      return [...prev.filter((d) => d.label !== currentSlot), { file, preview, label: currentSlot, isPdf: false }];
    });
    setCameraOpen(false);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const slot = pickForSlot;
    setPickForSlot(null);
    if (!file || !slot) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImg = file.type.startsWith("image/");
    if (!isPdf && !isImg) {
      toast({ title: "Formato inválido", description: "Envie imagem (JPG, PNG, WEBP) ou PDF.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast({ title: "Arquivo muito grande", description: "Máximo 12 MB por arquivo.", variant: "destructive" });
      return;
    }
    clearSlotHighlight(slot);
    setDocs((prev) => {
      const old = prev.find((d) => d.label === slot);
      if (old?.preview.startsWith("blob:")) URL.revokeObjectURL(old.preview);
      if (isPdf) return [...prev.filter((d) => d.label !== slot), { file, preview: "", label: slot, isPdf: true }];
      const preview = URL.createObjectURL(file);
      return [...prev.filter((d) => d.label !== slot), { file, preview, label: slot, isPdf: false }];
    });
  };

  const removeDoc = (label: string) => {
    setDocs((prev) => {
      const d = prev.find((x) => x.label === label);
      if (d?.preview.startsWith("blob:")) URL.revokeObjectURL(d.preview);
      return prev.filter((x) => x.label !== label);
    });
  };

  const handleSendDocs = async () => {
    if (!user || !proId) return;
    const required = slots.map((s) => s.label);
    const uploaded = docs.map((d) => d.label);
    const missing = required.filter((r) => !uploaded.includes(r));
    if (missing.length > 0) {
      const keys = slots.filter((s) => missing.includes(s.label)).map((s) => s.key);
      setMissingSlotKeys(keys);
      toast({ title: "Documentos pendentes", description: "Envie todos os documentos antes de continuar.", variant: "destructive" });
      return;
    }
    setMissingSlotKeys([]);
    setUploading(true);
    try {
      for (const doc of docs) {
        const { path } = await uploadProfessionalDocument(doc.file, user.id);
        await supabase.from("professional_documents").insert({
          professional_id: proId,
          file_url: path,
          type: "identity",
          status: "pending",
        });
      }

      await supabase
        .from("professionals")
        .update({ doc_reupload_requested: false, profile_status: "pending" } as any)
        .eq("id", proId);

      setDocs([]);
      setReuploadRequested(false);
      setProfileStatus("pending");
      toast({ title: "Documentos enviados!", description: "Aguarde a análise da equipe do Chamô." });
      await fetchProData();
    } catch (e: any) {
      toast({ title: "Erro ao enviar documentos", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Ícone de status de conta
  const overallStatus = docRows.length > 0 ? profileStatus : null;

  return (
    <AppLayout>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf,.pdf"
        className="hidden"
        onChange={onFileInputChange}
      />

      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <Link
          to="/profile/settings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Configurações
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Segurança</h1>
            <p className="text-sm text-muted-foreground">Senha e documentos da sua conta</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Alterar Senha */}
          <Link
            to="/profile/settings/senha"
            className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 transition-all"
          >
            <Lock className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground block">Alterar senha</span>
              <span className="text-xs text-muted-foreground">Atualize sua senha de acesso</span>
            </div>
            <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0 rotate-180" />
          </Link>

          {/* Documentos — apenas para profissionais */}
          {isPro && (
            <div className="bg-card border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <h2 className="text-sm font-semibold text-foreground">Documentos de verificação</h2>
              </div>

              {loadingPro ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Status geral */}
                  {overallStatus && (() => {
                    const info = statusInfo(overallStatus);
                    const Icon = info.icon;
                    return (
                      <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5", info.bg)}>
                        <Icon className={cn("w-4 h-4 shrink-0", info.cls)} />
                        <span className={cn("text-sm font-semibold", info.cls)}>
                          Cadastro: {info.label}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Lista de documentos enviados */}
                  {docRows.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Documentos enviados</p>
                      {docRows.map((doc) => {
                        const info = statusInfo(doc.status);
                        const Icon = info.icon;
                        return (
                          <div key={doc.id} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 border", info.bg)}>
                            <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs text-foreground flex-1 capitalize">{doc.type}</span>
                            <div className={cn("flex items-center gap-1", info.cls)}>
                              <Icon className="w-3.5 h-3.5" />
                              <span className="text-[11px] font-semibold">{info.label}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {docRows.length === 0 && !reuploadRequested && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Nenhum documento enviado ainda.
                    </p>
                  )}

                  {/* Banner de solicitação de reenvio */}
                  {reuploadRequested && (
                    <div className="rounded-xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                            Enviar documentação novamente
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
                            A equipe do Chamô solicitou o reenvio dos seus documentos de verificação.
                            Tire fotos nítidas e bem iluminadas ou envie arquivos em PDF.
                          </p>
                        </div>
                      </div>

                      {/* Upload slots */}
                      <div className="space-y-3">
                        {slots.map((slot) => {
                          const uploaded = docs.find((d) => d.label === slot.label);
                          return (
                            <div
                              key={slot.key}
                              id={`security-doc-${slot.key}`}
                              className={cn(
                                "rounded-xl border bg-background p-3 space-y-2 transition-colors",
                                missingSlotKeys.includes(slot.key) &&
                                  "border-destructive border-2 ring-2 ring-destructive/20"
                              )}
                            >
                              <p className="text-xs font-semibold text-foreground">{slot.label}</p>
                              {uploaded ? (
                                <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
                                  <div className="w-12 h-9 rounded-md overflow-hidden border flex-shrink-0 bg-card flex items-center justify-center">
                                    {uploaded.isPdf ? (
                                      <FileText className="w-5 h-5 text-primary" />
                                    ) : (
                                      <img src={uploaded.preview} alt="" className="w-full h-full object-cover" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">{uploaded.file.name}</p>
                                    <div className="flex gap-2 mt-1">
                                      <button type="button" onClick={() => { setCurrentSlot(slot.label); setCameraOpen(true); }} className="text-[11px] text-primary hover:underline">Câmera</button>
                                      <button type="button" onClick={() => { setPickForSlot(slot.label); fileInputRef.current?.click(); }} className="text-[11px] text-primary hover:underline">Galeria</button>
                                    </div>
                                  </div>
                                  <button type="button" onClick={() => removeDoc(slot.label)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => { setCurrentSlot(slot.label); setCameraOpen(true); }}
                                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 active:scale-[0.98] transition-all"
                                  >
                                    <Camera className="w-4 h-4" /> Câmera
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setPickForSlot(slot.label); fileInputRef.current?.click(); }}
                                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 border-primary/25 text-xs font-bold hover:bg-primary/5 active:scale-[0.98] transition-all"
                                  >
                                    <ImageIcon className="w-4 h-4 text-primary" />
                                    <span>Galeria<span className="block font-normal text-muted-foreground" style={{fontSize: 10}}>ou PDF</span></span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={handleSendDocs}
                        disabled={uploading || docs.length === 0}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploading ? "Enviando..." : "Enviar documentos"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>

      {cameraOpen && (
        <DocumentCamera
          label={currentSlot}
          onCapture={handleCapture}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </AppLayout>
  );
};

export default ProfileSettingsSecurity;
