
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

      // Get request details
      const { data: req } = await supabase.from("service_requests").select("*").eq("id", threadId!).maybeSingle();
      console.log("REQ COMPLETO:", req);
      if (req && user) {
        setRequestStatus(req.status);
        setRequestProtocol((req as any).protocol || null);
        const isClient = req.client_id === user.id;

        // Check if client already rated
        if (isClient && (req.status === "completed" || req.status === "closed")) {
          const { count } = await supabase.from("reviews").select("*", { count: "exact", head: true }).eq("request_id", threadId!).eq("client_id", user.id);
          if ((count || 0) > 0) setHasRated(true);
        }

        // Check if user is the professional
        if (!isClient) {
          const { data: pro } = await supabase.from("professionals").select("user_id").eq("id", req.professional_id).maybeSingle();
          if (pro && pro.user_id === user.id) {
            setIsProfessional(true);
            // Check professional's plan
            const { data: sub } = await supabase.from("subscriptions").select("plan_id").eq("user_id", user.id).maybeSingle();
            setProPlanId(sub?.plan_id || "free");
          }
        }

        // Load other party info
        if (isClient) {
          const { data: pro } = await supabase.from("professionals").select("user_id").eq("id", req.professional_id).maybeSingle();
          if (pro) {
            const { data: profile } = await supabase
  .from("profiles_public")
  .select("full_name, avatar_url")
  .eq("user_id", pro.user_id)
  .single();
            if (profile) {
  console.log("Avatar no chat:", profile.avatar_url);
  setOtherParty({
    name: profile.full_name || "Profissional",
    avatar_url: profile.avatar_url,
  });
}
          }
        } else {
          const { data: profile } = await supabase
  .from("profiles_public")
  .select("full_name, avatar_url")
  .eq("user_id", req.client_id)
  .single();
          if (profile) setOtherParty({ name: profile.full_name || "Cliente", avatar_url: profile.avatar_url });
        }
      }

      const { data } = await supabase.
      from("chat_messages").
      select("*").
      eq("request_id", threadId!).
      order("created_at");
      setMessages(data as Message[] || []);
    };
    if (threadId) load();
  }, [threadId]);

  // Realtime: chat messages
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase.
    channel(`chat-${threadId}`).
    on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `request_id=eq.${threadId}` },
    (payload) => {
      setMessages((prev) => [...prev, payload.new as Message]);
    }).
    subscribe();
    return () => {supabase.removeChannel(channel);};
  }, [threadId]);

  // Realtime: service_request status changes (close/reject syncs instantly)
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase.
    channel(`req-status-${threadId}`).
    on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests", filter: `id=eq.${threadId}` },
    (payload) => {
      const updated = payload.new as any;
      setRequestStatus(updated.status);
      if (updated.protocol) setRequestProtocol(updated.protocol);
    }).
    subscribe();
    return () => {supabase.removeChannel(channel);};
  }, [threadId]);

  // Cleanup PIX polling on unmount
  useEffect(() => {
    return () => {
      if (pixIntervalRef.current) clearInterval(pixIntervalRef.current);
    };
  }, []);
// Realtime: listen payment status change
useEffect(() => {
  if (!pixData?.paymentId) return;

  const channel = supabase
    .channel(`pix-status-${pixData.paymentId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "transactions",
        filter: `asaas_payment_id=eq.${pixData.paymentId}`,
      },
      async (payload) => {
        const updated = payload.new as any;

        if (updated.status === "completed") {

          setPixOpen(false);
          setPaymentConfirmed(true);

          toast({
            title: "Pagamento confirmado!",
          });

          await supabase.from("chat_messages").insert({
            request_id: threadId,
            sender_id: userId,
            content:
              "✅ PAGAMENTO CONFIRMADO\nO pagamento foi aprovado com sucesso.",
          });

          // 🔥 ABRE O MODAL DE AVALIAÇÃO
          setTimeout(() => {
            setRatingStars(0);
            setRatingComment("");
            setRatingOpen(true);
          }, 350);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [pixData?.paymentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    // Mark thread as read
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
    if (error) toast({ title: "Erro ao enviar mensagem", variant: "destructive" });else
    setText("");
    setSending(false);
  };

  // Audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

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
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
      };
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
      recorder.onstop = (e) => {
        if (typeof prevOnStop === 'function') prevOnStop.call(recorder, e);
        resolve();
      };
      recorder.stop();
    });

    setIsRecording(false);

    const ext = MediaRecorder.isTypeSupported('audio/webm') ? 'webm' : 'm4a';
    const mimeType = ext === 'webm' ? 'audio/webm' : 'audio/mp4';
    const blob = new Blob(audioChunksRef.current, { type: mimeType });

    if (blob.size < 1000) {
      setUploadingAudio(false);
      setRecordingTime(0);
      return;
    }

    const fileName = `audio/${userId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.
    from("uploads").
    upload(fileName, blob, { contentType: mimeType, upsert: true });

    if (uploadError) {
      toast({ title: "Erro ao enviar áudio", variant: "destructive" });
      setUploadingAudio(false);
      setRecordingTime(0);
      return;
    }

    const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
    const duration = recordingTime;

    const { error } = await supabase.from("chat_messages").insert({
      request_id: threadId,
      sender_id: userId,
      content: `[AUDIO:${urlData.publicUrl}:${duration}]`
    });

    if (error) toast({ title: "Erro ao enviar áudio", variant: "destructive" });
    setUploadingAudio(false);
    setRecordingTime(0);
  };

  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Load fee settings when billing opens
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

  // Professional sends billing
  const handleSendBilling = async () => {
    if (!billingAmount || !userId || !threadId || !billingMethod) return;
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) {toast({ title: "Valor inválido", variant: "destructive" });return;}

    const methodLabel = billingMethod === "pix" ? "PIX" : `Cartão ${billingInstallments}x`;
    const feeInfo = getBillingFeeLabel();
    const feeText = feeInfo ? `\nTaxa: ${feeInfo.label}` : "";
    const billingContent = `💰 COBRANÇA\nValor: R$ ${amount.toFixed(2).replace(".", ",")}\n${billingDesc ? `Descrição: ${billingDesc}\n` : ""}Forma: ${methodLabel}${feeText}\n\n[COBRAR:${amount}:${billingDesc || "Serviço"}:${billingMethod}:${billingInstallments}]`;

    const { error } = await supabase.from("chat_messages").insert({
      request_id: threadId,
      sender_id: userId,
      content: billingContent
    });
    if (error) toast({ title: "Erro ao enviar cobrança", variant: "destructive" });else
    {
      setBillingOpen(false);
      setBillingAmount("");
      setBillingDesc("");
      setBillingMethod(null);
      setBillingInstallments("1");
      toast({ title: "Cobrança enviada!" });
    }
  };

  // Parse billing messages (supports old and new format)
  const parseBilling = (content: string) => {
    // New format: [COBRAR:amount:desc:method:installments]
    const matchNew = content.match(/\[COBRAR:([0-9.]+):(.+?):(\w+):(\d+)\]/);
    if (matchNew) return { amount: matchNew[1], desc: matchNew[2], method: matchNew[3] as "pix" | "card", installments: matchNew[4] };
    // Old format: [COBRAR:amount:desc]
    const match = content.match(/\[COBRAR:([0-9.]+):(.+?)\]/);
    if (match) return { amount: match[1], desc: match[2], method: null, installments: "1" };
    return null;
  };

  // Client opens payment
  const openPayment = async (msg: Message) => {
    const billing = parseBilling(msg.content);
    if (!billing) return;
    setPaymentData({ amount: billing.amount, desc: billing.desc, msgId: msg.id });
    // Pre-select method from billing
    if (billing.method) {
      setPaymentMethod(billing.method);
      if (billing.method === "card") {
        setCardStep(true);
        setInstallments(billing.installments);
      } else {
        setCardStep(false);
      }
    } else {
      setPaymentMethod(null);
      setCardStep(false);
    }
    setPaymentConfirmed(false);
    setCardForm({ number: "", name: "", expiry: "", cvv: "", postalCode: "", addressNumber: "" });
    if (!billing.method) setInstallments("1");
    setSelectedCouponId(null);
    setCouponDiscount(null);
    setPaymentOpen(true);

    // Load available discount coupons
    if (userId) {
      const { data } = await supabase.
      from("coupons").
      select("*").
      eq("user_id", userId).
      eq("coupon_type", "discount").
      eq("used", false).
      order("created_at", { ascending: false });
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

  const removeCoupon = () => {
    setSelectedCouponId(null);
    setCouponDiscount(null);
  };

  const getDiscountedAmount = () => {
    if (!paymentData || !couponDiscount) return paymentData ? parseFloat(paymentData.amount) : 0;
    const amount = parseFloat(paymentData.amount);
    if (couponDiscount.type === "percentage") {
      return Math.max(0, amount * (1 - couponDiscount.value / 100));
    }
    return Math.max(0, amount - couponDiscount.value);
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleSelectMethod = (method: "pix" | "card") => {
    setPaymentMethod(method);
    if (method === "card") {
      setCardStep(true);
    }
  };

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
  if (!paymentData || !userId || !threadId || !paymentMethod) return;

  setProcessingPayment(true);

  try {
    const finalAmount = getDiscountedAmount();

    const res = await supabase.functions.invoke("create_payment", {
      body: {
        request_id: threadId,
        amount: finalAmount,
        method: paymentMethod,
        installments: paymentMethod === "card" ? installments : 1,
        cardData: paymentMethod === "card" ? cardForm : null
      }
    });

    if (res.error || res.data?.error) {
      throw new Error(res.data?.error || "Erro ao gerar pagamento");
    }

    // 🔵 PIX → abre QR
    if (paymentMethod === "pix") {
      setPixData({
        qrCode: res.data.pix_qr_code,
        copyPaste: res.data.pix_copy_paste,
        paymentId: res.data.payment_id
      });

      setPaymentOpen(false);
      setPixOpen(true);
    }

    // 🟢 CARTÃO → confirma direto
    if (paymentMethod === "card") {

      toast({ title: "Pagamento aprovado!" });

      await supabase.from("chat_messages").insert({
        request_id: threadId,
        sender_id: userId,
        content:
          "✅ PAGAMENTO CONFIRMADO\nPagamento no cartão aprovado com sucesso.",
      });

      setPaymentOpen(false);

      setTimeout(() => {
        setRatingStars(0);
        setRatingComment("");
        setRatingOpen(true);
      }, 350);
    }

  } catch (err: any) {
    toast({
      title: err.message || "Erro ao processar pagamento",
      variant: "destructive"
    });
  }

  setProcessingPayment(false);
};


  const handleSubmitRating = async () => {
    if (ratingStars === 0) {toast({ title: "Selecione uma nota", variant: "destructive" });return;}
    if (!userId || !threadId) return;

    // Update professional stats and mark request completed via secure RPC
    const { error } = await supabase.rpc("submit_review", {
      _request_id: threadId,
      _rating: ratingStars,
      _comment: ratingComment || null
    });

    if (error) {
      console.error("submit_review error:", error);
      toast({ title: "Erro ao registrar avaliação", variant: "destructive" });
    } else {
      setRequestStatus("completed");
    }

    setRatingOpen(false);
    setHasRated(true);
    toast({ title: "Avaliação enviada! Obrigado!" });

    // Award random coupon after rating
    await awardPostPaymentCoupon();
  };

  const awardPostPaymentCoupon = async () => {
    if (!userId) return;
    try {
      // Randomly choose raffle or discount
      const isDiscount = Math.random() > 0.5;

      if (isDiscount) {
        // Fetch admin discount settings
        const { data: settingsData } = await supabase.
        from("platform_settings").
        select("key, value").
        in("key", ["discount_coupon_percent", "discount_coupon_validity_days"]);
        const settings: Record<string, any> = {};
        (settingsData || []).forEach((s: any) => {settings[s.key] = s.value;});
        const percent = parseFloat(settings.discount_coupon_percent) || 10;
        const days = parseInt(settings.discount_coupon_validity_days) || 30;
        const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

        await supabase.from("coupons").insert({
          user_id: userId,
          coupon_type: "discount",
          source: "payment",
          discount_percent: percent,
          expires_at: expiresAt
        } as any);

        setRewardCoupon({ type: "discount", value: percent });
      } else {
        // Raffle coupon
        await supabase.from("coupons").insert({
          user_id: userId,
          coupon_type: "raffle",
          source: "payment"
        } as any);

        setRewardCoupon({ type: "raffle", value: 0 });
      }

      setRewardOpen(true);
    } catch (err) {
      console.error("Error awarding coupon:", err);
    }
  };

  const parseAudio = (content: string) => {
    const match = content.match(/\[AUDIO:(.+):(\d+)\]$/);
    if (match) return { url: match[1], duration: parseInt(match[2]) };
    return null;
  };

  const renderMessageContent = (msg: Message) => {
    const billing = parseBilling(msg.content);
    const isMine = msg.sender_id === userId;
    const isBilling = msg.content.includes("💰 COBRANÇA");
    const isPaymentConfirm = msg.content.includes("✅ PAGAMENTO CONFIRMADO");
    const isRating = msg.content.includes("⭐ AVALIAÇÃO");
    const isProtocol = msg.content.startsWith("📋 PROTOCOLO:");
    const isSystemClose = msg.content.includes("🔒 CHAMADA ENCERRADA");
    const audioData = parseAudio(msg.content);

    if (audioData) {
      return <AudioPlayer src={audioData.url} duration={audioData.duration} isMine={isMine} />;
    }

    // Protocol message - render as system card
    if (isProtocol) {
      return (
        <div className="text-center w-full">
          <div className="inline-block bg-muted/80 border rounded-xl px-4 py-2">
            <p className="text-xs font-mono font-semibold text-foreground">{msg.content.split("\n")[0].replace("📋 ", "")}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Guarde este número para referência</p>
          </div>
        </div>);

    }

    // System close message
    if (isSystemClose) {
      return (
        <div className="text-center w-full">
          <div className="inline-block bg-muted/80 border rounded-xl px-4 py-2">
            <p className="text-xs font-semibold text-foreground">{msg.content}</p>
          </div>
        </div>);

    }

    if (isBilling && billing) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            <span className="font-semibold">Cobrança</span>
          </div>
          <p className="text-lg font-bold">R$ {parseFloat(billing.amount).toFixed(2).replace(".", ",")}</p>
          <p className="text-xs opacity-80">{billing.desc}</p>
          {!isMine &&
          <button
            onClick={() => openPayment(msg)}
            className="mt-1 w-full py-2 rounded-lg bg-background/20 backdrop-blur-sm text-xs font-semibold hover:bg-background/30 transition-colors border border-current/20">

              Pagar agora
            </button>
          }
        </div>);

    }

    if (isPaymentConfirm) {
      return (
        <div className="space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><Check className="w-4 h-4" /> Pagamento confirmado</p>
          {msg.content.split("\n").slice(1).map((line, i) =>
          <p key={i} className="text-xs opacity-80">{line}</p>
          )}
        </div>);

    }

    // Hide rating messages completely
    if (isRating) {
      return null;
    }

    // Render images inline from photo URLs
    const imageUrlRegex = /(https?:\/\/[^\s]+?\.(png|jpg|jpeg|webp|gif))/gi;
    const parts = msg.content.split("\n");
    const hasImages = imageUrlRegex.test(msg.content);

    if (hasImages) {
      return (
        <div className="space-y-2">
          {parts.map((line, i) => {
            const imgMatch = line.match(/(https?:\/\/[^\s,]+?\.(png|jpg|jpeg|webp|gif))/gi);
            if (imgMatch) {
              return (
                <div key={i} className="flex flex-wrap gap-1.5">
                  {imgMatch.map((url, j) =>
                  <img key={j} src={url} alt="Foto do serviço" className="w-24 h-24 rounded-lg object-cover cursor-pointer" onClick={() => window.open(url, '_blank')} />
                  )}
                </div>);

            }
            if (line.startsWith("Fotos:")) return null;
            return line.trim() ? <p key={i}>{line}</p> : null;
          })}
        </div>);

    }

    return <p className="whitespace-pre-wrap">{msg.content}</p>;
  };

  const otherInitials = otherParty.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      {/* Header with avatar */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b">
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-lg mx-auto">
          <Link to="/messages" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          {otherParty.avatar_url ?
          <img src={otherParty.avatar_url} alt={otherParty.name} className="w-9 h-9 rounded-full object-cover" /> :

          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
              {otherInitials}
            </div>
          }
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{otherParty.name}</p>
            <p className="text-[10px] text-muted-foreground">online</p>
          </div>
          {/* Billing button for professionals */}
          {isProfessional && requestStatus === "accepted" &&
          <>
              <button
              onClick={async () => {await loadFeeSettings();setBillingOpen(true);}}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors bg-primary text-primary-foreground">

                <BadgeDollarSign className="w-3.5 h-3.5" /> Cobrar
              </button>
              <button
              onClick={async () => {
                if (!userId || !threadId) return;
                setClosingCall(true);
                await supabase.from("chat_messages").insert({
                  request_id: threadId,
                  sender_id: userId,
                  content: "🔒 CHAMADA ENCERRADA pelo profissional."
                });
                await supabase.from("service_requests").update({ status: "completed" } as any).eq("id", threadId);
                setRequestStatus("completed");
                setClosingCall(false);
                toast({ title: "Chamada encerrada!" });
              }}
              disabled={closingCall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors">

                <LogOut className="w-3.5 h-3.5" /> Encerrar
              </button>
            </>
          }
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-4 flex flex-col gap-2">
        {/* Accept/Reject buttons for professional when pending */}
        {isProfessional && requestStatus === "pending" &&
        <div className="bg-card border rounded-2xl p-4 space-y-3 mb-2">
            <p className="text-sm font-semibold text-foreground text-center">Nova solicitação de serviço</p>
            <p className="text-xs text-muted-foreground text-center">Deseja aceitar esta chamada?</p>
            <div className="flex gap-2">
              <button
              onClick={async () => {
                await supabase.from("service_requests").update({ status: "completed" } as any).eq("id", threadId!);
        setRequestStatus("rejected");
                await supabase.from("chat_messages").insert({
                  request_id: threadId!,
                  sender_id: userId!,
                  content: "❌ Chamada recusada pelo profissional. Chat encerrado."
                });
                toast({ title: "Chamada recusada e chat encerrado" });
              }}
              className="flex-1 py-2.5 rounded-xl border-2 border-destructive text-destructive font-semibold text-sm hover:bg-destructive/10 transition-colors">

                Recusar
              </button>
              <button
              onClick={async () => {
                await supabase.from("service_requests").update({ status: "accepted" } as any).eq("id", threadId!);
                setRequestStatus("accepted");
                await supabase.from("chat_messages").insert({
                  request_id: threadId!,
                  sender_id: userId!,
                  content: "✅ Chamada aceita! Vamos conversar sobre o serviço."
                });
                toast({ title: "Chamada aceita!" });
              }}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">

                Aceitar
              </button>
            </div>
          </div>
        }
        {requestStatus === "rejected" &&
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 text-center mb-2">
            <p className="text-sm font-semibold text-destructive">Chamada recusada</p>
          </div>
        }
        {messages.length === 0 &&
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma mensagem. Inicie a conversa!</div>
        }
        {messages.map((msg) => {
          const isMine = msg.sender_id === userId;
          // Skip rating messages entirely
          const isRatingMsg = msg.content.includes("AVALIAÇÃO:") || msg.content.includes("avaliou seu atendimento com");
          if (isRatingMsg) return null;
          const rendered = renderMessageContent(msg);
          if (rendered === null) return null;

          // Protocol and system messages - render centered without bubble
          const isSystemMsg = msg.content.startsWith("📋 PROTOCOLO:") || msg.content.includes("🔒 CHAMADA ENCERRADA");
          if (isSystemMsg) {
            return (
              <div key={msg.id} className="flex justify-center">
                {rendered}
              </div>);

          }

          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} gap-2`}>
              {!isMine && (
              otherParty.avatar_url ?
              <img src={otherParty.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover mt-1 flex-shrink-0" /> :

              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary mt-1 flex-shrink-0">
                    {otherInitials}
                  </div>)

              }
              <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${
              isMine ?
              "bg-primary text-primary-foreground rounded-br-md" :
              "bg-card border rounded-bl-md text-foreground"}`
              }>
                {rendered}
                <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>);

        })}
        <div ref={bottomRef} />
      </main>

      {/* Input bar */}
      {requestStatus === "completed" || requestStatus === "closed" || requestStatus === "rejected" ?
      <div className="sticky bottom-20 bg-muted/50 border-t px-4 py-3">
          <div className="flex flex-col items-center justify-center max-w-screen-lg mx-auto gap-2">
            <p className="text-sm text-muted-foreground">
              {requestStatus === "rejected" ? "Chamada recusada — chat encerrado" : "Serviço finalizado — chat encerrado"}
            </p>
            {/* Show rating button for client only after payment (not on rejected calls) */}
            {!isProfessional && !hasRated && requestStatus !== "rejected" && messages.some(m => m.content.includes("✅ PAGAMENTO CONFIRMADO") || m.content.includes("🤝 Pagamento presencial")) &&
          <button
            onClick={() => {setRatingStars(0);setRatingComment("");setRatingOpen(true);}}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5">

                <Star className="w-4 h-4" /> Avaliar profissional
              </button>
          }
            {!isProfessional && hasRated &&
          <p className="text-xs text-muted-foreground">✅ Avaliação enviada</p>
          }
          </div>
        </div> :

      <div className="sticky bottom-20 bg-background border-t px-4 py-3">
          <div className="flex items-center gap-2 max-w-screen-lg mx-auto">
            {isRecording ?
          <>
                <button onClick={cancelRecording}
            className="w-10 h-10 rounded-xl bg-muted text-destructive flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <X className="w-4 h-4" />
                </button>
                <div className="flex-1 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-sm font-medium text-destructive">{formatRecTime(recordingTime)}</span>
                  <span className="text-xs text-muted-foreground ml-1">Gravando...</span>
                </div>
                <button onClick={stopAndSendRecording}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </> :
          uploadingAudio ?
          <div className="flex-1 flex items-center justify-center gap-2 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Enviando áudio...</span>
              </div> :

          <>
                <input
              type="text" value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Digite sua mensagem..."
              className="flex-1 bg-card border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30" />

                {text.trim() ?
            <button onClick={handleSend} disabled={sending}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <Send className="w-4 h-4" />
                  </button> :

            <button onClick={startRecording}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors">
                    <Mic className="w-4 h-4" />
                  </button>
            }
              </>
          }
          </div>
        </div>
      }
      <BottomNav />

      {/* Billing Dialog */}
      <Dialog open={billingOpen} onOpenChange={(open) => {
        setBillingOpen(open);
        if (open) {loadFeeSettings();setBillingStep("choose_type");}
        if (!open) {setBillingStep("choose_type");setBillingMethod(null);setBillingAmount("");setBillingDesc("");}
      }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary" /> Cobrar</DialogTitle>
          </DialogHeader>

          {billingStep === "choose_type" &&
          <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground text-center">Como deseja cobrar?</p>
              {proPlanId !== "free" ?
            <button
              onClick={() => setBillingStep("app_form")}
              className="w-full py-4 rounded-xl border-2 hover:border-primary/50 transition-all flex items-center gap-3 px-4 group">

                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <DollarSign className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">Cobrar pelo app</p>
                    <p className="text-xs text-muted-foreground">PIX ou cartão de crédito</p>
                  </div>
                </button> :

            <div className="w-full py-4 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center gap-3 px-4 opacity-60">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-muted-foreground">Cobrar pelo app</p>
                    <p className="text-xs text-muted-foreground">Indisponível no plano grátis</p>
                  </div>
                </div>
            }
              {proPlanId === "free" &&
            <Link to="/subscriptions" className="block w-full">
                  <div className="bg-gradient-to-r from-primary/10 to-amber-500/10 border border-primary/20 rounded-xl p-3 text-center hover:border-primary/40 transition-colors">
                    <Crown className="w-5 h-5 text-primary mx-auto mb-1" />
                    <p className="text-xs font-semibold text-primary">Assine um plano para receber pelo app</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">A partir do plano Pro</p>
                  </div>
                </Link>
            }
              <button
              onClick={() => setBillingStep("presencial_confirm")}
              className="w-full py-4 rounded-xl border-2 hover:border-primary/50 transition-all flex items-center gap-3 px-4 group">

                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                  <Handshake className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">Cobrar presencialmente</p>
                  <p className="text-xs text-muted-foreground">Pagamento direto com o cliente</p>
                </div>
              </button>
            </div>
          }

          {billingStep === "presencial_confirm" &&
          <div className="space-y-4 pt-2">
              <div className="bg-muted/50 border rounded-xl p-4 text-center">
                <Handshake className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground">Pagamento presencial</p>
                <p className="text-xs text-muted-foreground mt-1">O pagamento será combinado diretamente com o cliente. Ao encerrar, o cliente poderá avaliar o serviço.</p>
              </div>
              <button
              onClick={async () => {
                if (!userId || !threadId) return;
                setClosingCall(true);
                // Send presencial message
                await supabase.from("chat_messages").insert({
                  request_id: threadId,
                  sender_id: userId,
                  content: "🤝 Pagamento presencial — combinado diretamente com o cliente."
                });
                // Close the call
                await supabase.from("chat_messages").insert({
                  request_id: threadId,
                  sender_id: userId,
                  content: "🔒 CHAMADA ENCERRADA pelo profissional."
                });
                await supabase.from("service_requests").update({ status: "completed" } as any).eq("id", threadId);
                setRequestStatus("completed");
                setBillingOpen(false);
                setClosingCall(false);
                toast({ title: "Chamada encerrada! O cliente poderá avaliar." });
              }}
              disabled={closingCall}
              className="w-full py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">

                <LogOut className="w-4 h-4" />
                {closingCall ? "Encerrando..." : "Encerrar chamada"}
              </button>
              <button
              onClick={() => setBillingStep("choose_type")}
              className="w-full py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">

                Voltar
              </button>
            </div>
          }

          {billingStep === "app_form" &&
          <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor (R$) *</label>
                <input
                value={billingAmount} onChange={(e) => setBillingAmount(e.target.value)}
                type="number" step="0.01" placeholder="0,00"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30" />

              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
                <input
                value={billingDesc} onChange={(e) => setBillingDesc(e.target.value)}
                placeholder="Ex: Instalação elétrica"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30" />

              </div>

              {/* Payment method selection */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Forma de pagamento *</p>
                <button
                onClick={() => {setBillingMethod("pix");setBillingInstallments("1");}}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${billingMethod === "pix" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>

                  <span className="text-lg">📱</span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">PIX</p>
                    <p className="text-[10px] text-muted-foreground">Pagamento instantâneo</p>
                  </div>
                </button>
                <button
                onClick={() => setBillingMethod("card")}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${billingMethod === "card" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>

                  <span className="text-lg">💳</span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">Cartão de crédito</p>
                    <p className="text-[10px] text-muted-foreground">Parcelamento disponível</p>
                  </div>
                </button>
              </div>

              {/* Fee display */}
              {billingMethod && billingAmount && parseFloat(billingAmount) > 0 &&
            <div className="bg-muted/50 border rounded-xl p-3">
                  {billingMethod === "card" &&
              <div className="mb-2">
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Parcelas</label>
                      <select
                  value={billingInstallments}
                  onChange={(e) => setBillingInstallments(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">

                        {getBillingInstallmentOptions().map((opt) =>
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                  )}
                      </select>
                    </div>
              }
                  {getBillingFeeLabel() &&
              <p className="text-xs text-muted-foreground">
                      💰 {getBillingFeeLabel()!.label}
                    </p>
              }
                </div>
            }

              <div className="flex gap-2">
                <button
                onClick={() => {setBillingStep("choose_type");setBillingMethod(null);}}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">

                  Voltar
                </button>
                <button onClick={handleSendBilling} disabled={!billingMethod}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                  Enviar cobrança
                </button>
              </div>
            </div>
          }
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{cardStep ? "Dados do cartão" : "Pagamento"}</DialogTitle>
          </DialogHeader>
          {paymentData && !cardStep &&
          <div className="space-y-4">
              <div className="text-center p-4 bg-muted/50 rounded-xl">
                {couponDiscount ?
              <>
                    <p className="text-sm line-through text-muted-foreground">R$ {parseFloat(paymentData.amount).toFixed(2).replace(".", ",")}</p>
                    <p className="text-2xl font-bold text-primary">R$ {getDiscountedAmount().toFixed(2).replace(".", ",")}</p>
                    <p className="text-[10px] text-primary font-medium mt-0.5">
                      Desconto de {couponDiscount.type === "percentage" ? `${couponDiscount.value}%` : `R$ ${couponDiscount.value.toFixed(2).replace(".", ",")}`} aplicado
                    </p>
                  </> :

              <p className="text-2xl font-bold text-foreground">R$ {parseFloat(paymentData.amount).toFixed(2).replace(".", ",")}</p>
              }
                <p className="text-xs text-muted-foreground mt-1">{paymentData.desc}</p>
              </div>

              {/* Coupon Section */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5" /> Cupom de desconto
                </p>
                {selectedCouponId ?
              <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl p-3">
                    <div>
                      <p className="text-sm font-semibold text-primary">
                        {couponDiscount?.type === "percentage" ? `${couponDiscount.value}% OFF` : `R$ ${couponDiscount?.value.toFixed(2).replace(".", ",")} OFF`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Cupom aplicado</p>
                    </div>
                    <button onClick={removeCoupon} className="text-xs text-destructive font-medium hover:underline">Remover</button>
                  </div> :
              availableCoupons.length > 0 ?
              <div className="space-y-1.5">
                    {availableCoupons.slice(0, 3).map((c) =>
                <button key={c.id} onClick={() => applyCoupon(c.id)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border hover:border-primary/30 hover:bg-primary/5 transition-colors">
                        <div className="text-left">
                          <p className="text-xs font-semibold text-foreground">
                            {c.discount_percent > 0 ? `${c.discount_percent}% de desconto` : "Cupom de desconto"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {c.expires_at ? `Expira: ${new Date(c.expires_at).toLocaleDateString("pt-BR")}` : "Sem expiração"}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-primary">Aplicar</span>
                      </button>
                )}
                  </div> :

              <p className="text-xs text-muted-foreground py-2">Nenhum cupom disponível</p>
              }
              </div>

              {/* Payment method - show only what the professional selected, or both if old format */}
              {paymentMethod ?
            <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Método de pagamento:</p>
                  <div className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-primary bg-primary/5">
                    <span className="text-lg">{paymentMethod === "pix" ? "📱" : "💳"}</span>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">{paymentMethod === "pix" ? "PIX" : "Cartão de crédito"}</p>
                      <p className="text-[10px] text-muted-foreground">{paymentMethod === "pix" ? "Pagamento instantâneo" : "Parcelamento disponível"}</p>
                    </div>
                  </div>
                </div> :

            <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Escolha o método de pagamento:</p>
                  <button
                onClick={() => handleSelectMethod("pix")}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-border hover:border-primary/30 transition-colors">

                    <span className="text-lg">📱</span>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">PIX</p>
                      <p className="text-[10px] text-muted-foreground">Pagamento instantâneo</p>
                    </div>
                  </button>
                  <button
                onClick={() => handleSelectMethod("card")}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-border hover:border-primary/30 transition-colors">

                    <span className="text-lg">💳</span>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">Cartão de crédito</p>
                      <p className="text-[10px] text-muted-foreground">Parcelamento disponível</p>
                    </div>
                  </button>
                </div>
            }

              {paymentMethod === "pix" &&
            <button
              onClick={handleConfirmPayment}
              disabled={processingPayment}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">

                  {processingPayment ? "Processando..." : "Confirmar pagamento via PIX"}
                </button>
            }

              {paymentMethod === "card" &&
            <button
              onClick={() => setCardStep(true)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">

                  Prosseguir com cartão
                </button>
            }
            </div>
          }

          {paymentData && cardStep &&
          <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">{paymentData.desc}</p>
                {couponDiscount ?
              <>
                    <p className="text-sm line-through text-muted-foreground">R$ {parseFloat(paymentData.amount).toFixed(2).replace(".", ",")}</p>
                    <p className="text-xl font-bold text-primary">R$ {getDiscountedAmount().toFixed(2).replace(".", ",")}</p>
                  </> :

              <p className="text-xl font-bold text-foreground">R$ {parseFloat(paymentData.amount).toFixed(2).replace(".", ",")}</p>
              }
              </div>


              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Número do cartão</label>
                  <input
                  value={cardForm.number}
                  onChange={(e) => setCardForm((f) => ({ ...f, number: formatCardNumber(e.target.value) }))}
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />

                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome no cartão</label>
                  <input
                  value={cardForm.name}
                  onChange={(e) => setCardForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
                  placeholder="NOME COMPLETO"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 uppercase" />

                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Validade</label>
                    <input
                    value={cardForm.expiry}
                    onChange={(e) => setCardForm((f) => ({ ...f, expiry: formatExpiry(e.target.value) }))}
                    placeholder="MM/AA"
                    maxLength={5}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />

                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">CVV</label>
                    <input
                    value={cardForm.cvv}
                    onChange={(e) => setCardForm((f) => ({ ...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    placeholder="123"
                    maxLength={4}
                    type="password"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />

                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Parcelas</label>
                  <select
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">

                    {getInstallmentOptions().map((opt) =>
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                  )}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">CEP</label>
                    <input
                    value={cardForm.postalCode}
                    onChange={(e) => setCardForm((f) => ({ ...f, postalCode: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
                    placeholder="00000000"
                    maxLength={8}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />

                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Nº endereço</label>
                    <input
                    value={cardForm.addressNumber}
                    onChange={(e) => setCardForm((f) => ({ ...f, addressNumber: e.target.value }))}
                    placeholder="123"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />

                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                onClick={() => {setCardStep(false);setPaymentMethod(null);}}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">

                  Voltar
                </button>
                <button
                onClick={handleConfirmPayment}
                disabled={processingPayment}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">

                  {processingPayment ? "Processando..." : "Pagar"}
                </button>
              </div>
            </div>
          }
        </DialogContent>
      </Dialog>

      {/* Rating Dialog */}
      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Avalie o profissional</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">Como foi sua experiência com {otherParty.name}?</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((s) =>
              <button key={s} onClick={() => setRatingStars(s)} className="transition-transform hover:scale-110">
                  <Star className={`w-8 h-8 ${s <= ratingStars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                </button>
              )}
            </div>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Deixe um comentário (opcional)..."
              rows={3}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none" />

            <button
              onClick={handleSubmitRating}
              disabled={ratingStars === 0}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">

              Enviar avaliação
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reward Coupon Dialog */}
      <Dialog open={rewardOpen} onOpenChange={setRewardOpen}>
        <DialogContent className="max-w-sm">
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              {rewardCoupon?.type === "discount" ?
              <Ticket className="w-8 h-8 text-primary" /> :

              <Star className="w-8 h-8 text-primary fill-primary" />
              }
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">🎉 Parabéns!</h3>
              <p className="text-sm text-muted-foreground mt-1">Você ganhou um novo cupom!</p>
            </div>
            {rewardCoupon?.type === "discount" ?
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-primary">{rewardCoupon.value}% OFF</p>
                <p className="text-xs text-muted-foreground mt-1">Cupom de desconto para o próximo serviço</p>
              </div> :

            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-lg font-bold text-primary">🎟️ Cupom de Sorteio</p>
                <p className="text-xs text-muted-foreground mt-1">Você está concorrendo ao sorteio mensal!</p>
              </div>
            }
            <button
              onClick={() => setRewardOpen(false)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">

              Entendido!
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIX QR Code Dialog */}
      <Dialog open={pixOpen} onOpenChange={(open) => {
        setPixOpen(open);
        if (!open && pixIntervalRef.current) {
          clearInterval(pixIntervalRef.current);
          setPixPolling(false);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">📱 Pagamento via PIX</DialogTitle>
          </DialogHeader>
          {pixData &&
          <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-3">Escaneie o QR Code ou copie o código PIX</p>
                <div className="bg-background border rounded-xl p-4 inline-block mx-auto">
                  <img
                  src={`data:image/png;base64,${pixData.qrCode}`}
                  alt="PIX QR Code"
                  className="w-48 h-48 mx-auto" />

                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Código PIX (Copia e Cola)</p>
                <div className="relative">
                  <textarea
                  readOnly
                  value={pixData.copyPaste}
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2.5 text-xs bg-muted/50 text-foreground resize-none font-mono" />

                  <button
                  onClick={() => {
                    navigator.clipboard.writeText(pixData.copyPaste);
                    setPixCopied(true);
                    toast({ title: "Código PIX copiado!" });
                    setTimeout(() => setPixCopied(false), 3000);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">

                    {pixCopied ?
                  <CheckCircle2 className="w-4 h-4 text-primary" /> :

                  <Copy className="w-4 h-4 text-primary" />
                  }
                  </button>
                </div>
              </div>

              {pixPolling &&
            <div className="flex items-center justify-center gap-2 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Aguardando confirmação do pagamento...</span>
                </div>
            }
            </div>
          }
        </DialogContent>
      </Dialog>
    </div>);

};

export default MessageThread;