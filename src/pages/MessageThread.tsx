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
  image_urls?: string[] | null; // ✅ Mantido do VS Code
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
            const { data: profile } = (await supabase.from("profiles_public" as any).select("full_name, avatar_url").eq("user_id", pro.user_id).maybeSingle()) as {data: {full_name: string;avatar_url: string | null;} | null;};
            if (profile) setOtherParty({ name: profile.full_name || "Profissional", avatar_url: profile.avatar_url });
          }
        } else {
          const { data: profile } = (await supabase.from("profiles_public" as any).select("full_name, avatar_url").eq("user_id", req.client_id).maybeSingle()) as {data: {full_name: string;avatar_url: string | null;} | null;};
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

  const getBillingFeeLabel = () => {
    if (!billingMethod || !billingAmount) return null;
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) return null;
    if (billingMethod === "pix") {
      const pct = parseFloat(feeSettings.pix_fee_pct || "0");
      const fixed = parseFloat(feeSettings.pix_fee_fixed || "0");
      const fee = amount * pct / 100 + fixed;
      return { fee, label: `Taxa PIX: ${pct}%${fixed > 0 ? ` + R$ ${fixed.toFixed(2).replace(".", ",")}` : ""} = R$ ${fee.toFixed(2).replace(".", ",")}` };
    }
    if (billingMethod === "card") {
      const inst = parseInt(billingInstallments);
      if (inst === 1) {
        const pct = parseFloat(feeSettings.card_fee_pct || "0");
        const fixed = parseFloat(feeSettings.card_fee_fixed || "0");
        const fee = amount * pct / 100 + fixed;
        return { fee, label: `Taxa cartão à vista: ${pct}%${fixed > 0 ? ` + R$ ${fixed.toFixed(2).replace(".", ",")}` : ""} = R$ ${fee.toFixed(2).replace(".", ",")}` };
      } else {
        const pct = parseFloat(feeSettings[`installment_fee_${inst}x`] || "0");
        const fee = amount * pct / 100;
        return { fee, label: `Taxa ${inst}x: ${pct}% = R$ ${fee.toFixed(2).replace(".", ",")}` };
      }
    }
    return null;
  };

  const getBillingInstallmentOptions = () => {
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) return [];
    const maxInst = parseInt(feeSettings.max_installments || "12");
    const options = [];
    for (let i = 1; i <= maxInst; i++) {
      const feePct = i === 1 ? parseFloat(feeSettings.card_fee_pct || "0") : parseFloat(feeSettings[`installment_fee_${i}x`] || "0");
      const feeFixed = i === 1 ? parseFloat(feeSettings.card_fee_fixed || "0") : 0;
      const fee = amount * feePct / 100 + feeFixed;
      const val = (amount / i).toFixed(2).replace(".", ",");
      const feeLabel = fee > 0 ? ` (taxa: ${feePct}%)` : "";
      options.push({ value: String(i), label: i === 1 ? `1x de R$ ${val} à vista${feeLabel}` : `${i}x de R$ ${val}${feeLabel}` });
    }
    return options;
  };

  const handleSendBilling = async () => {
    if (!billingAmount || !userId || !threadId || !billingMethod) return;
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) {toast({ title: "Valor inválido", variant: "destructive" });return;}
    const methodLabel = billingMethod === "pix" ? "PIX" : `Cartão ${billingInstallments}x`;
    const feeInfo = getBillingFeeLabel();
    const feeText = feeInfo ? `\nTaxa: ${feeInfo.label}` : "";
    const billingContent = `💰 COBRANÇA\nValor: R$ ${amount.toFixed(2).replace(".", ",")}\n${billingDesc ? `Descrição: ${billingDesc}\n` : ""}Forma: ${methodLabel}${feeText}\n\n[COBRAR:${amount}:${billingDesc || "Serviço"}:${billingMethod}:${billingInstallments}]`;
    const { error } = await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: billingContent });
    if (error) toast({ title: "Erro ao enviar cobrança", variant: "destructive" });
    else { setBillingOpen(false); setBillingAmount(""); setBillingDesc(""); setBillingMethod(null); setBillingInstallments("1"); toast({ title: "Cobrança enviada!" }); }
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
    setCardForm({ number: "", name: "", expiry: "", cvv: "", postalCode: "", addressNumber: "" });
    setSelectedCouponId(null);
    setCouponDiscount(null);
    setPaymentOpen(true);
    if (userId) {
      const { data } = await supabase.from("coupons").select("*").eq("user_id", userId).eq("coupon_type", "discount").eq("used", false).order("created_at", { ascending: false });
      const valid = (data || []).filter((c: any) => !c.expires_at || new Date(c.expires_at) > new Date());
      setAvailableCoupons(valid);
    }
  };

  const applyCoupon = (couponId: string) => {
    const coupon = availableCoupons.find((c) => c.id === couponId);
    if (!coupon) return;
    setSelectedCouponId(couponId);
    setCouponDiscount({ type: coupon.discount_percent > 0 ? "percentage" : "fixed", value: coupon.discount_percent });
  };

  const removeCoupon = () => { setSelectedCouponId(null); setCouponDiscount(null); };

  const getDiscountedAmount = () => {
    if (!paymentData || !couponDiscount) return paymentData ? parseFloat(paymentData.amount) : 0;
    const amount = parseFloat(paymentData.amount);
    return couponDiscount.type === "percentage" ? Math.max(0, amount * (1 - couponDiscount.value / 100)) : Math.max(0, amount - couponDiscount.value);
  };

  const formatCardNumber = (value: string) => { const digits = value.replace(/\D/g, "").slice(0, 16); return digits.replace(/(\d{4})(?=\d)/g, "$1 "); };
  const formatExpiry = (value: string) => { const digits = value.replace(/\D/g, "").slice(0, 4); if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`; return digits; };

  const handleSelectMethod = (method: "pix" | "card") => { setPaymentMethod(method); if (method === "card") setCardStep(true); };

  const getInstallmentOptions = () => {
    if (!paymentData) return [];
    const amount = getDiscountedAmount();
    const options = [];
    const maxInstallments = amount >= 100 ? 12 : amount >= 50 ? 6 : amount >= 20 ? 3 : 1;
    for (let i = 1; i <= maxInstallments; i++) {
      const val = (amount / i).toFixed(2).replace(".", ",");
      options.push({ value: String(i), label: i === 1 ? `1x de R$ ${val} (à vista)` : `${i}x de R$ ${val}` });
    }
    return options;
  };

  const handleConfirmPayment = async () => {
    if (!paymentMethod || !paymentData || !userId || !threadId) return;
    if (paymentMethod === "card") {
      if (!cardForm.number || !cardForm.name || !cardForm.expiry || !cardForm.cvv) { toast({ title: "Preencha todos os dados do cartão", variant: "destructive" }); return; }
      if (cardForm.number.replace(/\s/g, "").length < 16) { toast({ title: "Número do cartão inválido", variant: "destructive" }); return; }
      const { data: profileCheck } = await supabase.from("profiles").select("address_zip, address_number").eq("user_id", userId).single();
      const hasAddress = (profileCheck?.address_zip || cardForm.postalCode) && (profileCheck?.address_number || cardForm.addressNumber);
      if (!hasAddress) { toast({ title: "Preencha o CEP e número do endereço", variant: "destructive" }); return; }
    }
    setProcessingPayment(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
      if (!profile?.cpf && !profile?.cnpj) { toast({ title: "Cadastre seu CPF ou CNPJ no perfil antes de realizar pagamentos.", variant: "destructive" }); setProcessingPayment(false); setPaymentOpen(false); navigate("/profile"); return; }
      const finalAmount = getDiscountedAmount();
      const expiryParts = cardForm.expiry.split("/");
      
      const res = await supabase.functions.invoke("create_payment", {
        body: {
          action: "create_service_payment",
          request_id: threadId,
          amount: finalAmount,
          billing_type: paymentMethod === "pix" ? "PIX" : "CREDIT_CARD",
          installment_count: parseInt(installments),
          credit_card: paymentMethod === "card" ? { holder_name: cardForm.name, number: cardForm.number.replace(/\s/g, ""), expiry_month: expiryParts[0], expiry_year: `20${expiryParts[1]}`, cvv: cardForm.cvv } : null,
          credit_card_holder_info: { name: profile?.full_name || cardForm.name, email: profile?.email || "", cpf_cnpj: profile?.cpf || profile?.cnpj || "", postal_code: profile?.address_zip || cardForm.postalCode || "", address_number: profile?.address_number || cardForm.addressNumber || "", phone: profile?.phone || "" }
        }
      });

      if (res.error || res.data?.error) throw new Error(res.data?.error || "Erro no processamento");

      if (paymentMethod === "pix") {
        setPixData({ qrCode: res.data.pix_qr_code, copyPaste: res.data.pix_copy_paste, paymentId: res.data.payment_id });
        setProcessingPayment(false); setPaymentOpen(false); setPixOpen(true); setPixCopied(false); setPixPolling(true);
        if (pixIntervalRef.current) clearInterval(pixIntervalRef.current);
        pixIntervalRef.current = setInterval(async () => {
          const check = await supabase.functions.invoke("create_payment", { body: { action: "check_payment_status", payment_id: res.data.payment_id } });
          if (check.data?.confirmed) {
            clearInterval(pixIntervalRef.current!); setPixPolling(false); setPixOpen(false);
            await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: `✅ PAGAMENTO CONFIRMADO\nValor: R$ ${finalAmount.toFixed(2).replace(".", ",")}\nMétodo: PIX` });
            if (selectedCouponId) await supabase.from("coupons").update({ used: true } as any).eq("id", selectedCouponId);
            setRatingStars(0); setRatingOpen(true);
          }
        }, 5000);
      } else {
        await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: `✅ PAGAMENTO CONFIRMADO\nValor: R$ ${finalAmount.toFixed(2).replace(".", ",")}\nMétodo: Cartão de Crédito` });
        if (selectedCouponId) await supabase.from("coupons").update({ used: true } as any).eq("id", selectedCouponId);
        setProcessingPayment(false); setPaymentConfirmed(true); setPaymentOpen(false); toast({ title: "Pagamento confirmado!" });
        setTimeout(() => { setRatingStars(0); setRatingOpen(true); }, 350);
      }
    } catch (err: any) { setProcessingPayment(false); toast({ title: err.message || "Erro no processamento", variant: "destructive" }); }
  };

  const handleSubmitRating = async () => {
    if (ratingStars === 0 || !userId || !threadId) return;
    const { error } = await supabase.rpc("submit_review", { _request_id: threadId, _rating: ratingStars, _comment: ratingComment || null });
    if (error) toast({ title: "Erro na avaliação", variant: "destructive" });
    else {
      setRequestStatus("completed"); setRatingOpen(false); setHasRated(true); toast({ title: "Obrigado pela avaliação!" });
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

  const renderMessageContent = (msg: Message) => {
    const billing = parseBilling(msg.content);
    const isMine = msg.sender_id === userId;
    const audioData = msg.content.match(/\[AUDIO:(.+):(\d+)\]$/);
    if (audioData) return <AudioPlayer src={audioData[1]} duration={parseInt(audioData[2])} isMine={isMine} />;

    if (msg.content.startsWith("📋 PROTOCOLO:") || msg.content.includes("🔒 CHAMADA ENCERRADA")) return (
      <div className="text-center w-full my-2"><div className="inline-block bg-muted/80 border rounded-xl px-4 py-2"><p className="text-xs font-semibold text-foreground">{msg.content.split("\n")[0]}</p></div></div>
    );

    if (msg.content.includes("💰 COBRANÇA") && billing) {
      const alreadyPaid = messages.some(m => m.content.includes("✅ PAGAMENTO CONFIRMADO"));
      return (
        <div className="space-y-2 p-1">
          <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-500" /><span className="font-bold text-sm text-foreground">Cobrança</span></div>
          <p className="text-xl font-black text-foreground">R$ {parseFloat(billing.amount).toFixed(2).replace(".", ",")}</p>
          <p className="text-[10px] opacity-70 italic text-muted-foreground">{billing.desc}</p>
          {!isMine && !alreadyPaid && <button onClick={() => openPayment(msg)} className="mt-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm">Pagar agora</button>}
          {alreadyPaid && <div className="mt-2 w-full py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 text-center flex items-center justify-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Pago</div>}
        </div>
      );
    }

    if (msg.content.includes("✅ PAGAMENTO CONFIRMADO")) return <p className="font-bold text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Pagamento confirmado</p>;

    // ✅ FIX: Renderiza imagens dinâmicas (image_urls) OU regex do Lovable
    if (msg.image_urls && msg.image_urls.length > 0) {
      return (
        <div className="flex flex-col gap-2 max-w-[240px]">
          <div className={`grid ${msg.image_urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-1`}>
            {msg.image_urls.map((url, j) => <img key={j} src={url} className="rounded-lg w-full object-cover cursor-pointer" onClick={() => window.open(url, '_blank')} />)}
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
          <Link to="/messages" className="p-1.5 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5 text-foreground" /></Link>
          {otherParty.avatar_url ? <img src={otherParty.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{otherInitials}</div>}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-foreground">{otherParty.name}</p>
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
        {isProfessional && requestStatus === "pending" && (
            <div className="bg-card border-2 border-primary/20 rounded-2xl p-5 text-center space-y-4 shadow-sm">
                <p className="font-bold text-sm text-foreground">Nova solicitação recebida!</p>
                <div className="flex gap-3">
                    <button onClick={async () => { await supabase.from("service_requests").update({ status: "rejected" } as any).eq("id", threadId!); setRequestStatus("rejected"); }} className="flex-1 py-3 rounded-xl border-2 font-bold text-xs text-destructive">RECUSAR</button>
                    <button onClick={async () => { await supabase.from("service_requests").update({ status: "accepted" } as any).eq("id", threadId!); setRequestStatus("accepted"); }} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-xs">ACEITAR</button>
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
              <div className={isSys ? "w-full flex justify-center my-2" : `max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm ${isMine ? "bg-primary text-primary-foreground rounded-br-none" : "bg-card border rounded-bl-none shadow-sm text-foreground"}`}>
                {rendered}
                {!isSys && <p className={`text-[9px] mt-1 opacity-60 text-right`}>{new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      <div className="sticky bottom-20 bg-background border-t px-4 py-3 flex items-center gap-2">
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Mensagem..." className="flex-1 bg-muted/40 border-none rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/20 text-foreground" />
            {text.trim() ? <button onClick={handleSend} className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-md"><Send className="w-4 h-4" /></button> : <button onClick={startRecording} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><Mic className="w-5 h-5 text-muted-foreground" /></button>}
      </div>

      <BottomNav />

      {/* MODAL COBRANÇA */}
      <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6">
          <DialogHeader><DialogTitle className="font-black text-foreground">Cobrar Cliente</DialogTitle></DialogHeader>
          {billingStep === "choose_type" && (
            <div className="grid gap-3 py-4">
               <button onClick={() => setBillingStep("app_form")} disabled={proPlanId === "free"} className="flex items-center gap-4 p-4 rounded-2xl border-2 border-muted hover:border-primary text-left disabled:opacity-50">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary"><CreditCard className="w-6 h-6" /></div>
                  <div><p className="font-bold text-sm text-foreground">Pelo App</p><p className="text-xs text-emerald-600">PIX ou Cartão</p></div>
               </button>
               <button onClick={() => setBillingStep("presencial_confirm")} className="flex items-center gap-4 p-4 rounded-2xl border-2 border-muted hover:border-primary text-left text-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center"><Handshake className="w-6 h-6 text-muted-foreground" /></div>
                  <div><p className="font-bold text-sm">Presencial</p><p className="text-xs">Dinheiro/Máquina</p></div>
               </button>
            </div>
          )}
          {billingStep === "app_form" && (
            <div className="space-y-4">
              <input value={billingAmount} onChange={e => setBillingAmount(e.target.value)} type="number" placeholder="Valor R$" className="w-full bg-muted/30 border-2 rounded-2xl px-4 py-3 font-black text-lg outline-none text-foreground" />
              <input value={billingDesc} onChange={e => setBillingDesc(e.target.value)} placeholder="Descrição" className="w-full bg-muted/30 border-2 rounded-2xl px-4 py-3 text-sm outline-none text-foreground" />
              <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setBillingMethod("pix")} className={`py-3 rounded-xl border-2 font-bold text-xs ${billingMethod === "pix" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground"}`}>PIX</button>
                    <button onClick={() => setBillingMethod("card")} className={`py-3 rounded-xl border-2 font-bold text-xs ${billingMethod === "card" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground"}`}>CARTÃO</button>
              </div>
              <button onClick={handleSendBilling} disabled={!billingAmount || !billingMethod} className="w-full py-4 rounded-2xl bg-primary text-white font-black">ENVIAR COBRANÇA</button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL PAGAMENTO */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm rounded-[32px] p-8">
          <DialogHeader><DialogTitle className="font-black text-foreground text-center">{cardStep ? "Dados do Cartão" : "Confirmar Pagamento"}</DialogTitle></DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="text-center p-8 bg-primary/5 rounded-[32px] border-2 border-dashed border-primary/20">
                <p className="text-4xl font-black text-primary">R$ {getDiscountedAmount().toFixed(2).replace(".", ",")}</p>
                <p className="text-[10px] font-black text-muted-foreground uppercase mt-2">{paymentData?.desc}</p>
            </div>
            {!cardStep ? (
                <button onClick={() => paymentMethod === 'pix' ? handleConfirmPayment() : setCardStep(true)} className="w-full py-4 rounded-2xl bg-primary text-white font-black">
                    {paymentMethod === 'pix' ? 'GERAR PIX' : 'PROSSEGUIR'}
                </button>
            ) : (
                <div className="space-y-3">
                    <input value={cardForm.number} onChange={e => setCardForm(f => ({...f, number: formatCardNumber(e.target.value)}))} placeholder="Número do Cartão" className="w-full bg-muted/30 border-2 rounded-2xl px-6 py-4 text-sm font-bold text-foreground" />
                    <input value={cardForm.name} onChange={e => setCardForm(f => ({...f, name: e.target.value.toUpperCase()}))} placeholder="NOME NO CARTÃO" className="w-full bg-muted/30 border-2 rounded-2xl px-6 py-4 text-sm font-bold uppercase text-foreground" />
                    <div className="grid grid-cols-2 gap-3">
                        <input value={cardForm.expiry} onChange={e => setCardForm(f => ({...f, expiry: formatExpiry(e.target.value)}))} placeholder="MM/AA" className="w-full bg-muted/30 border-2 rounded-2xl px-6 py-4 text-sm font-bold text-foreground" />
                        <input value={cardForm.cvv} onChange={e => setCardForm(f => ({...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4)}))} type="password" placeholder="CVV" className="w-full bg-muted/30 border-2 rounded-2xl px-6 py-4 text-sm font-bold text-foreground" />
                    </div>
                    <select value={installments} onChange={e => setInstallments(e.target.value)} className="w-full bg-muted/30 border-2 rounded-2xl px-6 py-4 text-sm font-bold text-foreground">
                        {getInstallmentOptions().map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <button onClick={handleConfirmPayment} disabled={processingPayment} className="w-full h-14 rounded-2xl bg-primary text-white font-black">{processingPayment ? <Loader2 className="animate-spin mx-auto" /> : "PAGAR AGORA"}</button>
                </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAIS PIX, RATING E REWARD (CÓDIGO LOVABLE PURO) */}
      <Dialog open={pixOpen} onOpenChange={setPixOpen}><DialogContent className="max-w-sm rounded-[32px] p-8 text-center">{pixData && (<div className="space-y-6"><img src={`data:image/png;base64,${pixData.qrCode}`} className="w-48 h-48 mx-auto" /><button onClick={() => {navigator.clipboard.writeText(pixData.copyPaste); toast({title:"Copiado!"});}} className="w-full py-4 rounded-2xl bg-primary/10 text-primary font-black">COPIAR PIX</button></div>)}</DialogContent></Dialog>
      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}><DialogContent className="max-w-sm rounded-[40px] p-10 text-center"><div className="flex justify-center gap-2 my-6">{[1,2,3,4,5].map(s => <Star key={s} onClick={()=>setRatingStars(s)} className={`w-10 h-10 cursor-pointer ${s <= ratingStars ? "fill-amber-400 text-amber-400" : "text-muted/30"}`} />)}</div><Button onClick={handleSubmitRating} disabled={ratingStars===0} className="w-full h-14 rounded-2xl bg-primary text-white font-black">AVALIAR</Button></DialogContent></Dialog>
      <Dialog open={rewardOpen} onOpenChange={setRewardOpen}><DialogContent className="max-w-sm rounded-[40px] p-10 text-center border-none shadow-2xl"><div className="space-y-8"><div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto"><Ticket className="w-12 h-12 text-primary" /></div><h3 className="text-3xl font-black">GANHOU! 🎉</h3><p className="text-sm font-bold text-primary">{rewardCoupon?.type === "discount" ? `${rewardCoupon.value}% OFF` : "Cupom de Sorteio"}</p><Button onClick={()=>setRewardOpen(false)} className="w-full h-14 rounded-2xl bg-foreground text-background font-black">ENTENDIDO!</Button></div></DialogContent></Dialog>
      <Dialog open={closingCall} onOpenChange={setClosingCall}><DialogContent className="max-w-xs rounded-3xl p-8 text-center"><DialogHeader><DialogTitle className="font-black">Encerrar?</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3 mt-4"><button onClick={()=>setClosingCall(false)} className="py-3 border-2 rounded-xl">Não</button><button onClick={async ()=>{await supabase.from("service_requests").update({status:"completed"} as any).eq("id",threadId!); setRequestStatus("completed"); setClosingCall(false);}} className="py-3 bg-destructive text-white rounded-xl">Sim</button></div></DialogContent></Dialog>
    </div>
  );
};

export default MessageThread;