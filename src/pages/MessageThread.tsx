import { useParams, Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Send, DollarSign, X, Check, Star, Mic, Square, 
  Loader2, Ticket, Copy, CheckCircle2, Handshake, LogOut, 
  Crown, BadgeDollarSign, CreditCard, QrCode, Image as ImageIcon,
  ShieldCheck, Clock, Info
} from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import BottomNav from "@/components/BottomNav";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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

  // --- ESTADOS DO PROFISSIONAL (Billing) ---
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

  // --- ESTADOS DO CLIENTE (Payment) ---
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{amount: string; desc: string; msgId: string;} | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card" | null>(null);
  const [cardStep, setCardStep] = useState(false);
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "", postalCode: "", addressNumber: "" });
  const [installments, setInstallments] = useState("1");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<{type: string; value: number;} | null>(null);

  // --- ESTADOS DE AVALIAÇÃO E RECOMPENSA ---
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [requestStatus, setRequestStatus] = useState<string>("pending");
  const [rewardCoupon, setRewardCoupon] = useState<{type: string; value: number;} | null>(null);
  const [rewardOpen, setRewardOpen] = useState(false);

  // --- ESTADOS DO PIX ---
  const [pixData, setPixData] = useState<{qrCode: string; copyPaste: string; paymentId: string;} | null>(null);
  const [pixOpen, setPixOpen] = useState(false);
  const [pixPolling, setPixPolling] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const pixIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- ESTADOS DE ÁUDIO ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- CARREGAMENTO INICIAL ---
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: req } = await supabase.from("service_requests").select("*").eq("id", threadId!).maybeSingle();
      if (req) {
        setRequestStatus(req.status);
        setRequestProtocol((req as any).protocol || null);
        const isClient = req.client_id === user.id;

        // Check if user is the professional
        const { data: pro } = await supabase.from("professionals").select("user_id, id").eq("id", req.professional_id).maybeSingle();
        if (pro && pro.user_id === user.id) {
          setIsProfessional(true);
          const { data: sub } = await supabase.from("subscriptions").select("plan_id").eq("user_id", user.id).maybeSingle();
          setProPlanId(sub?.plan_id || "free");
        }

        // Ratings check for client
        if (isClient && (req.status === "completed" || req.status === "closed")) {
          const { count } = await supabase.from("reviews").select("*", { count: "exact", head: true }).eq("request_id", threadId!).eq("client_id", user.id);
          if ((count || 0) > 0) setHasRated(true);
        }

        // Load names/avatars
        if (isClient) {
          if (pro) {
            const { data: profile } = await supabase.from("profiles_public").select("full_name, avatar_url").eq("user_id", pro.user_id).single();
            if (profile) setOtherParty({ name: profile.full_name || "Profissional", avatar_url: profile.avatar_url });
          }
        } else {
          const { data: profile } = await supabase.from("profiles_public").select("full_name, avatar_url").eq("user_id", req.client_id).single();
          if (profile) setOtherParty({ name: profile.full_name || "Cliente", avatar_url: profile.avatar_url });
        }
      }

      const { data: chatData } = await supabase.from("chat_messages").select("*").eq("request_id", threadId!).order("created_at");
      setMessages(chatData as Message[] || []);
    };
    if (threadId) load();
  }, [threadId]);

  // --- REALTIME SYNC ---
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase.channel(`chat-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `request_id=eq.${threadId}` },
      (payload) => setMessages((prev) => [...prev, payload.new as Message]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests", filter: `id=eq.${threadId}` },
      (payload) => {
        const updated = payload.new as any;
        setRequestStatus(updated.status);
        if (updated.protocol) setRequestProtocol(updated.protocol);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  // --- AUTO-SCROLL AND READ MARKER ---
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (threadId && userId) {
      supabase.from("chat_read_status" as any).upsert(
        { request_id: threadId, user_id: userId, last_read_at: new Date().toISOString() },
        { onConflict: "request_id,user_id" }
      ).then();
    }
  }, [messages, threadId, userId]);

  // --- MESSAGE ACTIONS ---
  const handleSend = async () => {
    if (!text.trim() || !userId || !threadId) return;
    setSending(true);
    const { error } = await supabase.from("chat_messages").insert({
      request_id: threadId,
      sender_id: userId,
      content: text.trim()
    });
    if (error) toast({ title: "Erro ao enviar", variant: "destructive" });
    else setText("");
    setSending(false);
  };

  // --- AUDIO LOGIC ---
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
    } catch { toast({ title: "Acesso ao microfone negado", variant: "destructive" }); }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
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
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    setIsRecording(false);
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (blob.size < 1000) { setUploadingAudio(false); setRecordingTime(0); return; }
    const fileName = `audio/${userId}/${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage.from("uploads").upload(fileName, blob);
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
      await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: `[AUDIO:${urlData.publicUrl}:${recordingTime}]` });
    }
    setUploadingAudio(false);
    setRecordingTime(0);
  };

  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // --- BILLING LOGIC (PROFESSIONAL) ---
  const loadFeeSettings = async () => {
    const { data } = await supabase.from("platform_settings").select("key, value");
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(s => map[s.key] = String(s.value));
      setFeeSettings(map);
    }
  };

  const getBillingFeeLabel = () => {
    if (!billingMethod || !billingAmount) return null;
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) return null;
    if (billingMethod === "pix") {
      const pct = parseFloat(feeSettings.pix_fee_pct || "0");
      const fixed = parseFloat(feeSettings.pix_fee_fixed || "0");
      const fee = amount * pct / 100 + fixed;
      return { fee, label: `Taxa PIX: ${pct}%${fixed > 0 ? ` + R$ ${fixed.toFixed(2)}` : ""} = R$ ${fee.toFixed(2)}` };
    }
    if (billingMethod === "card") {
      const pct = parseFloat(feeSettings.card_fee_pct || "0");
      const fee = amount * pct / 100;
      return { fee, label: `Taxa Cartão: ${pct}% = R$ ${fee.toFixed(2)}` };
    }
    return null;
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
    const feeInfo = getBillingFeeLabel();
    const feeText = feeInfo ? `\nTaxa: ${feeInfo.label}` : "";
    const billingContent = `💰 COBRANÇA\nValor: R$ ${amount.toFixed(2).replace(".", ",")}\n${billingDesc ? `Descrição: ${billingDesc}\n` : ""}Forma: ${methodLabel}${feeText}\n\n[COBRAR:${amount}:${billingDesc || "Serviço"}:${billingMethod}:${billingInstallments}]`;

    const { error } = await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: billingContent });
    if (!error) {
      setBillingOpen(false);
      setBillingAmount("");
      setBillingDesc("");
      setBillingMethod(null);
      toast({ title: "Cobrança enviada com sucesso!" });
    }
  };

  // --- PAYMENT LOGIC (CLIENT) ---
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
    // Load coupons
    if (userId) {
      const { data } = await supabase.from("coupons").select("*").eq("user_id", userId).eq("coupon_type", "discount").eq("used", false);
      setAvailableCoupons(data || []);
    }
  };

  const getDiscountedAmount = () => {
    if (!paymentData || !couponDiscount) return paymentData ? parseFloat(paymentData.amount) : 0;
    const amount = parseFloat(paymentData.amount);
    return couponDiscount.type === "percentage" ? Math.max(0, amount * (1 - couponDiscount.value / 100)) : Math.max(0, amount - couponDiscount.value);
  };

  const formatCardNumber = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
  const formatExpiry = (v: string) => v.replace(/\D/g, "").slice(0, 4).replace(/(\d{2})(?=\d)/, "$1/");

  const handleConfirmPayment = async () => {
    if (!paymentMethod || !paymentData || !userId || !threadId) return;
    if (paymentMethod === "card" && (!cardForm.number || !cardForm.name || !cardForm.expiry || !cardForm.cvv)) {
      toast({ title: "Preencha todos os dados do cartão", variant: "destructive" });
      return;
    }

    setProcessingPayment(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
      if (!profile?.cpf && !profile?.cnpj) {
        toast({ title: "Cadastre seu CPF/CNPJ no perfil primeiro." });
        setPaymentOpen(false);
        navigate("/profile");
        return;
      }

      const expiryParts = cardForm.expiry.split("/");
      const finalAmount = getDiscountedAmount();
      
      const res = await supabase.functions.invoke("create_payment", {
        body: {
          action: "create_service_payment",
          request_id: threadId,
          amount: finalAmount,
          billing_type: paymentMethod === "pix" ? "PIX" : "CREDIT_CARD",
          installment_count: parseInt(installments),
          credit_card: paymentMethod === "card" ? {
            holder_name: cardForm.name,
            number: cardForm.number.replace(/\s/g, ""),
            expiry_month: expiryParts[0],
            expiry_year: `20${expiryParts[1]}`,
            cvv: cardForm.cvv
          } : null,
          credit_card_holder_info: {
            name: profile.full_name || cardForm.name,
            email: profile.email || "",
            cpf_cnpj: profile.cpf || profile.cnpj || "",
            postal_code: profile.address_zip || cardForm.postalCode || "",
            address_number: profile.address_number || cardForm.addressNumber || "",
            phone: profile.phone || ""
          }
        }
      });

      if (res.error || res.data?.error) throw new Error(res.data?.error || "Erro no pagamento");

      if (paymentMethod === "pix") {
        setPixData({ qrCode: res.data.pix_qr_code, copyPaste: res.data.pix_copy_paste, paymentId: res.data.payment_id });
        setPaymentOpen(false);
        setPixOpen(true);
        setPixPolling(true);
        if (pixIntervalRef.current) clearInterval(pixIntervalRef.current);
        pixIntervalRef.current = setInterval(async () => {
          const check = await supabase.functions.invoke("create_payment", { body: { action: "check_payment_status", payment_id: res.data.payment_id } });
          if (check.data?.confirmed) {
            clearInterval(pixIntervalRef.current!);
            setPixOpen(false);
            const discountNote = couponDiscount ? `\nDesconto aplicado.` : "";
            await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: `✅ PAGAMENTO CONFIRMADO\nValor: R$ ${finalAmount.toFixed(2)}${discountNote}\nMétodo: PIX` });
            if (selectedCouponId) await supabase.from("coupons").update({ used: true } as any).eq("id", selectedCouponId);
            setRatingOpen(true);
          }
        }, 5000);
      } else {
        const discountNote = couponDiscount ? `\nDesconto aplicado.` : "";
        await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: `✅ PAGAMENTO CONFIRMADO\nValor: R$ ${finalAmount.toFixed(2)}${discountNote}\nMétodo: Cartão de Crédito` });
        if (selectedCouponId) await supabase.from("coupons").update({ used: true } as any).eq("id", selectedCouponId);
        setPaymentOpen(false);
        setRatingOpen(true);
      }
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setProcessingPayment(false); }
  };

  const handleSubmitRating = async () => {
    if (ratingStars === 0 || !userId || !threadId) return;
    const { error } = await supabase.rpc("submit_review", { _request_id: threadId, _rating: ratingStars, _comment: ratingComment || null });
    if (!error) {
      setRatingOpen(false);
      setHasRated(true);
      setRequestStatus("completed");
      toast({ title: "Avaliação enviada!" });
      // Award coupon logic
      const isDiscount = Math.random() > 0.5;
      if (isDiscount) {
        await supabase.from("coupons").insert({ user_id: userId, coupon_type: "discount", source: "payment", discount_percent: 10 } as any);
        setRewardCoupon({ type: "discount", value: 10 });
      } else {
        await supabase.from("coupons").insert({ user_id: userId, coupon_type: "raffle", source: "payment" } as any);
        setRewardCoupon({ type: "raffle", value: 0 });
      }
      setRewardOpen(true);
    }
  };

  // --- RENDER LOGIC ---
  const renderMessageContent = (msg: Message) => {
    const billing = parseBilling(msg.content);
    const isMine = msg.sender_id === userId;
    const audioMatch = msg.content.match(/\[AUDIO:(.+):(\d+)\]$/);

    if (audioMatch) return <AudioPlayer src={audioMatch[1]} duration={parseInt(audioMatch[2])} isMine={isMine} />;

    if (msg.content.startsWith("📋 PROTOCOLO:") || msg.content.includes("🔒 CHAMADA ENCERRADA")) {
      return (
        <div className="bg-muted/80 border rounded-2xl px-5 py-3 text-center shadow-sm w-full">
          <p className="text-xs font-bold text-foreground mb-1">{msg.content.split("\n")[0].replace("📋 ", "")}</p>
          <p className="text-[10px] text-muted-foreground">Sistema Chamô • Referência de Atendimento</p>
        </div>
      );
    }

    if (msg.content.includes("💰 COBRANÇA") && billing) {
      const alreadyPaid = messages.some(m => m.content.includes("✅ PAGAMENTO CONFIRMADO") || m.content.includes("🤝 Pagamento presencial"));
      return (
        <div className="space-y-3 p-2 min-w-[200px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-500" /><span className="font-black text-sm uppercase tracking-tighter">Cobrança</span></div>
            <ShieldCheck className="w-4 h-4 text-primary opacity-50" />
          </div>
          <div>
            <p className="text-2xl font-black text-foreground">R$ {parseFloat(billing.amount).toFixed(2).replace(".", ",")}</p>
            <p className="text-[11px] font-bold text-muted-foreground uppercase">{billing.desc}</p>
          </div>
          {!isMine && !alreadyPaid && (
            <button onClick={() => openPayment(msg)} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-lg shadow-primary/20 active:scale-95 transition-all">PAGAR AGORA</button>
          )}
          {alreadyPaid && (
            <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center gap-2 text-[10px] font-black uppercase"><CheckCircle2 className="w-4 h-4" /> Pagamento Confirmado</div>
          )}
        </div>
      );
    }

    if (msg.content.includes("✅ PAGAMENTO CONFIRMADO")) {
      return (
        <div className="flex flex-col gap-1 p-1">
          <p className="font-black text-sm text-emerald-600 flex items-center gap-1.5 uppercase tracking-tighter"><CheckCircle2 className="w-5 h-5" /> Serviço Pago</p>
          <p className="text-[11px] text-muted-foreground font-medium">O valor já foi processado e liberado para o profissional.</p>
        </div>
      );
    }

    if (msg.image_urls && msg.image_urls.length > 0) {
      return (
        <div className="flex flex-col gap-2 max-w-[260px]">
          <div className={`grid ${msg.image_urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5`}>
            {msg.image_urls.map((url, j) => (
              <div key={j} className="aspect-square rounded-xl overflow-hidden border border-white/10 shadow-sm bg-muted/20">
                <img src={url} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" onClick={() => window.open(url, '_blank')} />
              </div>
            ))}
          </div>
          {msg.content && <p className="text-sm leading-relaxed">{msg.content}</p>}
        </div>
      );
    }

    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>;
  };

  const otherInitials = otherParty.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b">
        <div className="flex items-center gap-3 px-4 py-3 max-w-screen-lg mx-auto">
          <Link to="/messages" className="p-2 rounded-xl hover:bg-muted transition-all active:scale-90"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="relative">
            {otherParty.avatar_url ? (
              <img src={otherParty.avatar_url} className="w-10 h-10 rounded-full object-cover border-2 border-background shadow-sm" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-black text-primary border-2 border-background shadow-sm">{otherInitials}</div>
            )}
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-foreground truncate tracking-tight">{otherParty.name}</p>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground font-bold uppercase">online agora</p>
            </div>
          </div>
          
          {isProfessional && requestStatus === "accepted" && (
            <div className="flex gap-2">
              <button onClick={async () => { await loadFeeSettings(); setBillingStep("choose_type"); setBillingOpen(true); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-primary text-primary-foreground shadow-lg shadow-primary/20 active:scale-95 transition-all"><BadgeDollarSign className="w-4 h-4" /> COBRAR</button>
              <button onClick={() => setClosingCall(true)} className="p-2.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95 transition-all"><LogOut className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-5 flex flex-col gap-4">
        {/* Professional Action Box */}
        {isProfessional && requestStatus === "pending" && (
          <div className="bg-card border-2 border-primary/20 rounded-3xl p-6 text-center space-y-5 shadow-xl animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto"><Handshake className="w-8 h-8 text-primary" /></div>
            <div>
              <p className="font-black text-base tracking-tight">Nova Chamada de Serviço!</p>
              <p className="text-xs text-muted-foreground mt-1">O cliente está aguardando seu retorno para iniciar.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={async () => { await supabase.from("service_requests").update({ status: "rejected" } as any).eq("id", threadId!); setRequestStatus("rejected"); }} className="py-3.5 rounded-2xl border-2 border-muted font-black text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-muted transition-all">RECUSAR</button>
              <button onClick={async () => { await supabase.from("service_requests").update({ status: "accepted" } as any).eq("id", threadId!); setRequestStatus("accepted"); }} className="py-3.5 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/30 active:scale-95 transition-all">ACEITAR AGORA</button>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_id === userId;
          const isSys = msg.content.startsWith("📋") || msg.content.includes("🔒");
          const rendered = renderMessageContent(msg);
          if (!rendered || msg.content.includes("AVALIAÇÃO:")) return null;

          return (
            <div key={msg.id} className={`flex ${isSys ? "justify-center" : isMine ? "justify-end" : "justify-start"} gap-2`}>
              {!isMine && !isSys && (
                otherParty.avatar_url ? <img src={otherParty.avatar_url} className="w-8 h-8 rounded-full object-cover mt-1 shadow-sm" /> : <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary mt-1 border shadow-sm">{otherInitials}</div>
              )}
              <div className={isSys ? "w-full my-4 px-8" : `max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-sm ${isMine ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-card border rounded-tl-none text-foreground"}`}>
                {rendered}
                {!isSys && <p className={`text-[9px] mt-1.5 font-bold uppercase opacity-50 ${isMine ? "text-right" : ""}`}>{new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {/* Input Bar */}
      <div className="sticky bottom-20 bg-background/80 backdrop-blur-md border-t px-4 py-4">
        <div className="max-w-screen-lg mx-auto flex items-center gap-3">
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 bg-destructive/5 rounded-2xl px-4 py-3 border-2 border-destructive/10 animate-in slide-in-from-bottom-2">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm font-black text-destructive flex-1">{formatRecTime(recordingTime)}</span>
              <button onClick={cancelRecording} className="text-[10px] font-black uppercase text-muted-foreground hover:text-destructive transition-colors">Cancelar</button>
              <button onClick={stopAndSendRecording} className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"><Send className="w-4 h-4" /></button>
            </div>
          ) : (
            <>
              <div className="flex-1 relative group">
                <input 
                  type="text" value={text} 
                  onChange={(e) => setText(e.target.value)} 
                  onKeyDown={(e) => e.key === "Enter" && handleSend()} 
                  placeholder="Mande uma mensagem..." 
                  className="w-full bg-muted/40 border-2 border-transparent rounded-2xl pl-5 pr-12 py-3.5 text-sm outline-none focus:bg-card focus:border-primary/20 transition-all shadow-inner" 
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-30 group-focus-within:opacity-100"><MessageSquare className="w-5 h-5" /></div>
              </div>
              {text.trim() ? (
                <button onClick={handleSend} disabled={sending} className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 active:scale-90 transition-all"><Send className="w-5 h-5" /></button>
              ) : (
                <button onClick={startRecording} className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all active:scale-90"><Mic className="w-5 h-5" /></button>
              )}
            </>
          )}
        </div>
      </div>

      <BottomNav />

      {/* --- MODAIS DE NEGÓCIO (LAYOUT PREMIUM) --- */}

      {/* 1. Modal de Cobrança do Profissional */}
      <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
        <DialogContent className="max-w-sm rounded-[32px] p-8 border-none shadow-2xl">
          <DialogHeader><DialogTitle className="text-2xl font-black tracking-tight text-center">Cobrar Atendimento</DialogTitle></DialogHeader>
          
          {billingStep === "choose_type" && (
            <div className="grid gap-4 py-6">
               <button onClick={() => setBillingStep("app_form")} disabled={proPlanId === "free"} className="group flex items-center gap-5 p-5 rounded-3xl border-2 border-muted hover:border-primary hover:bg-primary/5 transition-all text-left disabled:opacity-40">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform"><CreditCard className="w-7 h-7" /></div>
                  <div className="flex-1">
                    <p className="font-black text-sm tracking-tight">Receber pelo App</p>
                    <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider mt-0.5">PIX ou Cartão</p>
                  </div>
               </button>
               
               <button onClick={() => setBillingStep("presencial_confirm")} className="group flex items-center gap-5 p-5 rounded-3xl border-2 border-muted hover:border-primary hover:bg-primary/5 transition-all text-left">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground group-hover:scale-110 transition-transform"><Handshake className="w-7 h-7" /></div>
                  <div className="flex-1">
                    <p className="font-black text-sm tracking-tight">Pagamento Externo</p>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">Direto com o cliente</p>
                  </div>
               </button>
            </div>
          )}

          {billingStep === "app_form" && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Valor Total</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-primary text-lg">R$</span>
                  <input value={billingAmount} onChange={e => setBillingAmount(e.target.value)} type="number" placeholder="0,00" className="w-full bg-muted/30 border-2 border-transparent focus:border-primary rounded-[20px] pl-12 pr-6 py-4 font-black text-xl outline-none transition-all shadow-inner" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Referência</label>
                <input value={billingDesc} onChange={e => setBillingDesc(e.target.value)} placeholder="O que você fez?" className="w-full bg-muted/30 border-2 border-transparent focus:border-primary rounded-[20px] px-6 py-4 text-sm font-bold outline-none transition-all shadow-inner" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => {setBillingMethod("pix"); setBillingInstallments("1");}} className={`py-4 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-2 transition-all ${billingMethod === 'pix' ? 'border-primary bg-primary/5 text-primary' : 'border-muted opacity-50'}`}><QrCode className="w-4 h-4" /> PIX</button>
                <button onClick={() => setBillingMethod("card")} className={`py-4 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-2 transition-all ${billingMethod === 'card' ? 'border-primary bg-primary/5 text-primary' : 'border-muted opacity-50'}`}><CreditCard className="w-4 h-4" /> CARTÃO</button>
              </div>

              {billingMethod === "card" && (
                 <select value={billingInstallments} onChange={e => setBillingInstallments(e.target.value)} className="w-full bg-muted/30 border-2 border-transparent rounded-[20px] px-6 py-4 text-sm font-bold outline-none">
                    {getBillingInstallmentOptions().map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                 </select>
              )}

              <Button onClick={handleSendBilling} disabled={!billingAmount || !billingMethod} className="w-full h-14 rounded-2xl bg-primary text-white font-black text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform">ENVIAR COBRANÇA AGORA</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2. Modal de Pagamento do Cliente */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm rounded-[32px] p-8">
          <DialogHeader><DialogTitle className="text-2xl font-black text-center">{cardStep ? "Dados do Cartão" : "Confirmar Pagamento"}</DialogTitle></DialogHeader>
          
          <div className="space-y-6 pt-4">
            <div className="text-center p-8 bg-primary/5 rounded-[32px] border-2 border-dashed border-primary/20">
                <p className="text-4xl font-black text-primary">R$ {getDiscountedAmount().toFixed(2).replace(".", ",")}</p>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-2">{paymentData?.desc}</p>
            </div>

            {!cardStep ? (
              <div className="space-y-4">
                {availableCoupons.length > 0 && !selectedCouponId && (
                   <button onClick={() => applyCoupon(availableCoupons[0].id)} className="w-full p-4 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-between group">
                      <div className="flex items-center gap-3"><Ticket className="w-5 h-5 text-primary" /><span className="text-xs font-black text-primary uppercase">Aplicar Cupom Disponível</span></div>
                      <Check className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                   </button>
                )}
                <Button onClick={handleConfirmPayment} disabled={processingPayment} className="w-full h-14 rounded-2xl bg-primary text-white font-black shadow-xl">
                  {processingPayment ? <Loader2 className="animate-spin w-5 h-5" /> : `PAGAR VIA ${paymentMethod?.toUpperCase()}`}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <input value={cardForm.number} onChange={e => setCardForm(f => ({...f, number: formatCardNumber(e.target.value)}))} placeholder="0000 0000 0000 0000" className="w-full bg-muted/30 border-2 border-transparent rounded-2xl px-6 py-4 text-sm font-bold shadow-inner" />
                <input value={cardForm.name} onChange={e => setCardForm(f => ({...f, name: e.target.value.toUpperCase()}))} placeholder="NOME COMO NO CARTÃO" className="w-full bg-muted/30 border-2 border-transparent rounded-2xl px-6 py-4 text-sm font-bold uppercase shadow-inner" />
                <div className="grid grid-cols-2 gap-3">
                  <input value={cardForm.expiry} onChange={e => setCardForm(f => ({...f, expiry: formatExpiry(e.target.value)}))} placeholder="MM/AA" className="w-full bg-muted/30 border-2 border-transparent rounded-2xl px-6 py-4 text-sm font-bold shadow-inner" />
                  <input value={cardForm.cvv} onChange={e => setCardForm(f => ({...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4)}))} type="password" placeholder="CVV" className="w-full bg-muted/30 border-2 border-transparent rounded-2xl px-6 py-4 text-sm font-bold shadow-inner" />
                </div>
                <Button onClick={handleConfirmPayment} disabled={processingPayment} className="w-full h-14 rounded-2xl bg-primary text-white font-black shadow-xl mt-4">PAGAR AGORA</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. Modal do PIX QR Code */}
      <Dialog open={pixOpen} onOpenChange={setPixOpen}>
        <DialogContent className="max-w-sm rounded-[32px] p-8 text-center">
          <DialogHeader><DialogTitle className="text-xl font-black">Pagamento PIX</DialogTitle></DialogHeader>
          {pixData && (
            <div className="space-y-6 pt-4">
              <div className="bg-white p-6 rounded-3xl border-4 border-muted/20 inline-block mx-auto shadow-inner">
                <img src={`data:image/png;base64,${pixData.qrCode}`} className="w-48 h-48 mx-auto" alt="QR Code" />
              </div>
              <button onClick={() => { navigator.clipboard.writeText(pixData.copyPaste); setPixCopied(true); toast({title: "Copiado!"}); setTimeout(() => setPixCopied(false), 3000); }} className="w-full py-4 rounded-2xl bg-primary/10 text-primary font-black text-xs flex items-center justify-center gap-3">
                {pixCopied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                COPIAR CÓDIGO PIX
              </button>
              <div className="flex items-center justify-center gap-3 py-2 text-xs font-bold text-muted-foreground animate-pulse tracking-tight">
                <Loader2 className="w-4 h-4 animate-spin" /> AGUARDANDO CONFIRMAÇÃO DO BANCO...
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 4. Modal de Avaliação Final */}
      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent className="max-w-sm rounded-[40px] p-10 text-center">
          <DialogHeader><DialogTitle className="text-2xl font-black tracking-tight">Tudo pronto!</DialogTitle></DialogHeader>
          <div className="py-6 space-y-8">
            <div className="space-y-2">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Avalie o Atendimento</p>
              <div className="flex justify-center gap-2">
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => setRatingStars(s)} className="transition-transform active:scale-90">
                    <Star className={`w-10 h-10 ${s <= ratingStars ? "fill-amber-400 text-amber-400 scale-110" : "text-muted/30"}`} />
                  </button>
                ))}
              </div>
            </div>
            <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Deixe um comentário rápido sobre o serviço..." className="w-full bg-muted/30 border-2 border-transparent focus:border-primary rounded-3xl p-5 text-sm font-bold shadow-inner min-h-[120px] outline-none transition-all" />
            <Button onClick={handleSubmitRating} disabled={ratingStars === 0} className="w-full h-14 rounded-2xl bg-primary text-white font-black text-sm shadow-xl shadow-primary/20">FINALIZAR E AVALIAR</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 5. Modal de Recompensa (Ganha Cupom) */}
      <Dialog open={rewardOpen} onOpenChange={setRewardOpen}>
        <DialogContent className="max-w-sm rounded-[40px] p-10 text-center border-none shadow-[0_0_50px_rgba(var(--primary),0.3)]">
          <div className="space-y-8 py-4">
            <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center mx-auto shadow-2xl animate-bounce">
               {rewardCoupon?.type === "discount" ? <Ticket className="w-12 h-12 text-white" /> : <Star className="w-12 h-12 text-white fill-white" />}
            </div>
            <div>
              <h3 className="text-3xl font-black tracking-tighter">PARABÉNS! 🎉</h3>
              <p className="text-sm font-bold text-muted-foreground mt-2 uppercase tracking-widest">Você ganhou um presente!</p>
            </div>
            
            <div className="bg-primary/5 border-2 border-dashed border-primary/30 rounded-3xl p-6">
              {rewardCoupon?.type === "discount" ? (
                <>
                  <p className="text-4xl font-black text-primary">{rewardCoupon.value}% OFF</p>
                  <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest mt-1">Desconto no próximo serviço</p>
                </>
              ) : (
                <>
                  <p className="text-xl font-black text-primary tracking-tight">CUPOM DE SORTEIO</p>
                  <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest mt-1">Você está concorrendo ao prêmio!</p>
                </>
              )}
            </div>
            
            <Button onClick={() => setRewardOpen(false)} className="w-full h-14 rounded-2xl bg-foreground text-background font-black shadow-2xl">ENTENDIDO!</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 6. Modal de Confirmação de Encerramento */}
      <Dialog open={closingCall} onOpenChange={setClosingCall}>
        <DialogContent className="max-w-xs rounded-3xl p-8 text-center">
          <DialogHeader><DialogTitle className="font-black">Encerrar Chamada?</DialogTitle></DialogHeader>
          <div className="space-y-6 pt-4">
             <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto"><LogOut className="w-8 h-8" /></div>
             <p className="text-xs font-bold text-muted-foreground uppercase leading-relaxed tracking-tight">Isso finalizará o chat para ambos. Tem certeza?</p>
             <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setClosingCall(false)} className="py-3 rounded-xl border-2 font-black text-[10px] uppercase">Não</button>
                <button 
                  onClick={async () => {
                    const { error } = await supabase.from("service_requests").update({ status: "completed" } as any).eq("id", threadId!);
                    if (!error) {
                        await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: "🔒 CHAMADA ENCERRADA pelo profissional." });
                        setRequestStatus("completed");
                        setClosingCall(false);
                        toast({ title: "Chamada finalizada" });
                    }
                  }} 
                  className="py-3 rounded-xl bg-destructive text-white font-black text-[10px] uppercase shadow-lg shadow-destructive/20"
                >Sim, Encerrar</button>
             </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default MessageThread;