import AdminLayout from "@/components/AdminLayout";
import { HelpCircle, Search, MessageSquare, Clock, CheckCircle2, ArrowLeft, Send, X, Paperclip, Loader2, FileText, Mic } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import AudioPlayer from "@/components/AudioPlayer";

interface Ticket {
  id: string;
  user_id: string;
  protocol: string | null;
  subject: string;
  status: string;
  created_at: string;
  user_name?: string;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  image_urls?: string[] | null;
}

const AdminSupport = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadTickets = async () => {
      const { data: ticketsData } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
      if (!ticketsData) return;
      const userIds = ticketsData.map(t => t.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const nameMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
      setTickets(ticketsData.map(t => ({ ...t, user_name: nameMap.get(t.user_id) || "Usuário" })));
      setLoading(false);
    };
    loadTickets();
  }, []);

  useEffect(() => {
    if (!selectedTicket) return;
    const loadMessages = async () => {
      const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", selectedTicket.id).order("created_at");
      setMessages(data as Message[] || []);
    };
    loadMessages();

    const channel = supabase.channel(`admin-support-${selectedTicket.id}`).on("postgres_changes", {
      event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${selectedTicket.id}`
    }, (payload) => {
      setMessages(prev => [...prev, payload.new as Message]);
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedTicket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendReply = async () => {
    if (!reply.trim() || !selectedTicket) return;
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selectedTicket.id,
      user_id: selectedTicket.user_id,
      sender_id: user?.id,
      content: reply.trim()
    });
    if (error) toast({ title: "Erro ao enviar", variant: "destructive" });
    else setReply("");
    setSending(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;
    setUploadingFile(true);
    const { data: { user } } = await supabase.auth.getUser();
    const ext = file.name.split(".").pop();
    const fileName = `support/admin/${Date.now()}.${ext}`;
    
    const { error: uploadError } = await supabase.storage.from("uploads").upload(fileName, file);
    if (uploadError) { toast({ title: "Erro ao subir arquivo", variant: "destructive" }); setUploadingFile(false); return; }

    const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
    const isImage = file.type.startsWith("image/");

    await supabase.from("support_messages").insert({
      ticket_id: selectedTicket.id,
      user_id: selectedTicket.user_id,
      sender_id: user?.id,
      content: isImage ? "" : `Anexo: ${file.name}`,
      image_urls: isImage ? [urlData.publicUrl] : null
    });
    setUploadingFile(false);
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    const { error } = await supabase.from("support_tickets").update({ status: "closed" }).eq("id", selectedTicket.id);
    if (error) toast({ title: "Erro ao encerrar", variant: "destructive" });
    else {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("support_messages").insert({ ticket_id: selectedTicket.id, user_id: selectedTicket.user_id, sender_id: user?.id, content: "[CLOSED]" });
      setSelectedTicket({ ...selectedTicket, status: "closed" });
      toast({ title: "Ticket encerrado" });
    }
  };

  const renderContent = (msg: Message) => {
    const isMine = msg.sender_id !== selectedTicket?.user_id;
    
    // 1. Renderiza Imagens (Nova coluna image_urls)
    if (msg.image_urls && msg.image_urls.length > 0) {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-1">
            {msg.image_urls.map((url, i) => (
              <img key={i} src={url} alt="" className="max-w-[200px] rounded-lg border cursor-pointer hover:opacity-90" onClick={() => window.open(url, '_blank')} />
            ))}
          </div>
          {msg.content && <p className="text-sm">{msg.content}</p>}
        </div>
      );
    }

    // 2. Renderiza Áudio
    const audioMatch = msg.content.match(/\[AUDIO:(.+):(\d+)\]$/);
    if (audioMatch) return <AudioPlayer src={audioMatch[1]} duration={parseInt(audioMatch[2])} isMine={isMine} />;

    // 3. Suporte a tags antigas [IMAGE:url]
    const tagMatch = msg.content.match(/\[(IMAGE|VIDEO|FILE):(.+):(.+)\]$/);
    if (tagMatch) {
      const [, type, url, name] = tagMatch;
      if (type === "IMAGE") return <img src={url} alt={name} className="max-w-[200px] rounded-lg cursor-pointer" onClick={() => window.open(url, '_blank')} />;
      return <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline text-xs"><FileText className="w-3 h-3"/> {name}</a>;
    }

    if (msg.content === "[CLOSED]") return <p className="text-[10px] font-bold uppercase text-muted-foreground italic">🔒 Atendimento encerrado</p>;
    
    return <p className="text-sm whitespace-pre-wrap">{msg.content}</p>;
  };

  const filtered = tickets.filter(t => t.protocol?.includes(search) || t.user_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <AdminLayout title="Suporte">
      <div className="flex h-[calc(100vh-140px)] gap-4">
        {/* Lista de Tickets */}
        <div className={`w-full md:w-80 flex flex-col gap-3 ${selectedTicket ? "hidden md:flex" : "flex"}`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Protocolo ou nome..." className="w-full pl-9 pr-3 py-2 bg-card border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filtered.map(t => (
              <button key={t.id} onClick={() => setSelectedTicket(t)} className={`w-full text-left p-3 rounded-xl border transition-all ${selectedTicket?.id === t.id ? "border-primary bg-primary/5 shadow-sm" : "bg-card hover:border-primary/20"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-muted-foreground">{t.protocol}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${t.status === "closed" ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700"}`}>{t.status === "closed" ? "Fim" : "Aberto"}</span>
                </div>
                <p className="text-sm font-bold text-foreground truncate">{t.user_name}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(t.created_at).toLocaleDateString("pt-BR")}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Chat de Suporte */}
        <div className={`flex-1 bg-card border rounded-2xl flex flex-col overflow-hidden ${!selectedTicket ? "hidden md:flex items-center justify-center text-muted-foreground" : "flex"}`}>
          {selectedTicket ? (
            <>
              <div className="p-4 border-b flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedTicket(null)} className="md:hidden p-1"><ArrowLeft className="w-5 h-5"/></button>
                  <div>
                    <p className="font-bold text-sm">{selectedTicket.user_name}</p>
                    <p className="text-[10px] text-muted-foreground">Protocolo: {selectedTicket.protocol}</p>
                  </div>
                </div>
                {selectedTicket.status !== "closed" && (
                  <button onClick={handleCloseTicket} className="text-[11px] font-bold text-destructive px-3 py-1.5 rounded-lg hover:bg-destructive/10 transition-colors border border-destructive/20">Encerrar</button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/50">
                {messages.map(m => {
                  const isMine = m.sender_id !== selectedTicket.user_id;
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl ${isMine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm"}`}>
                        {renderContent(m)}
                        <p className={`text-[9px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {selectedTicket.status !== "closed" && (
                <div className="p-4 border-t bg-card">
                  <div className="flex items-center gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,.pdf" />
                    <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"><Paperclip className="w-5 h-5"/></button>
                    <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendReply()} placeholder="Responder usuário..." className="flex-1 bg-muted/50 border-none rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                    <button onClick={handleSendReply} disabled={sending || uploadingFile} className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {sending || uploadingFile ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center space-y-2">
              <MessageSquare className="w-12 h-12 mx-auto opacity-10" />
              <p className="text-sm">Selecione uma conversa para visualizar</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSupport;