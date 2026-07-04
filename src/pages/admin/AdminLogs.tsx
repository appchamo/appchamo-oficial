import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

type LogRow = {
  id: string;
  admin_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: any;
  created_at: string;
};

// Ações em português (rótulo amigável + emoji).
const ACTION_LABELS: Record<string, string> = {
  delete_user: "🗑️ Usuário excluído",
  block_user: "🚫 Usuário bloqueado",
  unblock_user: "✅ Usuário desbloqueado",
  block_device: "📵 Dispositivo bloqueado",
  unblock_device: "📱 Dispositivo desbloqueado",
  change_plan: "💳 Plano alterado",
  toggle_visibility: "👁️ Visibilidade alterada",
  approve_professional: "✅ Profissional aprovado",
  reject_professional: "❌ Profissional recusado",
  verify_professional: "🔵 Profissional verificado",
  unverify_professional: "⚪ Verificação removida",
  request_doc_reupload: "📄 Reenvio de documento solicitado",
  grant_courtesy: "🎁 Cortesia concedida",
  add_courtesy: "🎁 Cortesia concedida",
  remove_courtesy: "🎁 Cortesia removida",
  add_bonus_calls: "➕ Chamadas bônus adicionadas",
  update_profile: "✏️ Perfil atualizado",
  send_notification: "🔔 Notificação enviada",
  refund: "💸 Reembolso",
};
const actionLabel = (a: string) => ACTION_LABELS[a] || a.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const TYPE_LABELS: Record<string, string> = {
  user: "Usuário",
  professional: "Profissional",
  sponsor: "Patrocinador",
  subscription: "Assinatura",
  device: "Dispositivo",
  coupon: "Cupom",
  notification: "Notificação",
};
const typeLabel = (t: string | null) => (t ? TYPE_LABELS[t] || t : "—");

// Rótulos amigáveis para chaves comuns do details.
const DETAIL_KEYS: Record<string, string> = {
  new_status: "Novo status",
  old_status: "Status anterior",
  new_plan: "Novo plano",
  old_plan: "Plano anterior",
  plan: "Plano",
  reason: "Motivo",
  amount: "Valor",
  count: "Quantidade",
  visible: "Visível",
  email: "E-mail",
  name: "Nome",
};
const detailKey = (k: string) => DETAIL_KEYS[k] || k.replace(/_/g, " ");

const AdminLogs = () => {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [names, setNames] = useState<Record<string, { name: string; email: string | null; type: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("admin_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); setLoading(false); return; }
      const rows = (data || []) as LogRow[];
      setLogs(rows);

      // Resolve nomes de sócios (admin_user_id) e alvos (target_id).
      const ids = new Set<string>();
      for (const r of rows) { if (r.admin_user_id) ids.add(r.admin_user_id); if (r.target_id) ids.add(r.target_id); }
      const idList = [...ids];
      const map: Record<string, { name: string; email: string | null; type: string | null }> = {};
      if (idList.length) {
        const [{ data: profs }, { data: pros }] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name, email, user_type").in("user_id", idList),
          supabase.from("professionals").select("id, user_id").in("id", idList),
        ]);
        for (const p of (profs || []) as any[]) {
          map[p.user_id] = { name: p.full_name || p.email || p.user_id.slice(0, 8), email: p.email, type: p.user_type };
        }
        // Alvos que são professionals.id → resolve pelo user_id do pro.
        const proUserIds = (pros || []).map((p: any) => p.user_id).filter((u: string) => !map[u]);
        if (proUserIds.length) {
          const { data: profs2 } = await supabase.from("profiles").select("user_id, full_name, email, user_type").in("user_id", proUserIds);
          const byUser: Record<string, any> = {};
          for (const p of (profs2 || []) as any[]) byUser[p.user_id] = p;
          for (const p of (pros || []) as any[]) {
            const pf = byUser[p.user_id];
            if (pf) map[p.id] = { name: pf.full_name || pf.email || p.user_id.slice(0, 8), email: pf.email, type: "professional" };
          }
        }
      }
      setNames(map);
      setLoading(false);
    })();
  }, []);

  const socio = (id: string | null) => (id && names[id] ? names[id].name : id ? id.slice(0, 8) + "…" : "—");
  const alvoNome = (id: string | null) => (id && names[id] ? names[id].name : id ? id.slice(0, 10) + "…" : "—");

  const toggle = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((l) => {
      const parts = [actionLabel(l.action), typeLabel(l.target_type), socio(l.admin_user_id), alvoNome(l.target_id)].join(" ").toLowerCase();
      return parts.includes(term);
    });
  }, [logs, q, names]);

  return (
    <AdminLayout title="Logs de Auditoria">
      <p className="text-sm text-muted-foreground mb-3">Registro de todas as ações feitas pelos administradores. Clique numa linha para ver os detalhes.</p>

      <div className="relative mb-3 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por ação, sócio, nome..."
          className="w-full pl-9 pr-3 py-2 bg-card border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhum log encontrado</div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-8 p-3" />
                  <th className="text-left p-3 font-medium text-muted-foreground">Ação</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Sócio</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const isOpen = expanded.has(log.id);
                  const alvo = names[log.target_id || ""];
                  return (
                    <Fragment key={log.id}>
                      <tr
                        onClick={() => toggle(log.id)}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="p-3 text-muted-foreground">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="p-3 font-medium text-foreground">{actionLabel(log.action)}</td>
                        <td className="p-3 text-muted-foreground">{typeLabel(log.target_type)}</td>
                        <td className="p-3 text-foreground">{socio(log.admin_user_id)}</td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString("pt-BR")}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/20 border-b last:border-0">
                          <td />
                          <td colSpan={4} className="p-4">
                            <div className="grid gap-2 text-xs sm:grid-cols-2 max-w-3xl">
                              <Detail label="Sócio que fez a ação" value={socio(log.admin_user_id)} sub={names[log.admin_user_id || ""]?.email || undefined} />
                              <Detail label="Ação" value={`${actionLabel(log.action)}`} sub={log.action} />
                              <Detail label="Tipo de alvo" value={typeLabel(log.target_type)} />
                              <Detail
                                label={log.action === "delete_user" ? "Quem foi excluído" : "Alvo da ação"}
                                value={alvoNome(log.target_id)}
                                sub={[alvo?.email, alvo?.type ? typeLabel(alvo.type) : null, log.target_id || undefined].filter(Boolean).join(" · ") || undefined}
                              />
                              <Detail label="Data e hora" value={new Date(log.created_at).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "medium" })} />
                              {log.details && typeof log.details === "object" && Object.keys(log.details).length > 0 && (
                                <div className="sm:col-span-2">
                                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Detalhes</p>
                                  <div className="rounded-lg border bg-card divide-y">
                                    {Object.entries(log.details).map(([k, v]) => (
                                      <div key={k} className="flex justify-between gap-3 px-3 py-1.5">
                                        <span className="text-muted-foreground capitalize">{detailKey(k)}</span>
                                        <span className="font-medium text-foreground text-right break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

const Detail = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-lg border bg-card px-3 py-2">
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
    <p className="text-sm font-medium text-foreground break-words">{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground break-all mt-0.5">{sub}</p>}
  </div>
);

export default AdminLogs;
