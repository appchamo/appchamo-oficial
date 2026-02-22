import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Send, HelpCircle, Mic, X, Loader2, Paperclip, FileText } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import AudioPlayer from "@/components/AudioPlayer";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  image_urls?: string[] | null; // Adicionado para suportar imagens dinâmicas
}

const SupportThread = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [supportProtocol, setSupportProtocol] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || !ticketId) return;
    const load = async () => {
      const { data: ticket } = await supabase
        .from("support_tickets")
        .select("protocol")
        .eq("id", ticketId)
        .single();
      if (ticket?.protocol) setSupportProtocol(ticket.protocol);

      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", ticketId) // Removido filtro de user_id para o Admin conseguir ver também
        .order("created_at");
      setMessages((data as Message[]) || []);
      setLoading(false);
    };
    load();
  }, [user, ticketId]);

  useEffect(() => {
    if (!user || !ticketId) return;
    const channel = supabase
      .channel(`support-thread-${ticketId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `ticket_id=eq.${ticketId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, ticketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (user) {
      supabase.from("support_read_status" as any).upsert(
        { user_id: user.id, thread_user_id: user.id, last_read_at: new Date().toISOString() },
        { onConflict: "user_id,thread_user_id" }
      ).then();
    }
  }, [messages, user]);

  const isClosed = messages.some(m => m.content === "[CLOSED]");

  const handleSend = async () => {
    if (!text.trim() || !user || isClosed) return;
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({
      user_id: user.id,
      sender_id: user.id,
      content: text.trim(),
      ticket_id: ticketId,
    });
    if (error) toast({ title: "Erro ao enviar", variant: "destructive" });
    else setText("");
    setSending(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 20MB", variant: "destructive" });
      return;
    }
    
    setUploadingFile(true);
    try {
      const ext = file.name.split(".").pop() || "file";
      // ✅ NOME DA PASTA CORRIGIDO PARA 'support' (Igual à política SQL)
      const fileName = `support/${user.id}/${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
      const isImage = file.type.startsWith("image/");
      
      // ✅ GRAVAÇÃO NA COLUNA image_urls PARA MELHOR RENDERIZAÇÃO
      await supabase.from("support_messages").insert({
        user_id: user.id,
        sender_id: user.id,
        ticket_id: ticketId,
        content: isImage ? "" : `Enviou um arquivo: ${file.name}`,
        image_urls: isImage ? [urlData.publicUrl] : null,
      });

    } catch (err: any) {
      toast({ title: "Erro ao enviar arquivo", description: err.message, variant: "destructive" });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast({ title: "Não foi possível acessar o microfone", variant: "destructive" });
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = () => { mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop()); };
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !user) return;
    setUploadingAudio(true);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    const recorder = mediaRecorderRef.current;
    await new Promise<void>((resolve) => {
      const prevOnStop = recorder.onstop;
      recorder.onstop = (e) => { if (typeof prevOnStop === 'function') prevOnStop.call(recorder, e); resolve(); };
      recorder.stop();
    });
    setIsRecording(false);
    const ext = MediaRecorder.isTypeSupported('audio/webm') ? 'webm' : 'm4a';
    const mimeType = ext === 'webm' ? 'audio/webm' : 'audio/mp4';
    const blob = new Blob(audioChunksRef.current, { type: mimeType });
    if (blob.size < 1000) { setUploadingAudio(false); setRecordingTime(0); return; }
    const fileName = `audio/${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("uploads").upload(fileName, blob, { contentType: mimeType, upsert: true });
    if (uploadError) { toast({ title: "Erro ao enviar áudio", variant: "destructive" }); setUploadingAudio(false); setRecordingTime(0); return; }
    const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
    await supabase.from("support_messages").insert({ user_id: user.id, sender_id: user.id, content: `[AUDIO:${urlData.publicUrl}:${recordingTime}]`, ticket_id: ticketId });
    setUploadingAudio(false);
    setRecordingTime(0);
  };

  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const renderContent = (msg: Message) => {
    // 1. Áudio
    const audioMatch = msg.content.match(/\[AUDIO:(.+):(\d+)\]$/);
    if (audioMatch) return <AudioPlayer src={audioMatch[1]} duration={parseInt(audioMatch[2])} isMine={msg.sender_id === user?.id} />;

    // 2. ✅ Renderiza imagens vindas da nova coluna image_urls (Upload atual)
    if (msg.image_urls && msg.image_urls.length > 0) {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-1.5">
            {msg.image_urls.map((url, j) => (
              <img 
                key={j} src={url} alt="" 
                className="max-w-[200px] rounded-lg cursor-pointer hover:opacity-90" 
                onClick={() => window.open(url, '_blank')} 
              />
            ))}
          </div>
          {msg.content && <p>{msg.content}</p>}
        </div>
      );
    }

    // 3. Suporte a tags antigas [IMAGE:url] para retrocompatibilidade
    const tagMatch = msg.content.match(/\[(IMAGE|VIDEO|FILE):(.+):(.+)\]$/);
    if (tagMatch) {
      const [, type, url, name] = tagMatch;
      if (type === "IMAGE") return <img src={url} alt={name} className="max-w-[200px] rounded-lg cursor-pointer" onClick={() => window.open(url, '_blank')} />;
      if (type === "VIDEO") return <video src={url} controls className="max-w-[200px] rounded-lg" />;
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline text-xs">
          <FileText className="w-4 h-4" /> {name}
        </a>
      );
    }

    return <p className="whitespace-pre-wrap">{msg.content}</p>;
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-amber-500/90 backdrop-blur-md border-b border-amber-600/30">
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-lg mx-auto">
          <Link to="/support" className="p-1.5 rounded-lg hover:bg-amber-600/20 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">Suporte Chamô</p>
            <p className="text-[10px] text-white/70">{supportProtocol ? `Protocolo: ${supportProtocol}` : "Atendimento"}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-4 flex flex-col gap-2">
        {messages.map((msg) => {
          const isMine = msg.sender_id === user?.id;
          const isSystem = msg.content.startsWith("[CLOSED]");
          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="bg-muted/50 border rounded-xl px-4 py-2 text-center">
                  <p className="text-xs font-medium text-muted-foreground">✅ Essa solicitação de suporte foi concluída</p>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} gap-2`}>
              {!isMine && (
                <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center mt-1 flex-shrink-0">
                  <HelpCircle className="w-4 h-4 text-amber-600" />
                </div>
              )}
              <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${
                isMine
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-amber-500/10 border border-amber-500/20 rounded-bl-md text-foreground"
              }`}>
                {renderContent(msg)}
                <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {!isClosed && (
        <div className="sticky bottom-20 bg-background border-t px-4 py-3">
          <div className="flex items-center gap-2 max-w-screen-lg mx-auto">
            {isRecording ? (
              <>
                <button onClick={cancelRecording} className="w-10 h-10 rounded-xl bg-muted text-destructive flex items-center justify-center"><X className="w-4 h-4" /></button>
                <div className="flex-1 flex items-center gap-2 bg-destructive/10 border rounded-xl px-4 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-sm font-medium text-destructive">{formatRecTime(recordingTime)}</span>
                </div>
                <button onClick={stopAndSendRecording} className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center"><Send className="w-4 h-4" /></button>
              </>
            ) : uploadingAudio || uploadingFile ? (
              <div className="flex-1 flex items-center justify-center gap-2 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Enviando...</span>
              </div>
            ) : (
              <>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,.pdf" />
                <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                </button>
                <input
                  type="text" value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Dúvida ou problema?"
                  className="flex-1 bg-card border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                {text.trim() ? (
                  <button onClick={handleSend} className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center"><Send className="w-4 h-4" /></button>
                ) : (
                  <button onClick={startRecording} className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center"><Mic className="w-4 h-4" /></button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
};

export default SupportThread;