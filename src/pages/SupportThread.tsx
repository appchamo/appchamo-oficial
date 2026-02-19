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
      // Get ticket protocol
      const { data: ticket } = await supabase
        .from("support_tickets")
        .select("protocol")
        .eq("id", ticketId)
        .single();
      if (ticket?.protocol) setSupportProtocol(ticket.protocol);

      // Get messages for this specific ticket
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("user_id", user.id)
        .eq("ticket_id", ticketId)
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
  }, [user]);

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
    const ext = file.name.split(".").pop() || "file";
    const fileName = `support/${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("uploads").upload(fileName, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      toast({ title: "Erro ao enviar arquivo", variant: "destructive" });
      setUploadingFile(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const tag = isImage ? "IMAGE" : isVideo ? "VIDEO" : "FILE";
    await supabase.from("support_messages").insert({
      user_id: user.id,
      sender_id: user.id,
      content: `[${tag}:${urlData.publicUrl}:${file.name}]`,
      ticket_id: ticketId,
    });
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  const parseAudio = (content: string) => {
    const match = content.match(/\[AUDIO:(.+):(\d+)\]$/);
    if (match) return { url: match[1], duration: parseInt(match[2]) };
    return null;
  };

  const parseAttachment = (content: string) => {
    const match = content.match(/\[(IMAGE|VIDEO|FILE):(.+):(.+)\]$/);
    if (match) return { type: match[1], url: match[2], name: match[3] };
    return null;
  };

  const renderContent = (msg: Message) => {
    const audioData = parseAudio(msg.content);
    if (audioData) return <AudioPlayer src={audioData.url} duration={audioData.duration} isMine={msg.sender_id === user?.id} />;

    const attachment = parseAttachment(msg.content);
    if (attachment) {
      if (attachment.type === "IMAGE") {
        return (
          <a href={attachment.url} target="_blank" rel="noopener noreferrer">
            <img src={attachment.url} alt={attachment.name} className="max-w-[200px] rounded-lg" />
            <p className="text-[10px] mt-1 opacity-70">{attachment.name}</p>
          </a>
        );
      }
      if (attachment.type === "VIDEO") {
        return (
          <div>
            <video src={attachment.url} controls className="max-w-[200px] rounded-lg" />
            <p className="text-[10px] mt-1 opacity-70">{attachment.name}</p>
          </div>
        );
      }
      return (
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline">
          <FileText className="w-4 h-4" />
          <span className="text-xs">{attachment.name}</span>
        </a>
      );
    }

    if (msg.content.startsWith("[CLOSED]")) {
      return (
        <div className="text-center">
          <p className="text-xs font-medium">✅ Essa solicitação de suporte foi concluída</p>
        </div>
      );
    }

    return <p>{msg.content}</p>;
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
        {messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <HelpCircle className="w-10 h-10 mx-auto mb-3 text-amber-500/40" />
            <p className="font-medium">Olá! Como podemos ajudar?</p>
            <p className="text-xs mt-1">Envie sua mensagem e responderemos o mais breve possível.</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === user?.id;
          const isSystem = msg.content.startsWith("[CLOSED]");
          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="bg-muted/50 border rounded-xl px-4 py-2 text-center">
                  <p className="text-xs font-medium text-muted-foreground">✅ Essa solicitação de suporte foi concluída</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(msg.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
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

      {isClosed ? (
        <div className="sticky bottom-20 bg-muted/50 border-t px-4 py-4">
          <div className="max-w-screen-lg mx-auto text-center">
            <p className="text-sm text-muted-foreground font-medium">🔒 Esta solicitação foi encerrada.</p>
            <Link to="/support" className="text-xs text-primary font-medium hover:underline mt-1 inline-block">
              ← Voltar e abrir nova solicitação
            </Link>
          </div>
        </div>
      ) : (
        <div className="sticky bottom-20 bg-background border-t px-4 py-3">
          <div className="flex items-center gap-2 max-w-screen-lg mx-auto">
            {isRecording ? (
              <>
                <button onClick={cancelRecording} className="w-10 h-10 rounded-xl bg-muted text-destructive flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
                <div className="flex-1 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-sm font-medium text-destructive">{formatRecTime(recordingTime)}</span>
                  <span className="text-xs text-muted-foreground ml-1">Gravando...</span>
                </div>
                <button onClick={stopAndSendRecording} className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </button>
              </>
            ) : uploadingAudio || uploadingFile ? (
              <div className="flex-1 flex items-center justify-center gap-2 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">{uploadingFile ? "Enviando arquivo..." : "Enviando áudio..."}</span>
              </div>
            ) : (
              <>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,.pdf,.doc,.docx" />
                <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                </button>
                <input
                  type="text" value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-card border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                {text.trim() ? (
                  <button onClick={handleSend} disabled={sending} className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50">
                    <Send className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={startRecording} className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                    <Mic className="w-4 h-4" />
                  </button>
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
