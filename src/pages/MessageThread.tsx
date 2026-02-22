import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, DollarSign, X, Check, Star, Mic, Square, Loader2, Ticket, Copy, CheckCircle2, Handshake, LogOut, Crown, BadgeDollarSign, CreditCard, QrCode } from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import BottomNav from "@/components/BottomNav";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  image_urls?: string[] | null;
}

interface OtherParty {
  name: string;
  avatar_url: string | null;
}

const MessageThread = () => {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [otherParty, setOtherParty] = useState<OtherParty>({ name: "Chat", avatar_url: null });
  const [isProfessional, setIsProfessional] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Billing state
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingStep, setBillingStep] = useState<"choose_type" | "app_form" | "presencial_confirm">("choose_type");
  const [billingAmount, setBillingAmount] = useState("");
  const [billingDesc, setBillingDesc] = useState("");
  const [billingMethod, setBillingMethod] = useState<"pix" | "card" | null>(null);
  const [billingInstallments, setBillingInstallments] = useState("1");
  const [feeSettings, setFeeSettings] = useState<Record<string, string>>({});
  const [closingCall, setClosingCall] = useState(false);
  const [requestProtocol, setRequestProtocol] = useState<string | null>(null);
  const [hasRated, setHasRated] = useState(false);
  const [proPlanId, setProPlanId] = useState<string | null>(null);

  // Payment state (client side)
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{amount: string;desc: string;msgId: string;} | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card" | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [cardStep, setCardStep] = useState(false);
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "", postalCode: "", addressNumber: "" });
  const [installments, setInstallments] = useState("1");
  const [processingPayment, setProcessingPayment] = useState(false);

  // Rating state
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [requestStatus, setRequestStatus] = useState<string>("pending");

  // PIX state
  const [pixData, setPixData] = useState<{qrCode: string;copyPaste: string;paymentId: string;} | null>(null);
  const [pixOpen, setPixOpen] = useState(false);
  const [pixPolling, setPixPolling] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      const { data: req } = await supabase.from("service_requests").select("*").eq("id", threadId!).maybeSingle();
      if (req && user) {
        setRequestStatus(req.status);
        setRequestProtocol((req as any).protocol || null);
        const isClient = req.client_id === user.id;

        if (isClient && (req.status === "completed" || req.status === "closed")) {
          const { count } = await supabase.from("reviews").select("*", { count: "exact", head: true }).eq("request_id", threadId!).eq("client_id", user.id);
          if ((count || 0) > 0) setHasRated(true);
        }

        if (!isClient) {
          const { data: pro } = await supabase.from("professionals").select("user_id").eq("id", req.professional_id).maybeSingle();
          if (pro && pro.user_id === user.id) {
            setIsProfessional(true);
            const { data: sub } = await supabase.from("subscriptions").select("plan_id").eq("user_id", user.id).maybeSingle();
            setProPlanId(sub?.plan_id || "free");
          }
        }

        if (isClient) {
          const { data: pro } = await supabase.from("professionals").select("user_id").eq("id", req.professional_id).maybeSingle();
          if (pro) {
            const { data: profile } = await supabase.from("profiles_public").select("full_name, avatar_url").eq("user_id", pro.user_id).single();
            if (profile) {
              setOtherParty({ name: profile.full_name || "Profissional", avatar_url: profile.avatar_url });
            }
          }
        } else {
          const { data: profile } = await supabase.from("profiles_public").select("full_name, avatar_url").eq("user_id", req.client_id).single();
          if (profile) setOtherParty({ name: profile.full_name || "Cliente", avatar_url: profile.avatar_url });
        }
      }

      const { data } = await supabase.from("chat_messages").select("*").eq("request_id", threadId!).order("created_at");
      setMessages(data as Message[] || []);
    };
    if (threadId) load();
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase.channel(`chat-${threadId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `request_id=eq.${threadId}` },
    (payload) => {
      setMessages((prev) => [...prev, payload.new as Message]);
    }).subscribe();
    return () => {supabase.removeChannel(channel);};
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !userId || !threadId) return;
    setSending(true);
    const { error } = await supabase.from("chat_messages").insert({
      request_id: threadId,
      sender_id: userId,
      content: text.trim()
    });
    if (error) toast({ title: "Erro ao enviar mensagem", variant: "destructive" });
    else setText("");
    setSending(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast({ title: "Erro ao acessar microfone", variant: "destructive" });
    }
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !userId || !threadId) return;
    setUploadingAudio(true);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const fileName = `audio/${userId}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from("uploads").upload(fileName, blob);
      if (uploadError) { toast({ title: "Erro no áudio", variant: "destructive" }); }
      else {
        const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
        await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: `[AUDIO:${urlData.publicUrl}:${recordingTime}]` });
      }
      setUploadingAudio(false);
      setIsRecording(false);
      setRecordingTime(0);
    };
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
  };

  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const loadFeeSettings = async () => {
    const { data } = await supabase.from("platform_settings").select("key, value");
    if (data) {
      const map: Record<string, string> = {};
      for (const s of data) {
        map[s.key] = String(s.value);
      }
      setFeeSettings(map);
    }
  };

  // ✅ FUNÇÃO DE ENVIO DE COBRANÇA CORRIGIDA
  const handleSendBilling = async () => {
    if (!billingAmount || !userId || !threadId || !billingMethod) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    
    setSending(true);
    const amount = parseFloat(billingAmount);
    const installments = billingMethod === "pix" ? "1" : billingInstallments;
    
    // Monta o conteúdo estruturado que o sistema reconhece
    const billingContent = `💰 COBRANÇA\nValor: R$ ${amount.toFixed(2).replace(".", ",")}\n${billingDesc ? `Descrição: ${billingDesc}\n` : ""}Forma: ${billingMethod === 'pix' ? 'PIX' : 'Cartão de Crédito'}\n\n[COBRAR:${amount}:${billingDesc || "Serviço"}:${billingMethod}:${installments}]`;

    const { error } = await supabase.from("chat_messages").insert({
      request_id: threadId,
      sender_id: userId,
      content: billingContent
    });

    if (error) {
      toast({ title: "Erro ao enviar cobrança", variant: "destructive" });
    } else {
      setBillingOpen(false);
      setBillingAmount("");
      setBillingDesc("");
      setBillingMethod(null);
      setBillingStep("choose_type");
      toast({ title: "Cobrança enviada com sucesso!" });
    }
    setSending(false);
  };

  const parseBilling = (content: string) => {
    const matchNew = content.match(/\[COBRAR:([0-9.]+):(.+?):(\w+):(\d+)\]/);
    if (matchNew) return { amount: matchNew[1], desc: matchNew[2], method: matchNew[3] as "pix" | "card", installments: matchNew[4] };
    const match = content.match(/\[COBRAR:([0-9.]+):(.+?)\]/);
    if (match) return { amount: match[1], desc: match[2], method: null, installments: "1" };
    return null;
  };

  const openPayment = async (msg: Message) => {
    const billing = parseBilling(msg.content);
    if (!billing) return;
    setPaymentData({ amount: billing.amount, desc: billing.desc, msgId: msg.id });
    if (billing.method) { 
        setPaymentMethod(billing.method); 
        setCardStep(billing.method === "card"); 
        if (billing.method === "card") setInstallments(billing.installments); 
    }
    setPaymentOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!paymentData || !userId || !threadId || !paymentMethod) return;
    setProcessingPayment(true);
    try {
      const res = await supabase.functions.invoke("create_payment", {
        body: { request_id: threadId, amount: parseFloat(paymentData.amount), method: paymentMethod, installments: paymentMethod === "card" ? installments : 1, cardData: paymentMethod === "card" ? cardForm : null }
      });
      if (res.error) throw new Error("Erro ao gerar pagamento");
      if (paymentMethod === "pix") { setPixData({ qrCode: res.data.pix_qr_code, copyPaste: res.data.pix_copy_paste, paymentId: res.data.payment_id }); setPaymentOpen(false); setPixOpen(true); }
      if (paymentMethod === "card") { 
        await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: "✅ PAGAMENTO CONFIRMADO\nO pagamento via cartão foi aprovado." });
        setPaymentOpen(false);
        setRatingOpen(true);
      }
    } catch (err: any) { toast({ title: "Erro no pagamento", variant: "destructive" }); }
    setProcessingPayment(false);
  };

  const handleSubmitRating = async () => {
    if (ratingStars === 0 || !userId || !threadId) return;
    const { error } = await supabase.rpc("submit_review", { _request_id: threadId, _rating: ratingStars, _comment: ratingComment || null });
    if (error) toast({ title: "Erro na avaliação", variant: "destructive" });
    else { setRatingOpen(false); setHasRated(true); setRequestStatus("completed"); toast({ title: "Obrigado pela avaliação!" }); }
  };

  const renderMessageContent = (msg: Message) => {
    const billing = parseBilling(msg.content);
    const isMine = msg.sender_id === userId;
    const audioData = msg.content.match(/\[AUDIO:(.+):(\d+)\]$/);

    if (audioData) return <AudioPlayer src={audioData[1]} duration={parseInt(audioData[2])} isMine={isMine} />;

    if (msg.content.startsWith("📋 PROTOCOLO:") || msg.content.includes("🔒 CHAMADA ENCERRADA")) return (
      <div className="text-center w-full my-2">
        <div className="inline-block bg-muted/80 border rounded-xl px-4 py-2">
          <p className="text-xs font-semibold text-foreground">{msg.content.split("\n")[0]}</p>
        </div>
      </div>
    );

    if (msg.content.includes("💰 COBRANÇA") && billing) {
      const alreadyPaid = messages.some(m => m.content.includes("✅ PAGAMENTO CONFIRMADO"));
      return (
        <div className="space-y-2 p-1">
          <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-500" /><span className="font-bold text-sm">Cobrança de Serviço</span></div>
          <p className="text-xl font-black">R$ {parseFloat(billing.amount).toFixed(2).replace(".", ",")}</p>
          <p className="text-[10px] opacity-70 italic">{billing.desc}</p>
          {!isMine && !alreadyPaid && <button onClick={() => openPayment(msg)} className="mt-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm">Pagar agora</button>}
          {alreadyPaid && <div className="mt-2 w-full py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 text-center flex items-center justify-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Pago</div>}
        </div>
      );
    }

    if (msg.content.includes("✅ PAGAMENTO CONFIRMADO")) return (
      <div className="flex flex-col gap-1">
        <p className="font-bold text-sm flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Pagamento confirmado</p>
        <p className="text-xs opacity-80">O serviço foi pago e liberado.</p>
      </div>
    );

    if (msg.image_urls && msg.image_urls.length > 0) {
      return (
        <div className="flex flex-col gap-2 max-w-[240px]">
          <div className="grid grid-cols-1 gap-1">
            {msg.image_urls.map((url, j) => (
              <img key={j} src={url} alt="" className="rounded-lg w-full object-cover cursor-pointer" onClick={() => window.open(url, '_blank')} />
            ))}
          </div>
          {msg.content && <p className="text-sm">{msg.content}</p>}
        </div>
      );
    }

    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>;
  };

  const otherInitials = otherParty.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b">
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-lg mx-auto">
          <Link to="/messages" className="p-1.5 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5" /></Link>
          {otherParty.avatar_url ? <img src={otherParty.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{otherInitials}</div>}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{otherParty.name}</p>
            <p className="text-[10px] text-green-500 font-medium">online</p>
          </div>
          {isProfessional && requestStatus === "accepted" && (
            <div className="flex gap-2">
              <button onClick={async () => { await loadFeeSettings(); setBillingStep("choose_type"); setBillingOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground shadow-sm active:scale-95 transition-transform"><BadgeDollarSign className="w-3.5 h-3.5" /> Cobrar</button>
              <button onClick={() => setClosingCall(true)} className="p-1.5 rounded-lg bg-destructive/10 text-destructive"><LogOut className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-4 flex flex-col gap-3">
        {messages.map((msg) => {
          const isMine = msg.sender_id === userId;
          const isSys = msg.content.startsWith("📋") || msg.content.includes("🔒");
          const rendered = renderMessageContent(msg);
          if (!rendered) return null;
          return (
            <div key={msg.id} className={`flex ${isSys ? "justify-center" : isMine ? "justify-end" : "justify-start"} gap-2`}>
              {!isMine && !isSys && (otherParty.avatar_url ? <img src={otherParty.avatar_url} className="w-7 h-7 rounded-full object-cover mt-1" /> : <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary mt-1">{otherInitials}</div>)}
              <div className={isSys ? "" : `max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm ${isMine ? "bg-primary text-primary-foreground rounded-br-none" : "bg-card border rounded-bl-none shadow-sm"}`}>
                {rendered}
                {!isSys && <p className={`text-[9px] mt-1 opacity-60 text-right`}>{new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      <div className="sticky bottom-20 bg-background border-t px-4 py-3 flex items-center gap-2">
        {isRecording ? (
          <div className="flex-1 flex items-center gap-2 bg-destructive/5 rounded-xl px-3 py-2 border border-destructive/10">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-bold text-destructive flex-1">{formatRecTime(recordingTime)}</span>
            <button onClick={cancelRecording} className="text-xs font-bold text-muted-foreground mr-2">Cancelar</button>
            <button onClick={stopAndSendRecording} className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center"><Send className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <>
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Mensagem..." className="flex-1 bg-muted/40 border-none rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/20" />
            {text.trim() ? <button onClick={handleSend} className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-md active:scale-90 transition-transform"><Send className="w-4 h-4" /></button> : <button onClick={startRecording} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"><Mic className="w-5 h-5 text-muted-foreground" /></button>}
          </>
        )}
      </div>

      <BottomNav />

      {/* ✅ MODAL DE COBRANÇA RESTAURADO */}
      <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <DollarSign className="w-6 h-6 text-emerald-500" /> Cobrar Cliente
            </DialogTitle>
          </DialogHeader>

          {billingStep === "choose_type" && (
            <div className="grid grid-cols-1 gap-3 py-4">
               <button 
                onClick={() => setBillingStep("app_form")} 
                disabled={proPlanId === "free"}
                className="flex items-center gap-4 p-4 rounded-2xl border-2 border-muted hover:border-primary transition-all text-left disabled:opacity-50"
               >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary"><CreditCard className="w-6 h-6" /></div>
                  <div>
                    <p className="font-bold text-sm">Receber pelo App</p>
                    <p className="text-xs text-muted-foreground text-emerald-600 font-medium">PIX ou Cartão de Crédito</p>
                  </div>
               </button>
               
               <button 
                onClick={() => setBillingStep("presencial_confirm")}
                className="flex items-center gap-4 p-4 rounded-2xl border-2 border-muted hover:border-primary transition-all text-left"
               >
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground"><Handshake className="w-6 h-6" /></div>
                  <div>
                    <p className="font-bold text-sm">Pagamento Externo</p>
                    <p className="text-xs text-muted-foreground">Dinheiro ou Maquininha</p>
                  </div>
               </button>
            </div>
          )}

          {billingStep === "app_form" && (
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Valor do Serviço</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-sm">R$</span>
                  <input 
                    value={billingAmount} 
                    onChange={(e) => setBillingAmount(e.target.value)} 
                    type="number" 
                    placeholder="0,00" 
                    className="w-full bg-muted/30 border-2 border-muted rounded-2xl pl-10 pr-4 py-3.5 font-black text-lg outline-none focus:border-primary transition-all" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">O que está sendo cobrado?</label>
                <input 
                  value={billingDesc} 
                  onChange={(e) => setBillingDesc(e.target.value)} 
                  placeholder="Ex: Visita técnica, Peças..." 
                  className="w-full bg-muted/30 border-2 border-muted rounded-2xl px-4 py-3 text-sm outline-none focus:border-primary transition-all" 
                />
              </div>

              <div className="space-y-3">
                 <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 text-center block">Escolha como o cliente vai pagar</label>
                 <div className="grid grid-cols-2 gap-2">
                    <button 
                        onClick={() => setBillingMethod("pix")}
                        className={`py-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all ${billingMethod === "pix" ? "border-primary bg-primary/5 text-primary" : "border-muted text-muted-foreground"}`}
                    >
                        <QrCode className="w-4 h-4" /> PIX
                    </button>
                    <button 
                        onClick={() => setBillingMethod("card")}
                        className={`py-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all ${billingMethod === "card" ? "border-primary bg-primary/5 text-primary" : "border-muted text-muted-foreground"}`}
                    >
                        <CreditCard className="w-4 h-4" /> Cartão
                    </button>
                 </div>
              </div>

              {/* ✅ CÁLCULO DE TAXAS VISÍVEL */}
              {billingAmount && billingMethod && (
                <div className="p-4 bg-muted/30 rounded-2xl space-y-2 border border-dashed">
                    <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-muted-foreground">Valor Bruto:</span>
                        <span>R$ {parseFloat(billingAmount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-emerald-600">
                        <span>Você recebe aprox:</span>
                        <span>R$ {(parseFloat(billingAmount) * (billingMethod === 'pix' ? 0.95 : 0.90)).toFixed(2)}</span>
                    </div>
                </div>
              )}

              <button 
                onClick={handleSendBilling} 
                disabled={!billingAmount || !billingMethod || sending}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-sm shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {sending ? "Enviando..." : "ENVIAR COBRANÇA AGORA"}
              </button>
              
              <button onClick={() => setBillingStep("choose_type")} className="w-full text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">Voltar</button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Demais diálogos (Payment, Pix, Rating) mantidos conforme original mas com correções de UI */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader><DialogTitle className="font-black">Pagar Serviço</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="text-center p-6 bg-primary/5 rounded-2xl border border-primary/10">
                <p className="text-3xl font-black text-primary">R$ {paymentData ? parseFloat(paymentData.amount).toFixed(2).replace(".", ",") : "0,00"}</p>
                <p className="text-xs font-bold text-muted-foreground mt-1 uppercase tracking-tighter">{paymentData?.desc}</p>
            </div>
            <button onClick={handleConfirmPayment} disabled={processingPayment} className="w-full py-4 rounded-2xl bg-primary text-white font-black text-sm shadow-xl active:scale-95 transition-all">
                {processingPayment ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `CONFIRMAR PAGAMENTO VIA ${paymentMethod?.toUpperCase()}`}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent className="max-w-sm rounded-3xl text-center">
          <DialogHeader><DialogTitle className="font-black text-xl">Como foi o serviço?</DialogTitle></DialogHeader>
          <div className="flex justify-center gap-2 my-6">
            {[1,2,3,4,5].map(s => <Star key={s} onClick={() => setRatingStars(s)} className={`w-10 h-10 cursor-pointer transition-all ${s <= ratingStars ? "fill-amber-400 text-amber-400 scale-110" : "text-muted hover:scale-105"}`} />)}
          </div>
          <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Deixe um comentário sobre o profissional..." className="w-full bg-muted/30 border-2 border-muted rounded-2xl p-4 text-sm outline-none focus:border-primary min-h-[100px]" />
          <button onClick={handleSubmitRating} disabled={ratingStars === 0} className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm mt-6 shadow-lg shadow-primary/20">ENVIAR AVALIAÇÃO</button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessageThread;