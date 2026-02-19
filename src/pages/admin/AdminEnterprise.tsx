import AdminLayout from "@/components/AdminLayout";
import { Building2, CheckCircle, XCircle, Eye, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EnterpriseRequest {
  id: string;
  user_id: string;
  cnpj: string;
  company_name: string | null;
  cadastral_status: string | null;
  address_city: string | null;
  address_state: string | null;
  status: string;
  created_at: string;
  full_name: string;
  email: string;
}

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  approved: { label: "Aprovado", cls: "bg-primary/10 text-primary" },
  rejected: { label: "Rejeitado", cls: "bg-destructive/10 text-destructive" },
};

const AdminEnterprise = () => {
  const [requests, setRequests] = useState<EnterpriseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async () => {
    const { data } = await supabase
      .from("enterprise_upgrade_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const userIds = data.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

    setRequests(
      data.map((r) => ({
        ...r,
        full_name: profileMap.get(r.user_id)?.full_name || "—",
        email: profileMap.get(r.user_id)?.email || "—",
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleApprove = async () => {
    if (!detail) return;
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const res = await supabase.functions.invoke("create_payment", {
        body: {
          action: "activate_enterprise_subscription",
          upgrade_request_id: detail.id,
        },
      });

      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || "Erro ao ativar assinatura");
      }

      toast({ title: "Plano empresarial ativado!" });
      setDetail(null);
      fetchRequests();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!detail) return;
    await supabase
      .from("enterprise_upgrade_requests")
      .update({ status: "rejected" })
      .eq("id", detail.id);

    await supabase.from("notifications").insert({
      user_id: detail.user_id,
      title: "Upgrade empresarial não aprovado",
      message: "Sua solicitação para o plano Empresarial não foi aprovada. Entre em contato para mais informações.",
      type: "rejection",
      link: "/subscriptions",
    });

    toast({ title: "Solicitação rejeitada" });
    setDetail(null);
    fetchRequests();
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <AdminLayout title="Upgrade Empresarial">
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma solicitação de upgrade encontrada.</div>
      ) : (
        <div className="space-y-3">
          {pendingCount > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4">
              <p className="text-sm font-medium text-amber-700 flex items-center gap-2">
                <Clock className="w-4 h-4" /> {pendingCount} solicitação(ões) pendente(s)
              </p>
            </div>
          )}

          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">CNPJ</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const st = statusBadge[req.status] || statusBadge.pending;
                  return (
                    <tr key={req.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <p className="font-medium text-foreground">{req.full_name}</p>
                        <p className="text-xs text-muted-foreground">{req.email}</p>
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">{req.cnpj}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="p-3">
                        <button onClick={() => setDetail(req)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-violet-500" /> Detalhes da solicitação</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{detail.full_name}</p>
                <p className="text-xs text-muted-foreground">{detail.email}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">CNPJ</p>
                  <p className="font-mono text-foreground">{detail.cnpj}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Razão Social</p>
                  <p className="text-foreground">{detail.company_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Situação Cadastral</p>
                  <p className="text-foreground capitalize">{detail.cadastral_status || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cidade/UF</p>
                  <p className="text-foreground">{detail.address_city || "—"} / {detail.address_state || "—"}</p>
                </div>
              </div>
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">Endereço</p>
                <p className="text-foreground">
                  {[detail.address_street, detail.address_number, detail.address_complement, detail.address_neighborhood].filter(Boolean).join(", ")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">CEP: {detail.address_zip || "—"}</p>
              </div>

              {detail.status === "pending" && (
                <div className="flex gap-2 pt-2 border-t">
                  <button onClick={handleApprove} disabled={processing} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                    {processing ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {processing ? "Ativando..." : "Aprovar e cobrar"}
                  </button>
                  <button onClick={handleReject} disabled={processing} className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                    <XCircle className="w-4 h-4" /> Rejeitar
                  </button>
                </div>
              )}

              {detail.status !== "pending" && (
                <div className="pt-2 border-t text-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${(statusBadge[detail.status] || statusBadge.pending).cls}`}>
                    {(statusBadge[detail.status] || statusBadge.pending).label}
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminEnterprise;
