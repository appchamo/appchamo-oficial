import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Send,
  HelpCircle,
  Mic,
  X,
  Loader2,
  Paperclip,
  FileText,
  Bot,
  RefreshCw,
  Maximize2,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import AudioPlayer from "@/components/AudioPlayer";
import { isSupportBotMessage, SUPPORT_BOT_SENDER_ID } from "@/lib/supportBot";
import {
  buildSupportAttachmentTag,
  parseAnySupportAttachment,
  type SupportAttachKind,
} from "@/lib/supportMessageAttachments";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  image_urls?: string[] | null;
}

const SupportThread = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [ticketSubject, setTicketSubject] = useState<string | null>(null);
  const [ticketUserId, setTicketUserId] = useState<string | null>(null);
  const invokedAiForHumanRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false); // ✅ Novo estado
  const [supportProtocol, setSupportProtocol] = useState<string | null>(null);
  const [requestedHumanAt, setRequestedHumanAt] = useState<string | null>(null);
  const [requestingHuman, setRequestingHuman] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{
    kind: "image" | "video" | "pdf";
    url: string;
    name: string;
  } | null>(null);
  const [mediaViewerFullscreen, setMediaViewerFullscreen] = useState(false);

  /** Edge function com service role; em projetos com verify_jwt=true no dashboard, enviar JWT evita 401 no gateway. */
  const invokeAI = async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      await supabase.functions.invoke("support-ai-reply", {
        body: { ticket_id: ticketId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch (e) {
      console.error("[Suporte IA] Falha:", e);
    }
  };

  /**
   * Verifica se um atendente humano já participou da conversa.
   * Usa o estado atual de `messages` como referência.
   */
  const hasHumanAgentReplied = (msgs: Message[]) =>
    msgs.some(
      (m) => m.sender_id !== SUPPORT_BOT_SENDER_ID && m.sender_id !== user?.id
    );

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadThread = useCallback(async () => {
    if (!user?.id || !ticketId) {
      setLoading(false);
      return;
    }
    try {
      const { data: ticket } = await supabase
        .from("support_tickets")
        .select("protocol, requested_human_at, subject, user_id")
        .eq("id", ticketId)
        .single();
      if (ticket?.protocol) setSupportProtocol(ticket.protocol);
      setRequestedHumanAt((ticket as any)?.requested_human_at ?? null);
      setTicketSubject((ticket as any)?.subject ?? null);
      setTicketUserId((ticket as any)?.user_id ?? null);

      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at");
      setMessages((data as Message[]) || []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [user, ticketId]);

  useEffect(() => {
    if (!user || !ticketId) return;
    loadThread();
  }, [user, ticketId, loadThread]);

  // Preencher campo de mensagem quando veio de um botão de assunto
  useEffect(() => {
    const initial = (location.state as { initialMessage?: string } | null)?.initialMessage;
    if (initial) {
      setText(initial);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  // Disparar resposta da IA ao abrir "chat sem assunto" (já tem uma mensagem do usuário)
  useEffect(() => {
    if (!user || !ticketId || invokedAiForHumanRef.current || !ticketSubject || loading) return;
    if (ticketSubject !== "Nova solicitação") return;
    if (messages.length !== 1 || messages[0].sender_id === SUPPORT_BOT_SENDER_ID) return;
    invokedAiForHumanRef.current = true;
    (async () => {
      await new Promise((r) => setTimeout(r, 800));
      await invokeAI();
    })();
  }, [user, ticketId, ticketSubject, messages, loading]);

  useEffect(() => {
    if (!user || !ticketId || typeof ticketId !== "string") return;
    const channel = supabase
      .channel(`support-thread-${ticketId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `ticket_id=eq.${ticketId}`,
      }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        const msg: Message = {
          id: row.id as string,
          sender_id: row.sender_id as string,
          content: (row.content as string) ?? "",
          created_at: (row.created_at as string) ?? new Date().toISOString(),
          image_urls: (row.image_urls as string[] | null) ?? null,
        };
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const next = [...prev, msg].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, ticketId]);

  // Fallback: polling a cada 15s quando Realtime falha (ex.: iOS/WebView)
  useEffect(() => {
    if (!user || !ticketId || typeof ticketId !== "string") return;
    const interval = setInterval(() => {
      supabase
        .from("support_messages")
        .select("id, sender_id, content, created_at, image_urls")
        .eq("ticket_id", ticketId)
        .order("created_at")
        .then(({ data }) => {
          if (data?.length) setMessages((data as Message[]).map(m => ({ ...m, image_urls: m.image_urls ?? null })));
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
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
    const content = text.trim();
    const { data: newMsg, error } = await supabase
      .from("support_messages")
      .insert({
        user_id: user.id,
        sender_id: user.id,
        content,
        ticket_id: ticketId,
      })
      .select("id, sender_id, content, created_at")
      .single();
    if (error) {
      toast({ title: "Erro ao enviar", variant: "destructive" });
      setSending(false);
      return;
    }
    setText("");
    setSending(false);
    if (newMsg) setMessages((prev) => [...prev, { ...newMsg, image_urls: null } as Message]);

    // Só aciona IA se nenhum atendente humano já respondeu neste ticket
    if (!hasHumanAgentReplied(messages)) {
      await new Promise((r) => setTimeout(r, 800));
      await invokeAI();
    }
  };

  // ✅ FUNÇÃO DE COMPRESSÃO ADICIONADA PARA O SUPORTE
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const originalFile = e.target.files?.[0];
    if (!originalFile || !user) return;

    const isImage = originalFile.type.startsWith("image/");
    const isVideo = originalFile.type.startsWith("video/");
    const maxBytes = isVideo ? 50 * 1024 * 1024 : isImage ? 20 * 1024 * 1024 : 25 * 1024 * 1024;
    if (originalFile.size > maxBytes) {
      toast({
        title: "Arquivo muito grande",
        description: isVideo ? "Vídeo: máximo 50 MB" : "Máximo 25 MB (imagens: 20 MB)",
        variant: "destructive",
      });
      return;
    }

    setUploadingFile(true);

    try {
      let fileToUpload: File | Blob = originalFile;

      // Se for imagem, comprime antes de subir
      if (isImage) {
        setIsCompressing(true);
        fileToUpload = await new Promise<File>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(originalFile);
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
              const canvas = document.createElement("canvas");
              let width = img.width;
              let height = img.height;
              const MAX_WIDTH = 880;
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              ctx?.drawImage(img, 0, 0, width, height);
              canvas.toBlob((blob) => {
                if (blob) {
                  const compressed = new File([blob], originalFile.name.replace(/\.[^/.]+$/, ".webp"), { type: "image/webp" });
                  resolve(compressed);
                }
              }, "image/webp", 0.62);
            };
          };
        });
        setIsCompressing(false);
      }

      const ext = isImage ? "webp" : originalFile.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
      const fileName = `support/${user.id}/${Date.now()}.${ext}`;
      const uploadMime =
        isImage && fileToUpload instanceof File
          ? fileToUpload.type || "image/webp"
          : originalFile.type || undefined;

      const { error: uploadError } = await supabase.storage.from("uploads").upload(fileName, fileToUpload, {
        contentType: uploadMime,
        upsert: false,
      });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);

      if (isImage) {
        await supabase.from("support_messages").insert({
          user_id: user.id,
          sender_id: user.id,
          ticket_id: ticketId,
          content: "",
          image_urls: [urlData.publicUrl],
        });
      } else {
        const kind: SupportAttachKind = isVideo ? "VIDEO" : "FILE";
        const tag = buildSupportAttachmentTag(kind, urlData.publicUrl, originalFile.name);
        await supabase.from("support_messages").insert({
          user_id: user.id,
          sender_id: user.id,
          ticket_id: ticketId,
          content: tag,
          image_urls: null,
        });
      }

    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setUploadingFile(false);
      setIsCompressing(false);
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

    // IA responde ao áudio (via Whisper + ElevenLabs)
    if (!hasHumanAgentReplied(messages)) {
      await new Promise((r) => setTimeout(r, 800));
      await invokeAI();
    }
  };

  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  /** Envia mensagem de botão de resposta rápida (final obrigatório do fluxo da IA). */
  const sendQuickReply = async (content: string) => {
    if (!user || !ticketId || isClosed) return;
    setSending(true);
    const { data: newMsg, error } = await supabase
      .from("support_messages")
      .insert({ user_id: user.id, sender_id: user.id, content, ticket_id: ticketId })
      .select("id, sender_id, content, created_at")
      .single();
    if (error) {
      toast({ title: "Erro ao enviar", variant: "destructive" });
      setSending(false);
      return;
    }
    if (newMsg) setMessages((prev) => [...prev, { ...newMsg, image_urls: null } as Message]);
    setSending(false);
    if (!hasHumanAgentReplied(messages)) {
      await new Promise((r) => setTimeout(r, 800));
      await invokeAI();
    }
  };

  const handleRequestHuman = async () => {
    if (!ticketId || !user || requestingHuman || requestedHumanAt) return;
    setRequestingHuman(true);
    const { error } = await supabase.rpc("request_human_attendant", { _ticket_id: ticketId });
    if (error) {
      toast({ title: "Erro ao solicitar atendente", variant: "destructive" });
      setRequestingHuman(false);
      return;
    }
    setRequestedHumanAt(new Date().toISOString());
    await supabase.from("support_messages").insert({
      user_id: user.id,
      sender_id: user.id,
      ticket_id: ticketId,
      content: "Solicitei falar com um atendente humano.",
    });
    toast({ title: "Solicitação enviada", description: "Um atendente será notificado em breve." });
    setRequestingHuman(false);
    // A IA ainda pode confirmar o pedido de humano (se nenhum agente respondeu ainda)
    if (!hasHumanAgentReplied(messages)) {
      await new Promise((r) => setTimeout(r, 800));
      await invokeAI();
    }
  };

  const openViewer = (kind: "image" | "video" | "pdf", url: string, name: string) => {
    setMediaViewerFullscreen(false);
    setMediaViewer({ kind, url, name });
  };

  const renderContent = (msg: Message) => {
    const audioMatch = msg.content.match(/\[AUDIO:(.+):(\d+)\]$/);
    if (audioMatch)
      return (
        <AudioPlayer
          src={audioMatch[1]}
          duration={parseInt(audioMatch[2])}
          isMine={msg.sender_id === user?.id}
        />
      );

    if (msg.image_urls && msg.image_urls.length > 0) {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-1.5">
            {msg.image_urls.map((url, j) => (
              <button
                key={j}
                type="button"
                className="relative block max-w-[220px] rounded-lg overflow-hidden border border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                onClick={() => openViewer("image", url, "Imagem")}
              >
                <img src={url} alt="" className="w-full object-cover max-h-52 hover:opacity-95 transition-opacity" />
                <span className="absolute bottom-1 right-1 rounded-md bg-black/55 p-1 text-white">
                  <Maximize2 className="w-3.5 h-3.5" />
                </span>
              </button>
            ))}
          </div>
          {msg.content ? <p className="whitespace-pre-wrap">{msg.content}</p> : null}
        </div>
      );
    }

    const att = parseAnySupportAttachment(msg.content.trim());
    if (att) {
      if (att.kind === "IMAGE") {
        return (
          <button
            type="button"
            className="relative block max-w-[220px] rounded-lg overflow-hidden border border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            onClick={() => openViewer("image", att.url, att.name)}
          >
            <img
              src={att.url}
              alt=""
              className="w-full object-cover max-h-52 hover:opacity-95 transition-opacity"
            />
            <span className="absolute bottom-1 right-1 rounded-md bg-black/55 p-1 text-white">
              <Maximize2 className="w-3.5 h-3.5" />
            </span>
          </button>
        );
      }
      if (att.kind === "VIDEO") {
        return (
          <div className="relative max-w-[min(260px,85vw)] rounded-xl overflow-hidden border border-white/15 bg-black/30">
            <video src={att.url} controls className="w-full max-h-56 object-contain" playsInline />
            <button
              type="button"
              className="absolute top-2 right-2 rounded-full bg-black/55 p-1.5 text-white"
              onClick={() => openViewer("video", att.url, att.name)}
              aria-label="Tela cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <p className="text-[10px] px-2 py-1 opacity-80 truncate">{att.name}</p>
          </div>
        );
      }
      return (
        <button
          type="button"
          onClick={() => openViewer("pdf", att.url, att.name)}
          className="flex w-full max-w-[260px] flex-col gap-1 rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-left hover:bg-white/10 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-semibold">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">{att.name}</span>
          </span>
          <span className="text-[10px] opacity-70">Toque para ver o PDF</span>
        </button>
      );
    }

    return <p className="whitespace-pre-wrap">{msg.content}</p>;
  };

  if (!ticketId) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <p className="text-sm text-muted-foreground text-center mb-4">Solicitação inválida ou não encontrada.</p>
        <Link to="/support" className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
          Voltar ao Suporte
        </Link>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin w-6 h-6 text-primary" /></div>;

  return (
    <div
      className="bg-background flex flex-col overflow-hidden fixed inset-0 w-full"
      style={{
        paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
        minHeight: "100vh",
        height: "100dvh",
      }}
    >
      <header
        className="flex-shrink-0 z-30 bg-amber-500/90 backdrop-blur-md border-b border-amber-600/30"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-lg mx-auto text-white">
          <Link to="/support" className="p-1.5 rounded-lg hover:bg-amber-600/20"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><HelpCircle className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">Suporte Chamô</p>
            <p className="text-[10px] opacity-70">{supportProtocol ? `Protocolo: ${supportProtocol}` : "Atendimento"}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setRefreshing(true);
              await loadThread();
              setRefreshing(false);
            }}
            disabled={refreshing}
            className="p-2 rounded-lg hover:bg-amber-600/20 transition-colors disabled:opacity-60"
            aria-label="Atualizar"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden max-w-screen-lg mx-auto w-full flex flex-col"
      >
        {/* Empurra mensagens para baixo quando há poucas */}
        <div className="flex-1" />
        <div className="flex flex-col gap-2 px-4 py-4">
        {messages.map((msg) => {
          const isBot = isSupportBotMessage(msg.sender_id);
          const isMine = !isBot && msg.sender_id != null && user?.id != null && String(msg.sender_id) === String(user.id);
          // Admin/agente vê: mensagens do cliente à esquerda, suas próprias + bot à direita
          // Cliente vê: suas próprias mensagens à direita, bot + agente à esquerda
          const isAdminView = ticketUserId != null && user?.id !== ticketUserId;
          const showOnRight = isAdminView ? (isMine || isBot) : isMine;
          // Mensagem de agente humano (não bot, não o próprio usuário logado)
          const isHumanAgent = !isBot && !isMine;

          if (msg.content === "[CLOSED]") return (
            <div key={msg.id} className="flex justify-center my-2">
              <div className="bg-muted/50 border rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground">✅ Chamado encerrado</div>
            </div>
          );

          return (
            <div key={msg.id} className={`flex ${showOnRight ? "justify-end" : "justify-start"} gap-2`}>
              {/* Avatar — lado esquerdo */}
              {!showOnRight && (
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center mt-1 flex-shrink-0 ${isBot ? "bg-violet-500/15" : "bg-amber-500/10"}`}
                  title={isBot ? "Assistente IA Chamô" : "Atendente Chamô"}
                >
                  {isBot ? (
                    <Bot className="w-4 h-4 text-violet-600" />
                  ) : (
                    <img src="/icon-192.png" alt="Chamô" className="w-7 h-7 rounded-full object-cover" />
                  )}
                </div>
              )}

              {/* Bolha da mensagem */}
              <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${
                showOnRight && isBot
                  ? "bg-violet-500/15 border border-violet-400/30 rounded-br-md text-foreground"   // IA no admin: roxo
                  : showOnRight && isMine
                  ? "bg-primary text-primary-foreground rounded-br-md"                              // Próprio: azul/laranja
                  : isHumanAgent
                  ? "bg-amber-500/10 border border-amber-500/20 rounded-bl-md text-foreground"      // Atendente humano: âmbar
                  : "bg-muted/60 border rounded-bl-md text-foreground"                              // Cliente (admin view)
              }`}>
                {isBot && (
                  <p className="text-[9px] font-semibold text-violet-600 dark:text-violet-400 mb-1 flex items-center gap-1">
                    <Bot className="w-2.5 h-2.5" /> Assistente Chamô
                  </p>
                )}
                {isHumanAgent && !isAdminView && (
                  <p className="text-[9px] font-semibold text-amber-700 dark:text-amber-400 mb-1">Atendente Chamô</p>
                )}
                {renderContent(msg)}
                <p className={`text-[9px] mt-1 ${showOnRight && isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>

              {/* Avatar — lado direito (IA no admin view) */}
              {showOnRight && isBot && (
                <div className="w-7 h-7 rounded-full bg-violet-500/15 flex items-center justify-center mt-1 flex-shrink-0" title="Assistente IA Chamô">
                  <Bot className="w-4 h-4 text-violet-600" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
        </div>
      </main>

      {!isClosed && (
        <div
          className="flex-shrink-0 bg-background border-t px-4 py-3"
          style={{
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <p className="text-[11px] text-muted-foreground mb-2 max-w-screen-lg mx-auto">Essa resposta resolveu seu problema?</p>
          <div className="flex gap-2 mb-2 max-w-screen-lg mx-auto">
            <button
              type="button"
              onClick={() => sendQuickReply("Problema resolvido")}
              disabled={sending}
              className="flex-1 py-2 rounded-xl border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
            >
              Problema resolvido
            </button>
            <button
              type="button"
              onClick={handleRequestHuman}
              disabled={sending || requestingHuman || !!requestedHumanAt}
              className="flex-1 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {requestingHuman ? "Enviando…" : requestedHumanAt ? "Atendente solicitado" : "Falar com atendente"}
            </button>
          </div>
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
                <span className="text-sm text-muted-foreground">{isCompressing ? "Comprimindo imagem..." : "Enviando..."}</span>
              </div>
            ) : (
              <>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,.pdf" />
                <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                </button>
                <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Dúvida ou problema?" className="flex-1 bg-card border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                {text.trim() ? (
                  <button onClick={handleSend} disabled={sending} className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-50"><Send className="w-4 h-4" /></button>
                ) : (
                  <button onClick={startRecording} className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center"><Mic className="w-4 h-4" /></button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <Dialog
        open={!!mediaViewer}
        onOpenChange={(o) => {
          if (!o) {
            setMediaViewer(null);
            setMediaViewerFullscreen(false);
          }
        }}
      >
        <DialogContent
          className={
            mediaViewerFullscreen
              ? "!fixed !inset-0 !left-0 !top-0 z-[80] flex h-[100dvh] max-h-none w-full max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none border-0 bg-black p-0 overflow-hidden shadow-none [&>button]:hidden"
              : "max-w-[min(100vw-1rem,28rem)] p-0 gap-0 overflow-hidden rounded-2xl [&>button]:right-2 [&>button]:top-2"
          }
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {mediaViewer ? (
            <>
              <DialogTitle className="sr-only">
                {mediaViewer.kind === "pdf" ? "Documento" : mediaViewer.kind === "video" ? "Vídeo" : "Imagem"}
              </DialogTitle>
              <div
                className={
                  mediaViewerFullscreen
                    ? "flex items-center justify-between gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-black/80 text-white shrink-0"
                    : "flex items-center justify-between gap-2 border-b px-3 py-2 shrink-0 bg-background"
                }
              >
                <button
                  type="button"
                  className={
                    mediaViewerFullscreen
                      ? "rounded-full p-2 hover:bg-white/10"
                      : "rounded-full p-2 hover:bg-muted"
                  }
                  onClick={() => setMediaViewer(null)}
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
                <p
                  className={
                    mediaViewerFullscreen
                      ? "flex-1 truncate text-center text-xs font-medium"
                      : "flex-1 truncate text-center text-xs font-medium text-foreground"
                  }
                >
                  {mediaViewer.name}
                </p>
                <button
                  type="button"
                  className={
                    mediaViewerFullscreen
                      ? "rounded-full p-2 hover:bg-white/10"
                      : "rounded-full p-2 hover:bg-muted"
                  }
                  onClick={() => setMediaViewerFullscreen((f) => !f)}
                  aria-label={mediaViewerFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              </div>
              <div
                className={
                  mediaViewerFullscreen
                    ? "flex min-h-0 flex-1 items-center justify-center bg-black p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                    : "max-h-[min(70vh,520px)] overflow-auto bg-muted/30 p-2"
                }
              >
                {mediaViewer.kind === "image" ? (
                  <img
                    src={mediaViewer.url}
                    alt=""
                    className={
                      mediaViewerFullscreen
                        ? "max-h-full max-w-full object-contain"
                        : "mx-auto max-h-[min(60vh,480px)] w-auto max-w-full rounded-lg object-contain"
                    }
                  />
                ) : mediaViewer.kind === "video" ? (
                  <video
                    src={mediaViewer.url}
                    controls
                    playsInline
                    className={
                      mediaViewerFullscreen
                        ? "max-h-full max-w-full object-contain"
                        : "mx-auto max-h-[min(60vh,480px)] w-full rounded-lg object-contain"
                    }
                  />
                ) : (
                  <iframe
                    title={mediaViewer.name}
                    src={mediaViewer.url}
                    className={
                      mediaViewerFullscreen
                        ? "h-full min-h-[50vh] w-full flex-1 rounded-none bg-white"
                        : "h-[min(60vh,480px)] w-full rounded-lg border bg-white"
                    }
                  />
                )}
              </div>
              {mediaViewer.kind === "pdf" ? (
                <div
                  className={
                    mediaViewerFullscreen
                      ? "shrink-0 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/80"
                      : "shrink-0 border-t p-3 bg-background"
                  }
                >
                  <a
                    href={mediaViewer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      mediaViewerFullscreen
                        ? "block text-center text-sm text-sky-400 underline"
                        : "block text-center text-sm text-primary underline"
                    }
                  >
                    Abrir PDF no navegador se não carregar aqui
                  </a>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default SupportThread;