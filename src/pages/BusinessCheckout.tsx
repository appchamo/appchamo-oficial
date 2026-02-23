import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const BusinessCheckout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [cnpj, setCnpj] = useState("");

  const handleFinish = async () => {
    if (!file || !cnpj) {
      toast({ title: "Selecione o PDF e digite o CNPJ" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const path = `business-proofs/${user.id}/${Date.now()}.pdf`;
      await supabase.storage.from("business-proofs").upload(path, file);
      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(path);

      await supabase.from("subscriptions").upsert({
        user_id: user.id,
        plan_id: "business",
        status: "PENDING",
        business_cnpj: cnpj,
        business_proof_url: urlData.publicUrl,
      });

      toast({ title: "Enviado com sucesso!" });
      navigate("/profile");
    } catch (err) {
      toast({ title: "Erro ao enviar" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "400px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: "20px" }}>← Voltar</button>
      
      <div style={{ border: "1px solid #ccc", padding: "20px", borderRadius: "10px" }}>
        <h2 style={{ fontSize: "18px", marginBottom: "20px" }}>Ativar Business</h2>
        
        <div style={{ marginBottom: "15px" }}>
          <label style={{ fontSize: "12px", display: "block" }}>CNPJ</label>
          <input 
            type="text" 
            value={cnpj} 
            onChange={(e) => setCnpj(e.target.value)} 
            style={{ width: "100%", padding: "10px", marginTop: "5px" }} 
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "12px", display: "block" }}>PDF do CNPJ</label>
          <input 
            type="file" 
            accept="application/pdf" 
            onChange={(e) => setFile(e.target.files?.[0] || null)} 
            style={{ marginTop: "5px" }} 
          />
          {file && <p style={{ fontSize: "10px", color: "green" }}>✔ {file.name}</p>}
        </div>

        <button 
          onClick={handleFinish} 
          disabled={loading}
          style={{ 
            width: "100%", 
            padding: "15px", 
            backgroundColor: "#000", 
            color: "#fff", 
            border: "none", 
            borderRadius: "5px",
            fontWeight: "bold"
          }}
        >
          {loading ? "Enviando..." : "FINALIZAR AGORA"}
        </button>
      </div>
    </div>
  );
};

export default BusinessCheckout;