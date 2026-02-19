import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";

const AdminLogs = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from("admin_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
      setLogs(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <AdminLayout title="Logs de Auditoria">
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhum log registrado</div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Ação</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Alvo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium text-foreground">{log.action}</td>
                    <td className="p-3 text-muted-foreground">{log.target_type || "—"}</td>
                    <td className="p-3 text-muted-foreground text-xs">{log.target_id ? log.target_id.slice(0, 8) + "..." : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminLogs;
