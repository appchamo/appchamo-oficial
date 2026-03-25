import AdminLayout from "@/components/AdminLayout";
import { Search, MessageSquare, Headphones, User, Calendar, Loader2 } from "lucide-react";
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function normalizeProtocolInput(raw: string): string {
  return raw.trim().replace(/^#+/, "").replace(/\s+/g, "");
}

type ServiceHit = {
  id: string;
  protocol: string | null;
  status: string;
  created_at: string;
  client_id: string;
  professional_id: string;
  description: string | null;
};

type SupportHit = {
  id: string;
  protocol: string | null;
  status: string;
  subject: string;
  message: string;
  created_at: string;
  user_id: string;
};

const AdminProtocols = () => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [serviceHits, setServiceHits] = useState<ServiceHit[]>([]);
  const [supportHits, setSupportHits] = useState<SupportHit[]>([]);
  const [searched, setSearched] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailType, setDetailType] = useState<"call" | "support" | null>(null);
  const [callDetail, setCallDetail] = useState<{
    request: ServiceHit;
    clientName: string;
    proName: string;
    messages: { id: string; content: string; created_at: string; sender_id: string; senderLabel: string }[];
  } | null>(null);
  const [supportDetail, setSupportDetail] = useState<{
    ticket: SupportHit;
    userName: string;
    messages: { id: string; content: string; created_at: string; sender_id: string; user_id: string; is_system: boolean; senderLabel: string }[];
  } | null>(null);

  const search = useCallback(async () => {
    const term = normalizeProtocolInput(q);
    if (term.length < 3) {
      toast({ title: "Digite ao menos 3 caracteres", description: "Ex.: CHM- ou SUP- ou parte do número.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setSearched(true);
    const pattern = `%${escapeIlike(term)}%`;
    try {
      const [srRes, stRes] = await Promise.all([
        supabase
          .from("service_requests")
          .select("id, protocol, status, created_at, client_id, professional_id, description")
          .ilike("protocol", pattern)
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("support_tickets")
          .select("id, protocol, status, subject, message, created_at, user_id")
          .ilike("protocol", pattern)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      if (srRes.error) throw srRes.error;
      if (stRes.error) throw stRes.error;
      setServiceHits((srRes.data || []) as ServiceHit[]);
      setSupportHits((stRes.data || []) as SupportHit[]);
    } catch (e: any) {
      toast({ title: "Erro na busca", description: translateError(e?.message || "Falha ao buscar"), variant: "destructive" });
      setServiceHits([]);
      setSupportHits([]);
    }
    setLoading(false);
  }, [q]);

  const loadNameMap = async (ids: string[]) => {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return new Map<string, string>();
    const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uniq);
    return new Map((data || []).map((p) => [p.user_id, p.full_name || "—"]));
  };

  const openCallDetail = async (row: ServiceHit) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailType("call");
    setCallDetail(null);
    setSupportDetail(null);
    try {
      const { data: proRow } = await supabase.from("professionals").select("user_id").eq("id", row.professional_id).maybeSingle();
      const proUserId = proRow?.user_id;
      const nameMap = await loadNameMap([row.client_id, proUserId].filter(Boolean) as string[]);
      const clientName = nameMap.get(row.client_id) || "Cliente";
      const proName = proUserId ? nameMap.get(proUserId) || "Profissional" : "Profissional";

      const { data: msgs, error: mErr } = await supabase
        .from("chat_messages")
        .select("id, content, created_at, sender_id")
        .eq("request_id", row.id)
        .order("created_at", { ascending: true });
      if (mErr) throw mErr;
      const senderIds = [...new Set((msgs || []).map((m) => m.sender_id))];
      const senderMap = await loadNameMap(senderIds);
      const messages = (msgs || []).map((m) => ({
        ...m,
        senderLabel: senderMap.get(m.sender_id) || (m.sender_id === row.client_id ? clientName : m.sender_id === proUserId ? proName : "Usuário"),
      }));
      setCallDetail({ request: row, clientName, proName, messages });
    } catch (e: any) {
      toast({ title: "Erro ao carregar chamada", description: translateError(e?.message), variant: "destructive" });
      setDetailOpen(false);
    }
    setDetailLoading(false);
  };

  const openSupportDetail = async (row: SupportHit) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailType("support");
    setCallDetail(null);
    setSupportDetail(null);
    try {
      const nameMap = await loadNameMap([row.user_id]);
      const userName = nameMap.get(row.user_id) || "Usuário";

      const { data: msgs, error: mErr } = await supabase
        .from("support_messages")
        .select("id, content, created_at, sender_id, user_id, is_system")
        .eq("ticket_id", row.id)
        .order("created_at", { ascending: true });
      if (mErr) throw mErr;
      const senderIds = [...new Set((msgs || []).map((m) => m.sender_id))];
      const userIds = [...new Set((msgs || []).map((m) => m.user_id))];
      const senderMap = await loadNameMap([...senderIds, ...userIds]);

      const messages = (msgs || []).map((m) => {
        let senderLabel = "Sistema";
        if (m.is_system) senderLabel = "Chamô";
        else senderLabel = senderMap.get(m.sender_id) || senderMap.get(m.user_id) || "Atendente";
        return { ...m, senderLabel };
      });
      setSupportDetail({ ticket: row, userName, messages });
    } catch (e: any) {
      toast({ title: "Erro ao carregar suporte", description: translateError(e?.message), variant: "destructive" });
      setDetailOpen(false);
    }
    setDetailLoading(false);
  };

  const statusLabel: Record<string, string> = {
    pending: "Pendente",
    accepted: "Aceita",
    completed: "Encerrada",
    cancelled: "Cancelada",
    closed: "Fechada",
    open: "Aberto",
    in_progress: "Em andamento",
    resolved: "Resolvido",
  };

  return (
    <AdminLayout title="Protocolos">
      <p className="text-sm text-muted-foreground mb-4 max-w-xl">
        Busque por protocolo de <strong>chamada</strong> (ex.: <code className="text-xs bg-muted px-1 rounded">CHM-…</code>) ou de{" "}
        <strong>suporte</strong> (ex.: <code className="text-xs bg-muted px-1 rounded">SUP-…</code>). Abra o resultado para ver o histórico completo.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Ex.: CHM-20260324-12345 ou SUP-…"
            className="flex-1 bg-transparent text-sm outline-none font-mono placeholder:font-sans placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

      {!loading && searched && serviceHits.length === 0 && supportHits.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm border border-dashed rounded-xl">
          Nenhum protocolo encontrado com esse termo.
        </div>
      )}

      {!loading && (serviceHits.length > 0 || supportHits.length > 0) && (
        <div className="space-y-6">
          {serviceHits.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-primary" /> Chamadas ({serviceHits.length})
              </h2>
              <div className="bg-card border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Protocolo</th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Data</th>
                      <th className="p-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceHits.map((row) => (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs text-primary font-semibold">{row.protocol || "—"}</td>
                        <td className="p-3 hidden sm:table-cell">
                          <span className="text-xs">{statusLabel[row.status] || row.status}</span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">
                          {new Date(row.created_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => void openCallDetail(row)}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Ver conversa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {supportHits.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                <Headphones className="w-4 h-4 text-violet-500" /> Suporte ({supportHits.length})
              </h2>
              <div className="bg-card border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Protocolo</th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Assunto</th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Data</th>
                      <th className="p-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {supportHits.map((row) => (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs text-violet-600 font-semibold">{row.protocol || "—"}</td>
                        <td className="p-3 text-xs max-w-[200px] truncate hidden sm:table-cell">{row.subject}</td>
                        <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">
                          {new Date(row.created_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => void openSupportDetail(row)}
                            className="text-xs font-semibold text-violet-600 hover:underline"
                          >
                            Ver conversa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={(o) => !o && setDetailOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
            <DialogTitle className="flex items-center justify-between gap-2 pr-8">
              {detailType === "call" && (
                <span className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" /> Chamada
                </span>
              )}
              {detailType === "support" && (
                <span className="flex items-center gap-2">
                  <Headphones className="w-5 h-5 text-violet-500" /> Suporte
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailLoading && (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {!detailLoading && callDetail && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-4 py-3 space-y-2 border-b bg-muted/30 text-sm shrink-0">
                <p className="font-mono font-bold text-primary">{callDetail.request.protocol}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3" /> Cliente: <strong className="text-foreground">{callDetail.clientName}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3" /> Profissional: <strong className="text-foreground">{callDetail.proName}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(callDetail.request.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="text-xs">
                  Status: <strong>{statusLabel[callDetail.request.status] || callDetail.request.status}</strong>
                </p>
                {callDetail.request.description && (
                  <p className="text-xs text-muted-foreground border-t pt-2 mt-1">{callDetail.request.description}</p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px] max-h-[55vh]">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Mensagens do chat</p>
                {callDetail.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhuma mensagem nesta conversa.</p>
                ) : (
                  callDetail.messages.map((m) => (
                    <div key={m.id} className="rounded-xl bg-muted/50 border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground">{m.senderLabel}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap break-words font-sans text-foreground">{m.content}</pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {!detailLoading && supportDetail && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-4 py-3 space-y-2 border-b bg-muted/30 text-sm shrink-0">
                <p className="font-mono font-bold text-violet-600">{supportDetail.ticket.protocol}</p>
                <p className="font-medium text-foreground">{supportDetail.ticket.subject}</p>
                <p className="text-xs text-muted-foreground">
                  Usuário: <strong className="text-foreground">{supportDetail.userName}</strong> ·{" "}
                  {new Date(supportDetail.ticket.created_at).toLocaleString("pt-BR")}
                </p>
                <p className="text-xs">
                  Status: <strong>{statusLabel[supportDetail.ticket.status] || supportDetail.ticket.status}</strong>
                </p>
                <div className="text-xs text-muted-foreground border-t pt-2 mt-1 space-y-1">
                  <p className="font-medium text-foreground">Mensagem inicial</p>
                  <pre className="whitespace-pre-wrap break-words font-sans">{supportDetail.ticket.message}</pre>
                  {supportDetail.ticket.admin_reply && (
                    <>
                      <p className="font-medium text-foreground pt-2">Resposta admin (legado)</p>
                      <pre className="whitespace-pre-wrap break-words font-sans">{supportDetail.ticket.admin_reply}</pre>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px] max-h-[50vh]">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Histórico da conversa</p>
                {supportDetail.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem adicional no ticket.</p>
                ) : (
                  supportDetail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        m.is_system ? "bg-amber-500/10 border-amber-500/20" : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground">{m.senderLabel}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap break-words font-sans text-foreground">{m.content}</pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminProtocols;
