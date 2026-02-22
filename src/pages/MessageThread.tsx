import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, DollarSign, X, Check, Star, Mic, Square, Loader2, Ticket, Copy, CheckCircle2, Handshake, LogOut, Crown, BadgeDollarSign, CreditCard, QrCode } from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import BottomNav from "@/components/BottomNav";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const pixIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
            if (profile) setOtherParty({ name: profile.full_name || "Profissional", avatar_url: profile.avatar_url });
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

  const handleSendBilling = async () => {
    if (!billingAmount || !userId || !threadId || !billingMethod) return;
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    const installments = billingMethod === "pix" ? "1" : billingInstallments;
    const methodLabel = billingMethod === "pix" ? "PIX" : `Cartão ${installments}x`;
    const billingContent = `💰 COBRANÇA\nValor: R$ ${amount.toFixed(2).replace(".", ",")}\n${billingDesc ? `Descrição: ${billingDesc}\n` : ""}Forma: ${methodLabel}\n\n[COBRAR:${amount}:${billingDesc || "Serviço"}:${billingMethod}:${installments}]`;

    const { error } = await supabase.from("chat_messages").insert({
      request_id: threadId,
      sender_id: userId,
      content: billingContent
    });

    if (error) toast({ title: "Erro ao enviar", variant: "destructive" });
    else {
      setBillingOpen(false);
      setBillingAmount("");
      setBillingDesc("");
      setBillingMethod(null);
      toast({ title: "Cobrança enviada!" });
    }
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
    } else {
        setPaymentMethod(null);
        setCardStep(false);
    }
    setPaymentOpen(true);
  };

  // ✅ LÓGICA DE PAGAMENTO COMPLETA DO LOVABLE (CARTOON + PIX + CPF CHECK)
  const handleConfirmPayment = async () => {
    if (!paymentMethod || !paymentData || !userId || !threadId) return;

    if (paymentMethod === "card") {
      if (!cardForm.number || !cardForm.name || !cardForm.expiry || !cardForm.cvv) {
        toast({ title: "Preencha todos os dados do cartão", variant: "destructive" });
        return;
      }
    }

    setProcessingPayment(true);
    try {
        // Validação de Perfil (CPF/CNPJ)
        const { data: profile } = await supabase.from("profiles").select("full_name, email, cpf, cnpj, phone, address_zip, address_number").eq("user_id", userId).single();

        if (!profile?.cpf && !profile?.cnpj) {
          toast({ title: "Cadastre seu CPF ou CNPJ no perfil antes de pagar.", variant: "destructive" });
          setProcessingPayment(false);
          setPaymentOpen(false);
          navigate("/profile");
          return;
        }

        const expiryParts = cardForm.expiry.split("/");
        const res = await supabase.functions.invoke("create_payment", {
          body: {
            action: "create_service_payment",
            request_id: threadId,
            amount: parseFloat(paymentData.amount),
            billing_type: paymentMethod === "pix" ? "PIX" : "CREDIT_CARD",
            installment_count: parseInt(installments),
            credit_card: paymentMethod === "card" ? {
              holder_name: cardForm.name,
              number: cardForm.number.replace(/\s/g, ""),
              expiry_month: expiryParts[0],
              expiry_year: `20${expiryParts[1]}`,
              cvv: cardForm.cvv
            } : null,
            credit_card_holder_info: paymentMethod === "card" ? {
              name: profile.full_name || cardForm.name,
              email: profile.email || "",
              cpf_cnpj: profile.cpf || profile.cnpj || "",
              postal_code: profile.address_zip || cardForm.postalCode || "",
              address_number: profile.address_number || cardForm.addressNumber || "",
              phone: profile.phone || ""
            } : null
          }
        });

        if (res.error || res.data?.error) throw new Error(res.data?.error || "Erro no processamento");

        if (paymentMethod === "pix") {
            setPixData({ qrCode: res.data.pix_qr_code, copyPaste: res.data.pix_copy_paste, paymentId: res.data.payment_id });
            setPaymentOpen(false);
            setPixOpen(true);
            setPixPolling(true);
            
            // Polling do PIX
            if (pixIntervalRef.current) clearInterval(pixIntervalRef.current);
            pixIntervalRef.current = setInterval(async () => {
                const check = await supabase.functions.invoke("create_payment", { body: { action: "check_payment_status", payment_id: res.data.payment_id } });
                if (check.data?.confirmed) {
                    clearInterval(pixIntervalRef.current!);
                    setPixOpen(false);
                    await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: "✅ PAGAMENTO CONFIRMADO\nO pagamento via PIX foi aprovado." });
                    setRatingOpen(true);
                }
            }, 5000);
        } else {
            // Cartão Aprovado
            toast({ title: "Pagamento aprovado!" });
            await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: "✅ PAGAMENTO CONFIRMADO\nO pagamento via cartão foi aprovado." });
            setPaymentOpen(false);
            setRatingOpen(true);
        }
    } catch (err: any) {
      toast({ title: err.message || "Erro no pagamento", variant: "destructive" });
    }
    setProcessingPayment(false);
  };

  const handleSubmitRating = async () => {
    if (ratingStars === 0 || !userId || !threadId) return;
    const { error } = await supabase.rpc("submit_review", { _request_id: threadId, _rating: ratingStars, _comment: ratingComment || null });
    if (error) toast({ title: "Erro na avaliação", variant: "destructive" });
    else { setRatingOpen(false); setHasRated(true); setRequestStatus("completed"); toast({ title: "Obrigado!" }); }
  };

  const renderMessageContent = (msg: Message) => {
    const billing = parseBilling(msg.content);
    const isMine = msg.sender_id === userId;
    const audioData = msg.content.match(/\[AUDIO:(.+):(\d+)\]$/);

    if (audioData) return <AudioPlayer src={audioData[1]} duration={parseInt(audioData[2])} isMine={isMine} />;

    if (msg.content.includes("💰 COBRANÇA") && billing) {
      const alreadyPaid = messages.some(m => m.content.includes("✅ PAGAMENTO CONFIRMADO"));
      return (
        <div className="space-y-2 p-1">
          <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-500" /><span className="font-bold text-sm">Cobrança</span></div>
          <p className="text-xl font-black">R$ {parseFloat(billing.amount).toFixed(2).replace(".", ",")}</p>
          {!isMine && !alreadyPaid && <button onClick={() => openPayment(msg)} className="mt-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-sm">Pagar agora</button>}
          {alreadyPaid && <div className="mt-2 w-full py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 text-center flex items-center justify-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Pago</div>}
        </div>
      );
    }

    if (msg.content.includes("✅ PAGAMENTO CONFIRMADO")) return (
      <div className="flex flex-col gap-1">
        <p className="font-bold text-sm flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Pagamento confirmado</p>
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

    return <p className="whitespace-pre-wrap text-sm">{msg.content}</p>;
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
              <button onClick={async () => { await loadFeeSettings(); setBillingStep("choose_type"); setBillingOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground shadow-sm"><BadgeDollarSign className="w-3.5 h-3.5" /> Cobrar</button>
              <button onClick={() => setClosingCall(true)} className="p-1.5 rounded-lg bg-destructive/10 text-destructive"><LogOut className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-4 flex flex-col gap-3">
        {messages.map((msg) => {
          const isMine = msg.sender_id === userId;
          const rendered = renderMessageContent(msg);
          if (!rendered || msg.content.includes("AVALIAÇÃO:")) return null;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} gap-2`}>
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm ${isMine ? "bg-primary text-primary-foreground rounded-br-none" : "bg-card border rounded-bl-none shadow-sm"}`}>
                {rendered}
                <p className={`text-[9px] mt-1 opacity-60 text-right`}>{new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      <div className="sticky bottom-20 bg-background border-t px-4 py-3 flex items-center gap-2">
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Mensagem..." className="flex-1 bg-muted/40 border-none rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/20" />
            {text.trim() ? <button onClick={handleSend} className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-md"><Send className="w-4 h-4" /></button> : <button onClick={startRecording} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><Mic className="w-5 h-5 text-muted-foreground" /></button>}
      </div>

      <BottomNav />

      {/* MODAL DE COBRANÇA */}
      <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6">
          <DialogHeader><DialogTitle className="flex items-center gap-2 font-black"><DollarSign className="w-6 h-6 text-emerald-500" /> Cobrar</DialogTitle></DialogHeader>
          {billingStep === "choose_type" && (
            <div className="grid gap-3 py-4">
               <button onClick={() => setBillingStep("app_form")} className="flex items-center gap-4 p-4 rounded-2xl border-2 border-muted hover:border-primary text-left">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary"><CreditCard className="w-6 h-6" /></div>
                  <div><p className="font-bold text-sm">Pelo App</p><p className="text-xs text-emerald-600 font-medium">PIX ou Cartão</p></div>
               </button>
               <button onClick={() => setBillingStep("presencial_confirm")} className="flex items-center gap-4 p-4 rounded-2xl border-2 border-muted hover:border-primary text-left">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground"><Handshake className="w-6 h-6" /></div>
                  <div><p className="font-bold text-sm">Presencial</p><p className="text-xs text-muted-foreground">Dinheiro ou Maquina</p></div>
               </button>
            </div>
          )}
          {billingStep === "app_form" && (
            <div className="space-y-4">
              <input value={billingAmount} onChange={(e) => setBillingAmount(e.target.value)} type="number" placeholder="Valor R$" className="w-full bg-muted/30 border-2 rounded-2xl px-4 py-3 font-black text-lg outline-none" />
              <input value={billingDesc} onChange={(e) => setBillingDesc(e.target.value)} placeholder="O que está cobrando?" className="w-full bg-muted/30 border-2 rounded-2xl px-4 py-3 text-sm outline-none" />
              <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setBillingMethod("pix")} className={`py-3 rounded-xl border-2 font-bold text-xs ${billingMethod === "pix" ? "border-primary bg-primary/5 text-primary" : ""}`}>PIX</button>
                    <button onClick={() => setBillingMethod("card")} className={`py-3 rounded-xl border-2 font-bold text-xs ${billingMethod === "card" ? "border-primary bg-primary/5 text-primary" : ""}`}>Cartão</button>
              </div>
              <button onClick={handleSendBilling} disabled={!billingAmount || !billingMethod} className="w-full py-4 rounded-2xl bg-primary text-white font-black text-sm shadow-lg">ENVIAR COBRANÇA</button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ✅ MODAL DE PAGAMENTO (FUSÃO LOVABLE + VS CODE) */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader><DialogTitle className="font-black">{cardStep ? "Dados do Cartão" : "Pagar Serviço"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-center p-6 bg-primary/5 rounded-2xl border border-primary/10">
                <p className="text-3xl font-black text-primary">R$ {paymentData ? parseFloat(paymentData.amount).toFixed(2).replace(".", ",") : "0,00"}</p>
                <p className="text-xs font-bold text-muted-foreground mt-1 uppercase">{paymentData?.desc}</p>
            </div>

            {!cardStep ? (
                <div className="space-y-2">
                    <button onClick={() => handleConfirmPayment()} className="w-full py-4 rounded-2xl bg-primary text-white font-black text-sm shadow-xl">
                        {paymentMethod === 'pix' ? 'GERAR QR CODE PIX' : 'PROSSEGUIR COM CARTÃO'}
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <input value={cardForm.number} onChange={(e) => setCardForm(f => ({...f, number: e.target.value}))} placeholder="0000 0000 0000 0000" className="w-full bg-muted/30 border-2 rounded-xl px-4 py-2.5 text-sm" />
                    <input value={cardForm.name} onChange={(e) => setCardForm(f => ({...f, name: e.target.value.toUpperCase()}))} placeholder="NOME NO CARTÃO" className="w-full bg-muted/30 border-2 rounded-xl px-4 py-2.5 text-sm uppercase" />
                    <div className="grid grid-cols-2 gap-2">
                        <input value={cardForm.expiry} onChange={(e) => setCardForm(f => ({...f, expiry: e.target.value}))} placeholder="MM/AA" className="w-full bg-muted/30 border-2 rounded-xl px-4 py-2.5 text-sm" />
                        <input value={cardForm.cvv} onChange={(e) => setCardForm(f => ({...f, cvv: e.target.value}))} placeholder="CVV" className="w-full bg-muted/30 border-2 rounded-xl px-4 py-2.5 text-sm" />
                    </div>
                    <select value={installments} onChange={(e) => setInstallments(e.target.value)} className="w-full bg-muted/30 border-2 rounded-xl px-4 py-2.5 text-sm">
                        <option value="1">1x de R$ {paymentData?.amount}</option>
                        <option value="2">2x de R$ {(parseFloat(paymentData?.amount || '0') / 2).toFixed(2)}</option>
                        <option value="3">3x de R$ {(parseFloat(paymentData?.amount || '0') / 3).toFixed(2)}</option>
                    </select>
                    <button onClick={handleConfirmPayment} disabled={processingPayment} className="w-full py-4 rounded-2xl bg-primary text-white font-black text-sm shadow-xl">
                        {processingPayment ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "PAGAR AGORA"}
                    </button>
                </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL PIX */}
      <Dialog open={pixOpen} onOpenChange={setPixOpen}>
        <DialogContent className="max-w-sm rounded-3xl text-center">
          <DialogHeader><DialogTitle>Pagar com PIX</DialogTitle></DialogHeader>
          {pixData && (
            <div className="space-y-4">
              <img src={`data:image/png;base64,${pixData.qrCode}`} className="w-48 h-48 mx-auto border p-2 rounded-xl" />
              <button onClick={() => { navigator.clipboard.writeText(pixData.copyPaste); toast({title: "Copiado!"}); }} className="w-full py-3 bg-primary/10 text-primary font-black rounded-xl">COPIAR CÓDIGO PIX</button>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground animate-pulse"><Loader2 className="w-3 h-3 animate-spin" /> Aguardando pagamento...</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL AVALIAÇÃO */}
      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent className="max-w-sm rounded-3xl text-center p-8">
          <DialogHeader><DialogTitle className="font-black text-xl">Como foi o serviço?</DialogTitle></DialogHeader>
          <div className="flex justify-center gap-2 my-6">
            {[1,2,3,4,5].map(s => <Star key={s} onClick={() => setRatingStars(s)} className={`w-10 h-10 cursor-pointer ${s <= ratingStars ? "fill-amber-400 text-amber-400 scale-110" : "text-muted"}`} />)}
          </div>
          <button onClick={handleSubmitRating} disabled={ratingStars === 0} className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm shadow-lg shadow-primary/20">ENVIAR AVALIAÇÃO</button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessageThread;