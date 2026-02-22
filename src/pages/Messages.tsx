import AppLayout from "@/components/AppLayout";
import { MessageSquare, MoreVertical, Archive, Trash2, EyeOff, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Thread {
  id: string;
  professional_id: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  otherName: string;
  otherAvatar: string | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
}

const Messages = () => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [supportUnread, setSupportUnread] = useState(0);
  const [supportLastMsg, setSupportLastMsg] = useState<string | null>(null);
  const [supportLastTime, setSupportLastTime] = useState<string | null>(null);
  const [hasSupportMessages, setHasSupportMessages] = useState(false);
  const navigate = useNavigate();

  // Estados para o Modal de Denúncia
  const [reportingChatId, setReportingChatId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Load support thread info
      const { data: supportMsgs, count: totalSupport } = await supabase
        .from("support_messages")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (totalSupport && totalSupport > 0 && supportMsgs && supportMsgs.length > 0) {
        setHasSupportMessages(true);
        setSupportLastMsg((supportMsgs[0] as any).content);
        setSupportLastTime((supportMsgs[0] as any).created_at);
        
        // Get support read status
        const { data: readStatus } = await supabase
          .from("support_read_status" as any)
          .select("last_read_at")
          .eq("user_id", user.id)
          .eq("thread_user_id", user.id)
          .maybeSingle() as { data: { last_read_at: string } | null };
        
        if (readStatus) {
          const { count } = await supabase
            .from("support_messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .neq("sender_id", user.id)
            .gt("created_at", readStatus.last_read_at);
          setSupportUnread(count || 0);
        } else {
          const { count } = await supabase
            .from("support_messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .neq("sender_id", user.id);
          setSupportUnread(count || 0);
        }
      }

      const { data: requests } = await supabase
        .from("service_requests")
        .select("*")
        .eq("client_id", user.id)
        .order("updated_at", { ascending: false });

      const { data: proData } = await supabase.from("professionals").select("id").eq("user_id", user.id);
      let proRequests: any[] = [];
      if (proData && proData.length > 0) {
        const proIds = proData.map(p => p.id);
        const { data: pr } = await supabase.from("service_requests").select("*").in("professional_id", proIds).order("updated_at", { ascending: false });
        proRequests = pr || [];
      }

      const allReqs = [...(requests || []), ...proRequests];
      const unique = Array.from(new Map(allReqs.map(r => [r.id, r])).values());

      // Get read statuses for all threads
      const threadIds = unique.map(r => r.id);
      const { data: readStatuses } = await supabase
        .from("chat_read_status" as any)
        .select("request_id, last_read_at")
        .eq("user_id", user.id)
        .in("request_id", threadIds) as { data: { request_id: string; last_read_at: string }[] | null };
      
      const readMap = new Map((readStatuses || []).map(rs => [rs.request_id, rs.last_read_at]));

      const enriched: Thread[] = await Promise.all(unique.map(async (req: any) => {
        const isClient = req.client_id === user.id;
        let otherName = "Usuário";
        let otherAvatar: string | null = null;

        if (isClient) {
          const { data: pro } = await supabase.from("professionals").select("user_id").eq("id", req.professional_id).maybeSingle();
          if (pro) {
            const { data: profile } = await supabase.from("profiles_public" as any).select("full_name, avatar_url").eq("user_id", pro.user_id).maybeSingle() as { data: { full_name: string; avatar_url: string | null } | null };
            if (profile) { otherName = profile.full_name || "Profissional"; otherAvatar = profile.avatar_url; }
          }
        } else {
          const { data: profile } = await supabase.from("profiles_public" as any).select("full_name, avatar_url").eq("user_id", req.client_id).maybeSingle() as { data: { full_name: string; avatar_url: string | null } | null };
          if (profile) { otherName = profile.full_name || "Cliente"; otherAvatar = profile.avatar_url; }
        }

        const { data: lastMsg } = await supabase
          .from("chat_messages")
          .select("content, created_at")
          .eq("request_id", req.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Count unread messages
        const lastRead = readMap.get(req.id);
        let unreadCount = 0;
        if (lastRead) {
          const { count } = await supabase
            .from("chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("request_id", req.id)
            .neq("sender_id", user.id)
            .gt("created_at", lastRead);
          unreadCount = count || 0;
        } else {
          // Never read — count all messages from the other party
          const { count } = await supabase
            .from("chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("request_id", req.id)
            .neq("sender_id", user.id);
          unreadCount = count || 0;
        }

        return {
          ...req,
          otherName,
          otherAvatar,
          lastMessage: lastMsg?.content || null,
          lastMessageTime: lastMsg?.created_at || req.updated_at,
          unreadCount,
        };
      }));

      enriched.sort((a, b) => new Date(b.lastMessageTime || b.updated_at).getTime() - new Date(a.lastMessageTime || a.updated_at).getTime());
      setThreads(enriched);
      setLoading(false);
    };
    load();
  }, []);

  const timeLabel = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (days === 1) return "Ontem";
    if (days < 7) return date.toLocaleDateString("pt-BR", { weekday: "short" });
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  // ✅ Função para enviar a denúncia
  const handleReportSubmit = async () => {
    if (!reportingChatId || !reportReason.trim()) return;
    
    setIsSubmittingReport(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from('chat_reports' as any)
        .insert({
          reporter_id: user.id,
          chat_id: reportingChatId,
          reason: reportReason.trim()
        });

      if (error) throw error;
      
      // Limpa os estados e fecha o modal (pode adicionar um toast de sucesso aqui se tiver)
      setReportingChatId(null);
      setReportReason("");
      alert("Denúncia enviada com sucesso! Nossa equipe analisará em breve.");
    } catch (error) {
      console.error("Erro ao enviar denúncia:", error);
      alert("Erro ao enviar denúncia. Tente novamente.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Funções placeholder para as outras ações do menu
  const handleAction = (action: string, chatId: string) => {
    console.log(`Ação ${action} no chat ${chatId}`);
    // Futuro: Implementar arquivar, excluir, marcar como não lida
  };

  if (loading) return <AppLayout><main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Carregando...</main></AppLayout>;

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-foreground mb-4">Mensagens</h1>
        
        <Link to="/support"
          className={`flex items-center gap-3 px-2 py-3 border-b hover:bg-amber-500/5 transition-colors rounded-lg ${supportUnread > 0 ? "bg-amber-500/10" : ""}`}>
          <div className="relative flex-shrink-0">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/10 flex items-center justify-center border-2 border-amber-500/30 shadow-sm">
              <MessageSquare className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className={`text-sm truncate ${supportUnread > 0 ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>
                🛟 Suporte Chamô
              </p>
              {supportLastTime && (
                <span className={`text-[11px] flex-shrink-0 ml-2 ${supportUnread > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
                  {timeLabel(supportLastTime)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-xs truncate mt-0.5 ${supportUnread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {hasSupportMessages ? (supportLastMsg?.includes("[AUDIO:") ? "🎤 Mensagem de voz" : supportLastMsg || "Fale com o suporte") : "Precisa de ajuda? Fale conosco"}
              </p>
              {supportUnread > 0 && (
                <span className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1.5">
                  {supportUnread > 99 ? "99+" : supportUnread}
                </span>
              )}
            </div>
          </div>
        </Link>

        {threads.length === 0 && !hasSupportMessages ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Nenhuma conversa</p>
            <p className="text-xs">Contrate um profissional ou fale com o suporte</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {threads.map((t) => {
              const initials = t.otherName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
              let preview = t.lastMessage || t.description || "Nova conversa";
              if (preview.includes("[COBRAR:")) preview = "💰 Cobrança enviada";
              if (preview.includes("✅ PAGAMENTO")) preview = "✅ Pagamento confirmado";
              if (preview.includes("⭐ AVALIAÇÃO")) preview = "⭐ Avaliação enviada";
              if (preview.includes("[AUDIO:")) preview = "🎤 Mensagem de voz";
              const hasUnread = t.unreadCount > 0;

              return (
                <div key={t.id} className={`flex items-center gap-3 px-2 py-3 border-b last:border-b-0 hover:bg-muted/40 transition-colors rounded-lg ${hasUnread ? "bg-primary/5" : ""}`}>
                  {/* Área clicável que leva para o chat */}
                  <div 
                    onClick={() => navigate(`/messages/${t.id}`)}
                    className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
                  >
                    <div className="relative flex-shrink-0">
                      {t.otherAvatar ? (
                        <img src={t.otherAvatar} alt={t.otherName} className="w-14 h-14 rounded-full object-cover border-2 border-background shadow-sm" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-bold text-primary border-2 border-background shadow-sm">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm truncate ${hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>{t.otherName}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs truncate mt-0.5 ${hasUnread ? "text-foreground font-medium" : "text-muted-foreground"}`}>{preview}</p>
                        {hasUnread && (
                          <span className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1.5">
                            {t.unreadCount > 99 ? "99+" : t.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Menu de 3 pontinhos e Horário */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-[11px] ${hasUnread ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                      {timeLabel(t.lastMessageTime)}
                    </span>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 hover:bg-muted rounded-full transition-colors text-muted-foreground">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg border-muted">
                        <DropdownMenuItem onClick={() => handleAction('unread', t.id)} className="gap-2 cursor-pointer py-2">
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-sm">Marcar como não lida</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAction('archive', t.id)} className="gap-2 cursor-pointer py-2">
                          <Archive className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-sm">Arquivar conversa</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleAction('delete', t.id)} className="gap-2 cursor-pointer py-2 text-red-600 focus:text-red-600 focus:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                          <span className="font-medium text-sm">Excluir conversa</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setReportingChatId(t.id)} 
                          className="gap-2 cursor-pointer py-2 text-amber-600 focus:text-amber-600 focus:bg-amber-50"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          <span className="font-medium text-sm">Denunciar conversa</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ✅ Modal de Denúncia */}
        <Dialog open={!!reportingChatId} onOpenChange={(open) => !open && setReportingChatId(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                Denunciar Conversa
              </DialogTitle>
              <DialogDescription>
                Descreva o motivo da denúncia. Nossa equipe de suporte analisará a conversa para tomar as medidas necessárias.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Ex: Profissional agindo com falta de respeito, cobrando por fora do app, etc..."
                className="w-full min-h-[120px] p-3 rounded-xl border border-muted bg-background text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
              />
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setReportingChatId(null)} className="w-full sm:w-auto rounded-xl">
                Cancelar
              </Button>
              <Button 
                type="button" 
                onClick={handleReportSubmit} 
                disabled={!reportReason.trim() || isSubmittingReport}
                className="w-full sm:w-auto rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isSubmittingReport ? "Enviando..." : "Enviar Denúncia"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
    </AppLayout>
  );
};

export default Messages;