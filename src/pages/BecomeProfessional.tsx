import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import StepDocuments from "@/components/signup/StepDocuments";
import StepProfile from "@/components/signup/StepProfile";

type Step = "documents" | "profile";

const BecomeProfessional = () => {
  console.log("🔥 BECOMEPROFESSIONAL ESTÁ SENDO EXECUTADO 🔥");

  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>("documents");
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile && profile.user_type !== "client") {
      navigate("/home");
    }
  }, [profile, navigate]);

  const handleDocumentsNext = (files: File[]) => {
    console.log("📂 DOCUMENTOS RECEBIDOS:", files);
    setDocFiles(files);
    setStep("profile");
  };

  const handleProfileNext = async (profileData: {
    avatarUrl: string;
    categoryId?: string;
    professionId?: string;
    bio?: string;
  }) => {
    console.log("🚀 HANDLE PROFILE NEXT EXECUTANDO");
    console.log("📦 ARQUIVOS PARA UPLOAD:", docFiles);

    if (!user) return;

    setLoading(true);

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          user_type: "professional",
          avatar_url: profileData.avatarUrl || profile?.avatar_url,
        })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      const { data: existingPro, error: existingProError } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingProError) throw existingProError;

      let professionalId = existingPro?.id;

      if (!professionalId) {
        const { data: createdPro, error: createProError } = await supabase
          .from("professionals")
          .insert({
            user_id: user.id,
            profile_status: "approved",
            category_id: profileData.categoryId || null,
            profession_id: profileData.professionId || null,
            bio: profileData.bio || null,
          } as any)
          .select("id")
          .single();

        if (createProError) throw createProError;

        professionalId = createdPro.id;
      }

      if (professionalId && docFiles.length > 0) {
        for (const file of docFiles) {
          const ext = file.name.split(".").pop() || "jpg";

          const fileName = `documents/${user.id}/${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}.${ext}`;

          console.log("📝 ARQUIVO SENDO SALVO:", fileName);

          const { error: uploadError } = await supabase.storage
            .from("uploads")
            .upload(fileName, file, {
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) throw uploadError;

          const { error: insertDocError } = await supabase
            .from("professional_documents")
            .insert({
              professional_id: professionalId,
              file_url: fileName,
              type: "identity",
              status: "pending",
            });

          if (insertDocError) throw insertDocError;
        }
      }

      await refreshProfile();

      toast({
        title: "Solicitação enviada!",
        description: "Seu perfil profissional está em análise.",
      });

      navigate("/home");
    } catch (err: any) {
      console.error("❌ ERRO:", err);

      toast({
        title: "Erro",
        description: err?.message || "Erro inesperado",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-gradient mb-3">Chamô</h1>
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Processando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {step === "documents" && (
        <StepDocuments
          documentType="cpf"
          onNext={handleDocumentsNext}
          onBack={() => navigate("/home")}
        />
      )}

      {step === "profile" && (
        <StepProfile
          accountType="professional"
          onNext={handleProfileNext}
          onBack={() => setStep("documents")}
        />
      )}
    </>
  );
};

export default BecomeProfessional;
