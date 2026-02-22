import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, DollarSign, X, Check, Star, Mic, Square, Loader2, Ticket, Copy, CheckCircle2, Handshake, LogOut, Crown, BadgeDollarSign } from "lucide-react";
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

  // Coupon state
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<{type: string;value: number;} | null>(null);

  // Reward coupon state
  const [rewardCoupon, setRewardCoupon] = useState<{type: string;value: number;} | null>(null);
  const [rewardOpen, setRewardOpen] = useState(false);

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
    if (!threadId) return;
    const channel = supabase.channel(`req-status-${threadId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests", filter: `id=eq.${threadId}` },
    (payload) => {
      const updated = payload.new as any;
      setRequestStatus(updated.status);
      if (updated.protocol) setRequestProtocol(updated.protocol);
    }).subscribe();
    return () => {supabase.removeChannel(channel);};
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (threadId && userId) {
      supabase.from("chat_read_status" as any).upsert(
        { request_id: threadId, user_id: userId, last_read_at: new Date().toISOString() },
        { onConflict: "request_id,user_id" }
      ).then();
    }
  }, [messages, threadId, userId]);

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
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast({ title: "Não foi possível acessar o microfone", description: "Verifique as permissões do navegador.", variant: "destructive" });
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = () => { mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop()); };
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !userId || !threadId) return;
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
    const fileName = `audio/${userId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("uploads").upload(fileName, blob, { contentType: mimeType, upsert: true });
    if (uploadError) { toast({ title: "Erro ao enviar áudio", variant: "destructive" }); setUploadingAudio(false); setRecordingTime(0); return; }
    const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
    await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: `[AUDIO:${urlData.publicUrl}:${recordingTime}]` });
    setUploadingAudio(false);
    setRecordingTime(0);
  };

  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const loadFeeSettings = async () => {
    const { data } = await supabase.from("platform_settings").select("key, value");
    if (data) {
      const map: Record<string, string> = {};
      for (const s of data) {
        const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value).replace(/^"|"$/g, "");
        map[s.key] = val;
      }
      setFeeSettings(map);
    }
  };

  const getBillingInstallmentOptions = () => {
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) return [];
    const maxInst = parseInt(feeSettings.max_installments || "12");
    const options = [];
    for (let i = 1; i <= maxInst; i++) {
      const val = (amount / i).toFixed(2).replace(".", ",");
      options.push({ value: String(i), label: `${i}x de R$ ${val}` });
    }
    return options;
  };

  const handleSendBilling = async () => {
    if (!billingAmount || !userId || !threadId || !billingMethod) return;
    const amount = parseFloat(billingAmount);
    const methodLabel = billingMethod === "pix" ? "PIX" : `Cartão ${billingInstallments}x`;
    const billingContent = `💰 COBRANÇA\nValor: R$ ${amount.toFixed(2).replace(".", ",")}\n${billingDesc ? `Descrição: ${billingDesc}\n` : ""}Forma: ${methodLabel}\n\n[COBRAR:${amount}:${billingDesc || "Serviço"}:${billingMethod}:${billingInstallments}]`;
    const { error } = await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: billingContent });
    if (error) toast({ title: "Erro ao enviar cobrança", variant: "destructive" });
    else { setBillingOpen(false); setBillingAmount(""); setBillingDesc(""); setBillingMethod(null); toast({ title: "Cobrança enviada!" }); }
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
    if (billing.method) { setPaymentMethod(billing.method); setCardStep(billing.method === "card"); if (billing.method === "card") setInstallments(billing.installments); }
    else { setPaymentMethod(null); setCardStep(false); setInstallments("1"); }
    setPaymentConfirmed(false);
    setSelectedCouponId(null);
    setCouponDiscount(null);
    setPaymentOpen(true);
    if (userId) {
      const { data } = await supabase.from("coupons").select("*").eq("user_id", userId).eq("coupon_type", "discount").eq("used", false);
      setAvailableCoupons((data || []).filter((c: any) => !c.expires_at || new Date(c.expires_at) > new Date()));
    }
  };

  const getDiscountedAmount = () => {
    if (!paymentData || !couponDiscount) return paymentData ? parseFloat(paymentData.amount) : 0;
    const amount = parseFloat(paymentData.amount);
    return couponDiscount.type === "percentage" ? Math.max(0, amount * (1 - couponDiscount.value / 100)) : Math.max(0, amount - couponDiscount.value);
  };

  const handleConfirmPayment = async () => {
    if (!paymentData || !userId || !threadId || !paymentMethod) return;
    setProcessingPayment(true);
    try {
      const res = await supabase.functions.invoke("create_payment", {
        body: { request_id: threadId, amount: getDiscountedAmount(), method: paymentMethod, installments: paymentMethod === "card" ? installments : 1, cardData: paymentMethod === "card" ? cardForm : null }
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || "Erro ao gerar pagamento");
      if (paymentMethod === "pix") { setPixData({ qrCode: res.data.pix_qr_code, copyPaste: res.data.pix_copy_paste, paymentId: res.data.payment_id }); setPaymentOpen(false); setPixOpen(true); }
      if (paymentMethod === "card") { 
        toast({ title: "Pagamento aprovado!" });
        await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: "✅ PAGAMENTO CONFIRMADO\nPagamento no cartão aprovado com sucesso." });
        setPaymentOpen(false);
        setTimeout(() => { setRatingStars(0); setRatingOpen(true); }, 350);
      }
    } catch (err: any) { toast({ title: err.message || "Erro ao processar pagamento", variant: "destructive" }); }
    setProcessingPayment(false);
  };

  const handleSubmitRating = async () => {
    if (ratingStars === 0 || !userId || !threadId) return;
    const { error } = await supabase.rpc("submit_review", { _request_id: threadId, _rating: ratingStars, _comment: ratingComment || null });
    if (error) toast({ title: "Erro ao registrar avaliação", variant: "destructive" });
    else { setRequestStatus("completed"); setRatingOpen(false); setHasRated(true); toast({ title: "Avaliação enviada!" }); await awardPostPaymentCoupon(); }
  };

  const awardPostPaymentCoupon = async () => {
    if (!userId) return;
    const isDiscount = Math.random() > 0.5;
    if (isDiscount) {
      const { data } = await supabase.from("platform_settings").select("key, value").in("key", ["discount_coupon_percent", "discount_coupon_validity_days"]);
      const settings: any = {}; data?.forEach(s => settings[s.key] = s.value);
      const percent = parseFloat(settings.discount_coupon_percent) || 10;
      const expiresAt = new Date(Date.now() + (parseInt(settings.discount_coupon_validity_days) || 30) * 86400000).toISOString();
      await supabase.from("coupons").insert({ user_id: userId, coupon_type: "discount", source: "payment", discount_percent: percent, expires_at: expiresAt } as any);
      setRewardCoupon({ type: "discount", value: percent });
    } else {
      await supabase.from("coupons").insert({ user_id: userId, coupon_type: "raffle", source: "payment" } as any);
      setRewardCoupon({ type: "raffle", value: 0 });
    }
    setRewardOpen(true);
  };

  const renderMessageContent = (msg: Message) => {
    const billing = parseBilling(msg.content);
    const isMine = msg.sender_id === userId;
    const audioData = msg.content.match(/\[AUDIO:(.+):(\d+)\]$/);

    if (audioData) return <AudioPlayer src={audioData[1]} duration={parseInt(audioData[2])} isMine={isMine} />;

    if (msg.content.startsWith("📋 PROTOCOLO:") || msg.content.includes("🔒 CHAMADA ENCERRADA")) return (
      <div className="text-center w-full">
        <div className="inline-block bg-muted/80 border rounded-xl px-4 py-2">
          <p className="text-xs font-semibold text-foreground">{msg.content.split("\n")[0]}</p>
        </div>
      </div>
    );

    if (msg.content.includes("💰 COBRANÇA") && billing) {
      const alreadyPaid = messages.some(m => m.content.includes("✅ PAGAMENTO CONFIRMADO"));
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2"><DollarSign className="w-4 h-4" /><span className="font-semibold">Cobrança</span></div>
          <p className="text-lg font-bold">R$ {parseFloat(billing.amount).toFixed(2).replace(".", ",")}</p>
          {!isMine && !alreadyPaid && <button onClick={() => openPayment(msg)} className="mt-1 w-full py-2 rounded-lg bg-background/20 backdrop-blur-sm text-xs font-semibold border border-current/20">Pagar agora</button>}
          {alreadyPaid && <div className="mt-2 w-full py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-600 text-center uppercase tracking-wider flex items-center justify-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Pagamento Concluído</div>}
        </div>
      );
    }

    if (msg.content.includes("✅ PAGAMENTO CONFIRMADO")) return (
      <div className="space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><Check className="w-4 h-4" /> Pagamento confirmado</p>
        <p className="text-xs opacity-80">{msg.content.split("\n").slice(1).join(" ")}</p>
      </div>
    );

    // ✅ FIX: TAMANHO REDUZIDO DAS IMAGENS NO NAVEGADOR (Desktop e Mobile)
    if (msg.image_urls && msg.image_urls.length > 0) {
      const gridCols = msg.image_urls.length === 1 ? "grid-cols-1" : "grid-cols-2";
      return (
        <div className="flex flex-col gap-2 w-full max-w-[240px] md:max-w-[320px]">
          <div className={`grid ${gridCols} gap-1.5 w-full`}>
            {msg.image_urls.map((url, j) => (
              <div key={j} className="relative aspect-square w-full overflow-hidden rounded-lg border border-white/10 shadow-sm bg-muted/50">
                <img 
                  src={url} 
                  alt="" 
                  className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform" 
                  onClick={() => window.open(url, '_blank')} 
                />
              </div>
            ))}
          </div>
          {msg.content && <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>}
        </div>
      );
    }

    return <p className="whitespace-pre-wrap">{msg.content}</p>;
  };

  const otherInitials = otherParty.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b">
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-lg mx-auto">
          <Link to="/messages" className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="w-5 h-5 text-foreground" /></Link>
          {otherParty.avatar_url ? <img src={otherParty.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{otherInitials}</div>}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{otherParty.name}</p>
            <p className="text-[10px] text-muted-foreground">online</p>
          </div>
          {isProfessional && requestStatus === "accepted" && (
            <div className="flex gap-2">
              <button onClick={async () => { await loadFeeSettings(); setBillingOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground"><BadgeDollarSign className="w-3.5 h-3.5" /> Cobrar</button>
              <button onClick={async () => { setClosingCall(true); await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: "🔒 CHAMADA ENCERRADA pelo profissional." }); await supabase.from("service_requests").update({ status: "completed" } as any).eq("id", threadId); setRequestStatus("completed"); setClosingCall(false); toast({ title: "Chamada encerrada!" }); }} disabled={closingCall} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold"><LogOut className="w-3.5 h-3.5" /> Encerrar</button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-4 flex flex-col gap-2">
        {isProfessional && requestStatus === "pending" && (
          <div className="bg-card border rounded-2xl p-4 space-y-3 mb-2 text-center">
            <p className="text-sm font-semibold">Nova solicitação de serviço</p>
            <div className="flex gap-2">
              <button onClick={async () => { await supabase.from("service_requests").update({ status: "completed" } as any).eq("id", threadId!); setRequestStatus("rejected"); await supabase.from("chat_messages").insert({ request_id: threadId!, sender_id: userId!, content: "❌ Chamada recusada pelo profissional." }); }} className="flex-1 py-2.5 rounded-xl border-2 border-destructive text-destructive text-sm font-semibold">Recusar</button>
              <button onClick={async () => { await supabase.from("service_requests").update({ status: "accepted" } as any).eq("id", threadId!); setRequestStatus("accepted"); await supabase.from("chat_messages").insert({ request_id: threadId!, sender_id: userId!, content: "✅ Chamada aceita! Vamos conversar." }); }} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Aceitar</button>
            </div>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === userId;
          if (msg.content.includes("AVALIAÇÃO:")) return null;
          const rendered = renderMessageContent(msg);
          if (!rendered) return null;
          const isSys = msg.content.startsWith("📋") || msg.content.includes("🔒");
          return (
            <div key={msg.id} className={`flex ${isSys ? "justify-center" : isMine ? "justify-end" : "justify-start"} gap-2`}>
              {!isMine && !isSys && (otherParty.avatar_url ? <img src={otherParty.avatar_url} className="w-7 h-7 rounded-full object-cover mt-1" /> : <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary mt-1">{otherInitials}</div>)}
              <div className={isSys ? "" : `max-w-[90%] md:max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${isMine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border rounded-bl-md"}`}>
                {rendered}
                {!isSys && <p className={`text-[9px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {requestStatus === "completed" || requestStatus === "closed" || requestStatus === "rejected" ? (
        <div className="sticky bottom-20 bg-muted/50 border-t px-4 py-3 text-center space-y-2">
          <p className="text-sm text-muted-foreground">{requestStatus === "rejected" ? "Chamada recusada" : "Serviço finalizado"}</p>
          {!isProfessional && !hasRated && requestStatus !== "rejected" && (
            <button onClick={() => { setRatingStars(0); setRatingOpen(true); }} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 mx-auto"><Star className="w-4 h-4" /> Avaliar profissional</button>
          )}
          {!isProfessional && hasRated && <p className="text-xs text-muted-foreground">✅ Avaliação enviada</p>}
        </div>
      ) : (
        <div className="sticky bottom-20 bg-background border-t px-4 py-3 flex items-center gap-2">
          {isRecording ? (
            <>
              <button onClick={cancelRecording} className="w-10 h-10 rounded-xl bg-muted text-destructive flex items-center justify-center"><X className="w-4 h-4" /></button>
              <div className="flex-1 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" /><span className="text-sm font-medium text-destructive">{formatRecTime(recordingTime)}</span>
              </div>
              <button onClick={stopAndSendRecording} className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"><Send className="w-4 h-4" /></button>
            </>
          ) : uploadingAudio ? (
            <div className="flex-1 flex items-center justify-center gap-2 py-2.5"><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Enviando...</span></div>
          ) : (
            <>
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Digite sua mensagem..." className="flex-1 bg-card border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              {text.trim() ? <button onClick={handleSend} disabled={sending} className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"><Send className="w-4 h-4" /></button> : <button onClick={startRecording} className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"><Mic className="w-4 h-4" /></button>}
            </>
          )}
        </div>
      )}

      <BottomNav />

      {/* DIALOGS (MANTIDOS IGUAIS) */}
      <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary" /> Cobrar</DialogTitle></DialogHeader>
          {billingStep === "choose_type" && (
            <div className="space-y-3 pt-2">
              <button onClick={() => setBillingStep("app_form")} disabled={proPlanId === "free"} className={`w-full py-4 rounded-xl border-2 flex items-center gap-3 px-4 ${proPlanId === "free" ? "opacity-50" : "hover:border-primary/50"}`}><div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary" /></div><div className="text-left"><p className="text-sm font-semibold">Cobrar pelo app</p><p className="text-xs text-muted-foreground">PIX ou Cartão</p></div></button>
              {proPlanId === "free" && <Link to="/subscriptions" className="block text-center text-xs text-primary font-bold">Assine o Pro para cobrar pelo App</Link>}
              <button onClick={() => setBillingStep("presencial_confirm")} className="w-full py-4 rounded-xl border-2 flex items-center gap-3 px-4 hover:border-primary/50"><div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><Handshake className="w-5 h-5" /></div><div className="text-left"><p className="text-sm font-semibold">Pagamento presencial</p><p className="text-xs text-muted-foreground">Dinheiro ou Máquina</p></div></button>
            </div>
          )}
          {billingStep === "app_form" && (
            <div className="space-y-3">
              <input value={billingAmount} onChange={(e) => setBillingAmount(e.target.value)} type="number" placeholder="Valor (R$)" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
              <input value={billingDesc} onChange={(e) => setBillingDesc(e.target.value)} placeholder="Descrição" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
              <button onClick={handleSendBilling} disabled={!billingAmount} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold">Enviar Cobrança</button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-center p-4 bg-muted/50 rounded-xl"><p className="text-2xl font-bold">R$ {getDiscountedAmount().toFixed(2)}</p><p className="text-xs text-muted-foreground">{paymentData?.desc}</p></div>
            {!cardStep ? (
              <div className="space-y-2">
                <button onClick={() => setPaymentMethod("pix")} className={`w-full p-3 rounded-xl border-2 ${paymentMethod === "pix" ? "border-primary" : ""}`}>PIX</button>
                <button onClick={() => {setPaymentMethod("card"); setCardStep(true);}} className={`w-full p-3 rounded-xl border-2 ${paymentMethod === "card" ? "border-primary" : ""}`}>Cartão de Crédito</button>
                {paymentMethod === "pix" && <button onClick={handleConfirmPayment} disabled={processingPayment} className="w-full py-3 rounded-xl bg-primary text-white font-bold">Gerar QR Code PIX</button>}
              </div>
            ) : (
              <div className="space-y-3">
                <input value={cardForm.number} onChange={(e) => setCardForm(f => ({...f, number: e.target.value}))} placeholder="Número do Cartão" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
                <input value={cardForm.name} onChange={(e) => setCardForm(f => ({...f, name: e.target.value}))} placeholder="Nome no Cartão" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
                <div className="flex gap-2">
                  <input value={cardForm.expiry} onChange={(e) => setCardForm(f => ({...f, expiry: e.target.value}))} placeholder="MM/AA" className="flex-1 border rounded-xl px-3 py-2.5 text-sm" />
                  <input value={cardForm.cvv} onChange={(e) => setCardForm(f => ({...f, cvv: e.target.value}))} placeholder="CVV" className="flex-1 border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <button onClick={handleConfirmPayment} disabled={processingPayment} className="w-full py-3 rounded-xl bg-primary text-white font-bold">Pagar Agora</button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pixOpen} onOpenChange={setPixOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle>Pagamento PIX</DialogTitle></DialogHeader>
          {pixData && (
            <>
              <img src={`data:image/png;base64,${pixData.qrCode}`} className="w-48 h-48 mx-auto" alt="QR Code" />
              <textarea readOnly value={pixData.copyPaste} className="w-full text-xs border p-2 rounded-lg bg-muted" rows={3} />
              <button onClick={() => { navigator.clipboard.writeText(pixData.copyPaste); toast({title: "Copiado!"}); }} className="w-full py-2 bg-primary/10 text-primary font-bold rounded-lg mt-2">Copiar Código</button>
              <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Aguardando pagamento...</div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle>Avalie o serviço</DialogTitle></DialogHeader>
          <div className="flex justify-center gap-2 my-4">
            {[1,2,3,4,5].map(s => <Star key={s} onClick={() => setRatingStars(s)} className={`w-8 h-8 cursor-pointer ${s <= ratingStars ? "fill-amber-400 text-amber-400" : "text-muted"}`} />)}
          </div>
          <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Comentário opcional" className="w-full border rounded-xl p-2 text-sm" rows={3} />
          <button onClick={handleSubmitRating} disabled={ratingStars === 0} className="w-full py-3 bg-primary text-white rounded-xl font-bold mt-4">Enviar Avaliação</button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessageThread;