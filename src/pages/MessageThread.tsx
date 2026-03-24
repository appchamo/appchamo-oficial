import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Send, DollarSign, X, Check, Star, Mic, Square, Loader2, Ticket, Copy, CheckCircle2, Handshake, LogOut, Crown, BadgeDollarSign, FileUp, Info, Package, Calendar } from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import BottomNav from "@/components/BottomNav";
import AgendaRescheduleDialog from "@/components/AgendaRescheduleDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";
import { formatCep, formatCpf, validateCpf } from "@/lib/formatters";
import { fetchViaCep } from "@/lib/viacep";
import { translateError } from "@/lib/errorMessages";

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

const getOptimizedAvatar = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.includes("supabase.co/storage/v1/object/public/")) {
    return url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") + "?width=96&height=96&resize=cover&quality=70";
  }
  return url;
};

const getOptimizedChatImage = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.includes("supabase.co/storage/v1/object/public/")) {
    return url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") + "?width=600&quality=75";
  }
  return url;
};

const MessageThread = () => {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isFetchingMessages, setIsFetchingMessages] = useState(true); // NOVO: Controle visual de carregamento
  
  // 🛡️ TRAVA ANTI-LOOP MESTRA: Impede que o load rode centenas de vezes
  const isInitialLoadDone = useRef(false);
  const isCurrentlyLoading = useRef(false);

  const [text, setText] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [otherParty, setOtherParty] = useState<OtherParty>({ name: "Chat", avatar_url: null });
  const [isProfessional, setIsProfessional] = useState(false);
  const [proAvailabilityStatus, setProAvailabilityStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [chatProUserId, setChatProUserId] = useState<string | null>(null);
  const [proSlug, setProSlug] = useState<string | null>(null);
  /** user_id do destinatário (quem recebe a mensagem) — usado para push de nova mensagem */
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);

  // Billing state
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingStep, setBillingStep] = useState<"choose_type" | "app_form" | "presencial_confirm">("choose_type");
  const [billingAmount, setBillingAmount] = useState("");
  const [billingDesc, setBillingDesc] = useState("");
  const [billingMethod, setBillingMethod] = useState<"pix" | "card" | null>(null);
  const [billingInstallments, setBillingInstallments] = useState("1");
  const [billingAnticipation, setBillingAnticipation] = useState(false);
  const [feeSettings, setFeeSettings] = useState<Record<string, string>>({});
  const [passFeeToClient, setPassFeeToClient] = useState(false); 
  const [closingCall, setClosingCall] = useState(false);
  const [requestProtocol, setRequestProtocol] = useState<string | null>(null);
  const [hasRated, setHasRated] = useState(false);
  const [proPlanId, setProPlanId] = useState<string | null>(null);
  const [viewingBilling, setViewingBilling] = useState<any | null>(null);

  // Payment state
  const [confirmServiceModal, setConfirmServiceModal] = useState<Message | null>(null);
  const [showPaymentPolicy, setShowPaymentPolicy] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{amount: string;desc: string;msgId: string; installments: string} | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card" | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [cardStep, setCardStep] = useState(false);
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "", postalCode: "", addressNumber: "", cpf: "" });
  const [cepFetchedAddress, setCepFetchedAddress] = useState<string | null>(null);
  const [searchingCep, setSearchingCep] = useState(false);
  // Etapa obrigatória antes de PIX/cartão: CPF + endereço (CEP → rua, bairro, número, cidade, estado)
  const [billingDataStep, setBillingDataStep] = useState(false);
  const [billingForm, setBillingForm] = useState({
    cpf: "", cep: "", street: "", neighborhood: "", number: "", city: "", state: "",
  });
  const [billingCepLoading, setBillingCepLoading] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const [installments, setInstallments] = useState("1");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [clientPassFee, setClientPassFee] = useState(false); 

  // Rating & Coupon states
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [requestStatus, setRequestStatus] = useState<string>("pending");
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<{type: string;value: number;} | null>(null);
  const [rewardCoupon, setRewardCoupon] = useState<{type: string;value: number;} | null>(null);
  const [rewardOpen, setRewardOpen] = useState(false);

  // Agenda (appointment) state
  const [appointment, setAppointment] = useState<{
    id: string;
    status: string;
    service_id: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    client_id: string;
    professional_id: string;
    agenda_services?: { name: string; duration_minutes?: number } | null;
  } | null>(null);
  const [remarcarOpen, setRemarcarOpen] = useState(false);
  const [agendaClientModal, setAgendaClientModal] = useState<"cancel" | "reschedule" | null>(null);

  // PIX & Audio states
  const [pixData, setPixData] = useState<{qrCode: string;copyPaste: string;paymentId: string;} | null>(null);
  const [pixOpen, setPixOpen] = useState(false);
  const [pixPolling, setPixPolling] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const pixIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Flag: usuário fechou o modal PIX manualmente — não reabrir automaticamente até novo pagamento. */
  const pixDismissedByUserRef = useRef(false);
  /** Parâmetros do pagamento PIX em andamento; usados ao confirmar (polling ou realtime). */
  const pixConfirmParamsRef = useRef<{
    threadId: string; userId: string; chatProUserId: string; finalAmount: number;
    originalAmount: number;
    couponDiscount: { type: string; value: number } | null; selectedCouponId: string | null;
    paymentDataAmount: string;
  } | null>(null);
  /** Guard: evita que Realtime + polling confirmem o pagamento duas vezes. */
  const pixConfirmFiredRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingLevelsRef = useRef<number[]>(Array(20).fill(0.2));
  const [recordingLevels, setRecordingLevels] = useState<number[]>(Array(20).fill(0.2));
  const recordingAnimRef = useRef<number | null>(null);

  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [dismissedReceipt, setDismissedReceipt] = useState(false);

  const isChatClosedByMessage = messages.some(m => m.content.includes("🔒 CHAMADA ENCERRADA") || m.content.includes("🚫 Solicitação cancelada"));
  const isChatFinished = requestStatus === "completed" || requestStatus === "closed" || requestStatus === "rejected" || requestStatus === "cancelled" || isChatClosedByMessage;
  const hasPaymentConfirmed = messages.some(m => m.content && m.content.includes("PAGAMENTO CONFIRMADO"));

  // Detecta se profissional não respondeu o cliente há mais de 4h
  const canCloseByDelay = (() => {
    if (isProfessional || isChatFinished || !userId) return false;
    const realMsgs = messages.filter(m => !m.id.startsWith("temp-"));
    if (realMsgs.length === 0) return false;
    const last = realMsgs[realMsgs.length - 1];
    // Última mensagem deve ser do cliente (eu), não do profissional
    if (last.sender_id !== userId) return false;
    const elapsed = Date.now() - new Date(last.created_at).getTime();
    return elapsed >= 4 * 60 * 60 * 1000; // 4 horas em ms
  })();

  /**
   * Quando o Realtime traz uma nova mensagem "PAGAMENTO CONFIRMADO" enquanto o modal PIX está aberto,
   * fecha o modal e abre o modal de avaliação — sem depender do polling.
   */
  useEffect(() => {
    if (!hasPaymentConfirmed) return;
    if (pixOpen) {
      // Modal PIX aberto: fecha e abre avaliação
      if (pixIntervalRef.current) { clearInterval(pixIntervalRef.current); pixIntervalRef.current = null; }
      setPixPolling(false);
      setPixOpen(false);
      setRatingOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPaymentConfirmed]);

  /**
   * Confirma um pagamento PIX que foi detectado como pago externamente
   * (ex.: usuário copiou código, saiu do app, pagou no banco e voltou).
   */
  const handlePixAutoConfirm = useCallback(async (totalAmount: number, paymentId: string) => {
    if (!threadId || !userId) return;
    // Guard: não confirmar duas vezes
    if (messages.some(m => m.content?.includes("✅ PAGAMENTO CONFIRMADO"))) return;

    try {
      const confirmContent = `✅ PAGAMENTO CONFIRMADO\nValor Pago: R$ ${totalAmount.toFixed(2).replace(".", ",")}\nMétodo: PIX`;
      await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: userId, content: confirmContent });

      // Garante status correto no banco
      await supabase.from("transactions").update({ status: "completed" }).eq("asaas_payment_id", paymentId);

      await sendNotification(userId, "✅ Pagamento Aprovado", `Pagamento via PIX de R$ ${totalAmount.toFixed(2).replace(".", ",")} confirmado.`, null, otherParty.avatar_url ?? null);
      if (chatProUserId) await sendNotification(chatProUserId, "💰 Pagamento Recebido!", `Você recebeu um pagamento via PIX de R$ ${totalAmount.toFixed(2).replace(".", ",")}!`, null, profile?.avatar_url ?? null);

      toast({ title: "Pagamento PIX confirmado!" });
      setPixOpen(false);
      if (pixIntervalRef.current) { clearInterval(pixIntervalRef.current); pixIntervalRef.current = null; }
      setPixPolling(false);
      setRatingOpen(true);
    } catch (err) {
      console.error("handlePixAutoConfirm error:", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, userId, chatProUserId, messages]);

  const loadFeeSettings = useCallback(async () => {
    const { data } = await supabase.from("platform_settings").select("key, value");
    if (data) {
      const map: Record<string, string> = {};
      for (const s of data) {
        const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value).replace(/^"|"$/g, "");
        map[s.key] = val;
      }
      setFeeSettings(map);
    }
  }, []);

  const sendNotification = async (targetId: string | null, title: string, msg: string, link: string | null = null, imageUrl: string | null = null) => {
    if (!targetId) return;
    try {
      await supabase.from("notifications").insert({
        user_id: targetId,
        title: title,
        message: msg,
        read: false,
        type: link ? "appointment" : "system",
        link: link,
        image_url: imageUrl
      } as any);
    } catch (err) {
      console.error("Erro ao enviar notificação:", err);
    }
  };

  /** Push para o destinatário: "Fulano enviou uma mensagem para você" + preview.
   *  A notificação inclui o avatar do REMETENTE para identificação visual. */
  const sendMessagePushNotification = async (recipientId: string | null, preview: string) => {
    if (!recipientId || !threadId) return;
    const senderName = profile?.full_name?.trim() || "Alguém";
    const title = `${senderName} enviou uma mensagem para você`;
    const body = preview.slice(0, 120);
    const senderAvatar = profile?.avatar_url || null;
    try {
      await supabase.from("notifications").insert({
        user_id: recipientId,
        title,
        message: body,
        read: false,
        type: "chat",
        link: `/messages/${threadId}`,
        image_url: senderAvatar
      } as any);
    } catch (err) {
      console.error("Erro ao enviar push de mensagem:", err);
    }
  };

  const markAppointmentDone = useCallback(async () => {
    if (!threadId) return;
    await supabase.from("agenda_appointments").update({ status: "done" }).eq("chat_request_id", threadId!);
  }, [threadId]);

  useEffect(() => { loadFeeSettings(); }, [loadFeeSettings]);

  // Detecta PIX pago externamente (usuário saiu do app e pagou no banco)
  // Roda: (a) após mensagens carregadas e (b) toda vez que o app volta ao foreground
  useEffect(() => {
    const checkExternalPix = async () => {
      if (!threadId || !userId || isFetchingMessages) return;
      if (hasPaymentConfirmed) return; // já confirmado no chat
      if (pixOpen) return; // modal já visível — o polling cuida disso
      if (pixDismissedByUserRef.current) return; // usuário fechou manualmente — não reabrir

      const { data: tx } = await supabase
        .from("transactions")
        .select("asaas_payment_id, total_amount, status, pix_qr_code, pix_copy_paste")
        .eq("request_id", threadId)
        .eq("client_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!tx) return;

      if (tx.status === "completed") {
        // Webhook já processou — confirmar no chat e abrir avaliação
        await handlePixAutoConfirm(tx.total_amount, tx.asaas_payment_id);
      } else if (tx.status === "pending" && tx.pix_qr_code) {
        // Pagamento ainda pendente — reabre o modal com o QR code existente e inicia polling
        setPixData({ qrCode: tx.pix_qr_code, copyPaste: tx.pix_copy_paste, paymentId: tx.asaas_payment_id });
        pixConfirmParamsRef.current = {
          threadId: threadId!,
          userId: userId!,
          chatProUserId: chatProUserId || "",
          finalAmount: tx.total_amount,
          originalAmount: tx.total_amount,
          couponDiscount: null,
          selectedCouponId: null,
          paymentDataAmount: String(tx.total_amount),
        };
        setPixOpen(true);
        setPixPolling(true);
        if (pixIntervalRef.current) clearInterval(pixIntervalRef.current);
        const pmtId = tx.asaas_payment_id;
        const pmtAmount = tx.total_amount;
        pixIntervalRef.current = setInterval(async () => {
          try {
            const check = await supabase.functions.invoke("create_payment", {
              body: { action: "check_payment_status", payment_id: pmtId },
            });
            if (check.data?.confirmed) {
              clearInterval(pixIntervalRef.current!);
              pixIntervalRef.current = null;
              setPixPolling(false);
              await handlePixAutoConfirm(pmtAmount, pmtId);
            }
          } catch { /* ignore */ }
        }, 3000);
      }
    };

    checkExternalPix();

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkExternalPix();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, userId, chatProUserId, hasPaymentConfirmed, pixOpen, isFetchingMessages, handlePixAutoConfirm]);

  useEffect(() => {
    if (threadId && localStorage.getItem(`receipt_dismissed_${threadId}`) === "true") {
      setDismissedReceipt(true);
    }
  }, [threadId]);

  const load = useCallback(async () => {
    if (!threadId || isCurrentlyLoading.current) return;
    isCurrentlyLoading.current = true;
    setIsFetchingMessages(true);

    try {
      // getSession() usa cache local — sem chamada de rede
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (user) setUserId(user.id);

      // ⚡ Busca request + mensagens em paralelo (maior ganho de velocidade)
      const [{ data: req }, { data: msgs }] = await Promise.all([
        supabase.from("service_requests").select("*").eq("id", threadId).maybeSingle(),
        supabase.from("chat_messages").select("*").eq("request_id", threadId).order("created_at"),
      ]);

      setMessages((msgs as Message[]) || []);

      if (req && user) {
        setRequestStatus(req.status);
        setRequestProtocol((req as any).protocol || null);
        const isClient = req.client_id === user.id;

        // ⚡ Paraleliza tudo que depende de req + user
        const proQuery = supabase.from("professionals").select("user_id, availability_status, slug").eq("id", req.professional_id).maybeSingle();
        const reviewCountQuery = (isClient && (req.status === "completed" || req.status === "closed"))
          ? supabase.from("reviews").select("*", { count: "exact", head: true }).eq("request_id", threadId).eq("client_id", user.id)
          : Promise.resolve({ count: null });
        const appointmentQuery = supabase
          .from("agenda_appointments")
          .select("id, status, service_id, appointment_date, start_time, end_time, client_id, professional_id, atendente_id, agenda_services(name, duration_minutes)")
          .eq("chat_request_id", threadId).order("start_time", { ascending: true }).limit(1).maybeSingle();

        const [proRes, reviewRes, appRes] = await Promise.all([proQuery, reviewCountQuery, appointmentQuery]);
        const pro = proRes.data;

        if ((reviewRes as any).count > 0) setHasRated(true);
        setAppointment(appRes.data ? (appRes.data as any) : null);

        if (pro) {
          if (isClient) {
            setProAvailabilityStatus((pro as any).availability_status || "available");
            setProSlug((pro as any).slug || null);
          }
          if (!isClient && pro.user_id === user.id) {
            setIsProfessional(true);
            setChatProUserId(user.id);
            // Busca plano do profissional sem bloquear
            supabase.from("subscriptions").select("plan_id").eq("user_id", user.id).maybeSingle()
              .then(({ data: sub }) => setProPlanId(sub?.plan_id || "free"));
          }

          if (isClient) {
            setChatProUserId(pro.user_id);
            setRecipientUserId(pro.user_id);
            const { data: profile } = (await supabase
              .from("profiles_public" as any).select("full_name, avatar_url").eq("user_id", pro.user_id).maybeSingle()) as { data: { full_name: string; avatar_url: string | null } | null };
            if (profile) setOtherParty({ name: profile.full_name || "Profissional", avatar_url: profile.avatar_url });
          } else {
            setRecipientUserId(req.client_id);
            const { data: profile } = (await supabase
              .from("profiles_public" as any).select("full_name, avatar_url").eq("user_id", req.client_id).maybeSingle()) as { data: { full_name: string; avatar_url: string | null } | null };
            if (profile) setOtherParty({ name: profile.full_name || "Cliente", avatar_url: profile.avatar_url });
          }
        }
      }
    } catch (err) {
      console.error("Erro ao carregar chat:", err);
    } finally {
      setIsFetchingMessages(false);
      isInitialLoadDone.current = true;
      setTimeout(() => { isCurrentlyLoading.current = false; }, 1000);
    }
  }, [threadId]);

  // CHAMA O LOAD APENAS SE AINDA NÃO FOI FEITO
  useEffect(() => {
    if (threadId && !isInitialLoadDone.current) {
      load();
    }
  }, [threadId, load]);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`chat-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `request_id=eq.${threadId}` },
        (payload) => {
          setMessages((prev) => {
            const incoming = payload.new as Message;
            // Já existe pelo id real → ignora
            if (prev.some(m => m.id === incoming.id)) return prev;
            // Substitui possível mensagem otimista (temp-*) do mesmo remetente com mesmo conteúdo
            const tempIdx = prev.findIndex(
              m => m.id.startsWith("temp-") && m.sender_id === incoming.sender_id && m.content === incoming.content
            );
            if (tempIdx !== -1) {
              const next = [...prev];
              next[tempIdx] = incoming;
              return next;
            }
            return [...prev, incoming];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

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
    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  useEffect(() => {
    if (!threadId || !appointment?.id) return;
    const channel = supabase
      .channel(`appointment-${appointment.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "agenda_appointments", filter: `id=eq.${appointment.id}` },
        (payload) => {
          const updated = payload.new as any;
          setAppointment((a) => (a && a.id === updated.id ? { ...a, ...updated } : a));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId, appointment?.id]);

  useEffect(() => {
    return () => {
      if (pixIntervalRef.current) clearInterval(pixIntervalRef.current);
    };
  }, []);

  // Realtime: quando o webhook Asaas atualiza transaction para paid, fechar modal PIX e abrir avaliação na hora
  useEffect(() => {
    if (!pixOpen || !pixData?.paymentId) return;
    const paymentId = pixData.paymentId;
    const channel = supabase
      .channel(`pix-payment-${paymentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `asaas_payment_id=eq.${paymentId}`,
        },
        async (payload: { new: { status?: string } }) => {
          if (payload.new?.status !== "completed") return;
          const params = pixConfirmParamsRef.current;
          if (!params) return;
          // Guard: evita confirmação dupla (polling + realtime)
          if (pixConfirmFiredRef.current) return;
          pixConfirmFiredRef.current = true;
          if (pixIntervalRef.current) {
            clearInterval(pixIntervalRef.current);
            pixIntervalRef.current = null;
          }
          setPixPolling(false);
          const discountNote = params.couponDiscount
            ? `\nDesconto: ${params.couponDiscount.type === "percentage" ? `${params.couponDiscount.value}%` : `R$ ${params.couponDiscount.value.toFixed(2).replace(".", ",")}`}`
            : "";
          const proNet = calcProfessionalNet(params.originalAmount, "pix");
          const confirmContent = `✅ PAGAMENTO CONFIRMADO\nValor Pago: R$ ${params.finalAmount.toFixed(2).replace(".", ",")}${discountNote}\nMétodo: PIX\nRecebe: R$ ${proNet.toFixed(2).replace(".", ",")}`;
          await supabase.from("chat_messages").insert({
            request_id: params.threadId,
            sender_id: params.userId,
            content: confirmContent,
          });
          if (params.selectedCouponId) {
            await supabase.from("coupons").update({ used: true } as any).eq("id", params.selectedCouponId);
          }
          await sendNotification(params.userId, "✅ Pagamento Aprovado", `Seu pagamento via PIX de R$ ${params.finalAmount.toFixed(2).replace(".", ",")} foi confirmado com sucesso.`, null, otherParty.avatar_url ?? null);
          if (params.chatProUserId) await sendNotification(params.chatProUserId, "💰 Pagamento Recebido!", `Você vai receber R$ ${proNet.toFixed(2).replace(".", ",")} via PIX (líquido após taxas).`, null, profile?.avatar_url ?? null);
          await awardPostPaymentCoupon(parseFloat(params.paymentDataAmount));
          toast({ title: "Pagamento PIX confirmado!" });
          setPixOpen(false);
          setRatingOpen(true);
          pixConfirmParamsRef.current = null;
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pixOpen, pixData?.paymentId]);

  useEffect(() => {
    const state = location.state as { showAgendaModal?: "cancel" | "reschedule" } | null;
    const modal = state?.showAgendaModal;
    if (modal === "cancel" || modal === "reschedule") {
      setAgendaClientModal(modal);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  // Controla se é o primeiro render (scroll instantâneo) ou mensagem nova (smooth)
  const isFirstScrollRef = useRef(true);

  useEffect(() => {
    if (messages.length === 0) return;
    const behavior = isFirstScrollRef.current ? "instant" : "smooth";
    isFirstScrollRef.current = false;
    bottomRef.current?.scrollIntoView({ behavior: behavior as ScrollBehavior });

    if (threadId && userId) {
      supabase.from("chat_read_status" as any).upsert(
        { request_id: threadId, user_id: userId, last_read_at: new Date().toISOString() },
        { onConflict: "request_id,user_id" }
      ).then();
    }
  }, [messages, threadId, userId]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !userId || !threadId) return;

    // ── Update otimista: mensagem aparece IMEDIATAMENTE na UI ──────────
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: userId,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setText("");
    setSending(true);

    const { data: inserted, error } = await supabase.from("chat_messages").insert({
      request_id: threadId,
      sender_id: userId,
      content,
    }).select().maybeSingle();

    if (error) {
      // Remove a mensagem otimista em caso de erro
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(content); // restaura o texto
      toast({ title: "Erro ao enviar mensagem", variant: "destructive" });
    } else {
      // Substitui a mensagem temp pelo registro real (evita duplicata do realtime)
      if (inserted) {
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? (inserted as Message) : m)
        );
      }
      sendMessagePushNotification(recipientUserId, content);
    }
    setSending(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      // Barra de áudio ao vivo: AnalyserNode + requestAnimationFrame
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const barCount = 20;

      const updateLevels = () => {
        if (!analyserRef.current || !audioContextRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        const step = Math.floor(dataArray.length / barCount);
        const levels = Array.from({ length: barCount }, (_, i) => {
          const idx = i * step;
          const v = dataArray[idx] ?? 0;
          return 0.2 + (v / 255) * 0.8;
        });
        recordingLevelsRef.current = levels;
        setRecordingLevels([...levels]);
        recordingAnimRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      const isApp = Capacitor.isNativePlatform();
      toast({
        title: "Microfone indisponível",
        description: isApp
          ? "Vá em Ajustes > Chamô e permita o acesso ao microfone. Depois abra o app novamente."
          : "Verifique se o site tem permissão para usar o microfone nas configurações do navegador.",
        variant: "destructive",
      });
    }
  };

  const cancelRecording = () => {
    if (recordingAnimRef.current) {
      cancelAnimationFrame(recordingAnimRef.current);
      recordingAnimRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
    setRecordingLevels(Array(20).fill(0.2));
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
    if (recordingAnimRef.current) {
      cancelAnimationFrame(recordingAnimRef.current);
      recordingAnimRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setRecordingLevels(Array(20).fill(0.2));

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
    else sendMessagePushNotification(recipientUserId, "Áudio");
    setUploadingAudio(false);
    setRecordingTime(0);
  };

  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Calcula o líquido do profissional sobre um valor ORIGINAL (sem desconto de cupom)
  const calcProfessionalNet = (originalAmount: number, method: "pix" | "card", installments = 1): number => {
    const commissionPct = parseFloat(feeSettings.commission_pct || "10");
    const commission = parseFloat((originalAmount * commissionPct / 100).toFixed(2));
    let gatewayFee = 0;
    if (method === "pix") {
      const pct   = parseFloat(feeSettings.pix_fee_pct || "0");
      const fixed = parseFloat(feeSettings.pix_fee_fixed || "0");
      gatewayFee = parseFloat(((originalAmount * pct / 100) + fixed).toFixed(2));
    } else {
      const feePct = installments === 1 ? parseFloat(feeSettings.card_fee_pct || "0") : parseFloat(feeSettings[`installment_fee_${installments}x`] || "0");
      const feeFixed = installments === 1 ? parseFloat(feeSettings.card_fee_fixed || "0") : 0;
      gatewayFee = parseFloat(((originalAmount * feePct / 100) + feeFixed).toFixed(2));
    }
    return parseFloat((originalAmount - commission - gatewayFee).toFixed(2));
  };

  /** Retorna a taxa (%) para N parcelas respeitando o modo de configuração (pacote ou individual) */
  const getInstallmentPackageRate = (installments: number): number => {
    const mode = feeSettings.installment_mode || "individual";
    if (mode === "package" && feeSettings.installment_packages) {
      try {
        const pkgs = JSON.parse(feeSettings.installment_packages);
        const pkg = Array.isArray(pkgs)
          ? pkgs.find((p: any) => installments >= Number(p.from) && installments <= Number(p.to))
          : null;
        if (pkg) return parseFloat(pkg.rate || "0");
      } catch { /* fallback individual */ }
    }
    // Modo individual
    if (installments === 1) return parseFloat(feeSettings.card_fee_pct || "0");
    return parseFloat(feeSettings[`installment_fee_${installments}x`] || "0");
  };

  /** Calcula taxa de antecipação sobre o valor base */
  const calcAnticipationFee = (amount: number, installments: number): number => {
    const antMode = feeSettings.anticipation_mode || "simple";
    if (antMode === "monthly") {
      const monthlyRate = parseFloat(feeSettings.anticipation_monthly_rate || "1.15");
      return parseFloat((amount * monthlyRate / 100 * installments).toFixed(2));
    }
    const antPct = parseFloat(feeSettings.anticipation_fee_pct || "3.5");
    return parseFloat((amount * antPct / 100).toFixed(2));
  };

  const getBillingFeeBreakdown = (withAnticipation = billingAnticipation) => {
    if (!billingMethod || !billingAmount) return null;
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) return null;

    const commissionPct  = parseFloat(feeSettings.commission_pct || "10");
    const commissionFee  = parseFloat((amount * commissionPct / 100).toFixed(2));

    let paymentFeePct   = 0;
    let paymentFeeFixed = 0;
    let paymentFee      = 0;

    if (billingMethod === "pix") {
      paymentFeePct   = parseFloat(feeSettings.pix_fee_pct || "0");
      paymentFeeFixed = parseFloat(feeSettings.pix_fee_fixed || "0");
      paymentFee      = parseFloat((amount * paymentFeePct / 100 + paymentFeeFixed).toFixed(2));
    } else if (billingMethod === "card") {
      const inst      = parseInt(billingInstallments);
      paymentFeePct   = getInstallmentPackageRate(inst);
      paymentFeeFixed = inst === 1 ? parseFloat(feeSettings.card_fee_fixed || "0") : 0;
      paymentFee      = parseFloat((amount * paymentFeePct / 100 + paymentFeeFixed).toFixed(2));
    }

    // Taxa de antecipação
    const anticipationFee = (withAnticipation && billingMethod === "card")
      ? calcAnticipationFee(amount, parseInt(billingInstallments))
      : 0;

    if (passFeeToClient) {
      // Todas as taxas são embutidas no valor cobrado do cliente.
      // O profissional recebe o valor base integral.
      const totalAddedToClient = parseFloat((commissionFee + paymentFee + anticipationFee).toFixed(2));
      const clientTotal = parseFloat((amount + totalAddedToClient).toFixed(2));
      return {
        net: amount,             // profissional recebe valor base
        commissionFee,
        paymentFee,
        anticipationFee,
        totalAddedToClient,
        clientTotal,
        totalFee: 0,             // profissional não paga nada
        pct: paymentFeePct,
        fixed: paymentFeeFixed,
        passedToClient: true,
      };
    }

    // "Sem Juros" — todas as taxas saem do bolso do profissional
    const totalFee = parseFloat((commissionFee + paymentFee + anticipationFee).toFixed(2));
    const net      = parseFloat((amount - totalFee).toFixed(2));
    return {
      net,
      commissionFee,
      paymentFee,
      anticipationFee,
      totalAddedToClient: 0,
      clientTotal: amount,
      totalFee,
      pct: paymentFeePct,
      fixed: paymentFeeFixed,
      passedToClient: false,
    };
  };

  // mantém compatibilidade com código que usa .label
  const getBillingFeeLabel = () => {
    const b = getBillingFeeBreakdown();
    if (!b) return null;
    return { fee: b.totalFee, label: "" };
  };

  const getBillingInstallmentOptions = () => {
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) return [];
    const maxInst = parseInt(feeSettings.max_installments || "12");
    const commissionPct = parseFloat(feeSettings.commission_pct || "10");
    const options = [];
    for (let i = 1; i <= maxInst; i++) {
      const feePct   = getInstallmentPackageRate(i);
      const feeFixed = i === 1 ? parseFloat(feeSettings.card_fee_fixed || "0") : 0;
      const cardFee  = (amount * feePct / 100) + feeFixed;

      if (passFeeToClient) {
        // Valor que o cliente paga = base + comissão + taxa cartão + antecipação (se selecionada)
        const commissionFee  = amount * commissionPct / 100;
        const anticipationFee = billingAnticipation ? calcAnticipationFee(amount, i) : 0;
        const clientTotal    = amount + commissionFee + cardFee + anticipationFee;
        const val = (clientTotal / i).toFixed(2).replace(".", ",");
        options.push({ value: String(i), label: `${i}x de R$ ${val}` });
      } else {
        // Profissional absorve as taxas — cliente vê apenas o valor base dividido
        const val = (amount / i).toFixed(2).replace(".", ",");
        options.push({ value: String(i), label: `${i}x de R$ ${val}` });
      }
    }
    return options;
  };

  const handleSendBilling = async () => {
    if (!billingAmount || !userId || !threadId || !billingMethod) return;
    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) {toast({ title: "Valor inválido", variant: "destructive" });return;}

    const methodLabel = billingMethod === "pix" ? "PIX" : `Cartão`;
    const feeText = passFeeToClient ? "\nTaxa: Por conta do cliente" : "";
    const antText = (billingAnticipation && billingMethod === "card") ? "\nAntecipação: Sim (~7 dias úteis)" : "";
    
    const billingContent = `💰 COBRANÇA\nValor base: R$ ${amount.toFixed(2).replace(".", ",")}\n${billingDesc ? `Descrição: ${billingDesc}\n` : ""}Forma: ${methodLabel}${feeText}${antText}\n\n[COBRAR:${amount}:${billingDesc || "Serviço"}:${billingMethod}:${billingInstallments}:${passFeeToClient ? "true" : "false"}:${(billingAnticipation && billingMethod === "card") ? "true" : "false"}]`;

    const { error } = await supabase.from("chat_messages").insert({
      request_id: threadId,
      sender_id: userId,
      content: billingContent
    });
    if (error) toast({ title: "Erro ao enviar cobrança", variant: "destructive" }); else {
      sendMessagePushNotification(recipientUserId, "Cobrança");
      setBillingOpen(false);
      setBillingAmount("");
      setBillingDesc("");
      setBillingMethod(null);
      setBillingInstallments("1");
      setPassFeeToClient(false);
      setBillingAnticipation(false);
      toast({ title: "Cobrança enviada!" });
    }
  };

  const parseBilling = (content: string) => {
    // V4: com antecipação [COBRAR:amount:desc:method:installments:passFee:anticipation]
    const matchV4 = content.match(/\[COBRAR:([0-9.]+):(.*):(\w+):(\d+):(true|false):(true|false)\]/);
    if (matchV4) return { amount: matchV4[1], desc: matchV4[2], method: matchV4[3] as "pix" | "card", installments: matchV4[4], passFee: matchV4[5] === "true", anticipation: matchV4[6] === "true" };

    // V3: sem antecipação
    const matchV3 = content.match(/\[COBRAR:([0-9.]+):(.*):(\w+):(\d+):(true|false)\]/);
    if (matchV3) return { amount: matchV3[1], desc: matchV3[2], method: matchV3[3] as "pix" | "card", installments: matchV3[4], passFee: matchV3[5] === "true", anticipation: false };

    const matchNew = content.match(/\[COBRAR:([0-9.]+):(.*):(\w+):(\d+)\]/);
    if (matchNew) return { amount: matchNew[1], desc: matchNew[2], method: matchNew[3] as "pix" | "card", installments: matchNew[4], passFee: false, anticipation: false };

    const match = content.match(/\[COBRAR:([0-9.]+):(.*)\]/);
    if (match) return { amount: match[1], desc: match[2], method: null, installments: "1", passFee: false, anticipation: false };
    
    return null;
  };

  const openPayment = async (msg: Message) => {
    await loadFeeSettings();
    const billing = parseBilling(msg.content);
    if (!billing) return;
    setPaymentData({ amount: billing.amount, desc: billing.desc, msgId: msg.id, installments: billing.installments });

    setClientPassFee(billing.passFee);
    setPaymentMethod(billing.method);
    setCardStep(false);
    setPaymentConfirmed(false);
    setCardForm({ number: "", name: "", expiry: "", cvv: "", postalCode: "", addressNumber: "", cpf: "" });
    if (!billing.method) setInstallments("1");
    setSelectedCouponId(null);
    setCouponDiscount(null);

    // Sempre abrir na etapa "Dados para pagamento" (CPF + endereço) para o usuário poder corrigir ou tentar outro CPF (ex.: após "CPF já cadastrado")
    let initialBillingForm = { cpf: "", cep: "", street: "", neighborhood: "", number: "", city: "", state: "" };

    if (userId) {
      const [profileRes, couponsRes] = await Promise.all([
        supabase.from("profiles").select("cpf, cnpj, address_zip, address_street, address_number, address_neighborhood, address_city, address_state").eq("user_id", userId).single(),
        supabase.from("coupons").select("*").eq("user_id", userId).eq("coupon_type", "discount").eq("used", false).order("created_at", { ascending: false }),
      ]);
      const p = profileRes.data as { cpf?: string; cnpj?: string; address_zip?: string; address_street?: string; address_number?: string; address_neighborhood?: string; address_city?: string; address_state?: string } | null;
      const cpfRaw = String(p?.cpf || "").replace(/\D/g, "");
      initialBillingForm = {
        cpf: cpfRaw.length === 11 ? cpfRaw : "",
        cep: (p?.address_zip || "").replace(/\D/g, ""),
        street: p?.address_street || "",
        neighborhood: p?.address_neighborhood || "",
        number: p?.address_number || "",
        city: p?.address_city || "",
        state: p?.address_state || "",
      };
      const valid = (couponsRes.data || []).filter((c: any) => !c.expires_at || new Date(c.expires_at) > new Date());
      setAvailableCoupons(valid);
    }

    setBillingDataStep(true);
    setBillingForm(initialBillingForm);
    setPaymentOpen(true);
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

  const handleBillingCepChange = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, "").slice(0, 8);
    setBillingForm((f) => ({ ...f, cep: clean }));
    if (clean.length === 8) {
      setBillingCepLoading(true);
      try {
        const data = await fetchViaCep(clean);
        if (data) {
          setBillingForm((f) => ({
            ...f,
            street: data.logradouro || f.street,
            neighborhood: data.bairro || f.neighborhood,
            city: data.localidade || f.city,
            state: (data.uf || f.state).toUpperCase(),
          }));
        }
      } finally {
        setBillingCepLoading(false);
      }
    }
  };

  const handleSaveBillingAndContinue = async () => {
    const cpfClean = billingForm.cpf.replace(/\D/g, "");
    if (!validateCpf(billingForm.cpf)) {
      toast({ title: "CPF obrigatório", description: "Informe um CPF válido (11 dígitos).", variant: "destructive" });
      return;
    }
    if (billingForm.cep.replace(/\D/g, "").length !== 8) {
      toast({ title: "CEP inválido", description: "Informe um CEP com 8 dígitos.", variant: "destructive" });
      return;
    }
    if (!billingForm.street?.trim()) {
      toast({ title: "Preencha a rua", variant: "destructive" });
      return;
    }
    if (!billingForm.number?.trim()) {
      toast({ title: "Preencha o número do endereço", variant: "destructive" });
      return;
    }
    if (!billingForm.city?.trim() || !billingForm.state?.trim()) {
      toast({ title: "Preencha cidade e estado (busque pelo CEP primeiro)", variant: "destructive" });
      return;
    }
    if (!userId) return;
    setSavingBilling(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        cpf: cpfClean,
        address_zip: billingForm.cep.replace(/\D/g, ""),
        address_street: billingForm.street.trim(),
        address_number: billingForm.number.trim(),
        address_neighborhood: billingForm.neighborhood.trim() || null,
        address_city: billingForm.city.trim(),
        address_state: billingForm.state.trim().toUpperCase().slice(0, 2),
      })
      .eq("user_id", userId);
    setSavingBilling(false);
    if (error) {
      toast({ title: "Erro ao salvar dados", description: translateError(error.message), variant: "destructive" });
      return;
    }
    toast({ title: "Dados salvos. Prosseguindo ao pagamento." });
    setBillingDataStep(false);
  };

  const getDiscountedAmount = () => {
    if (!paymentData || !couponDiscount) return paymentData ? parseFloat(paymentData.amount) : 0;
    const amount = parseFloat(paymentData.amount);
    if (couponDiscount.type === "percentage") {
      return Math.max(0, amount * (1 - couponDiscount.value / 100));
    }
    return Math.max(0, amount - couponDiscount.value);
  };

  const getFinalAmountWithFee = (installmentsCount: number = 1, method: "pix" | "card" | null = paymentMethod) => {
    const baseAmount = getDiscountedAmount();
    if (!clientPassFee) return baseAmount; 

    let fee = 0;
    if (method === "card") {
       const i = installmentsCount;
       const feePct = i === 1 ? parseFloat(feeSettings.card_fee_pct || "0") : parseFloat(feeSettings[`installment_fee_${i}x`] || "0");
       const feeFixed = i === 1 ? parseFloat(feeSettings.card_fee_fixed || "0") : 0;
       fee = (baseAmount * feePct / 100) + feeFixed;
    } else if (method === "pix") {
       const feePct = parseFloat(feeSettings.pix_fee_pct || "0");
       const feeFixed = parseFloat(feeSettings.pix_fee_fixed || "0");
       fee = (baseAmount * feePct / 100) + feeFixed;
    }
    return baseAmount + fee;
  };

  const calculateProfessionalReceive = (b: any) => {
    const amount = parseFloat(b.amount);
    const commissionPct = parseFloat(feeSettings.commission_pct || "10");
    const commission = parseFloat((amount * commissionPct / 100).toFixed(2));

    // Comissão da plataforma é SEMPRE descontada do profissional
    if (b.passFee) return parseFloat((amount - commission).toFixed(2));

    let gatewayFee = 0;
    if (b.method === 'pix') {
      gatewayFee = parseFloat(((amount * parseFloat(feeSettings.pix_fee_pct || "0") / 100) + parseFloat(feeSettings.pix_fee_fixed || "0")).toFixed(2));
    } else if (b.method === 'card') {
      const i = parseInt(b.installments || "1");
      const feePct = i === 1 ? parseFloat(feeSettings.card_fee_pct || "0") : parseFloat(feeSettings[`installment_fee_${i}x`] || "0");
      const feeFixed = i === 1 ? parseFloat(feeSettings.card_fee_fixed || "0") : 0;
      gatewayFee = parseFloat(((amount * feePct / 100) + feeFixed).toFixed(2));
    }
    return parseFloat((amount - commission - gatewayFee).toFixed(2));
  };

  const calculateProfessionalReceiveBreakdown = (b: any) => {
    const amount = parseFloat(b.amount);
    const commissionPct = parseFloat(feeSettings.commission_pct || "10");
    const commissionFee = parseFloat((amount * commissionPct / 100).toFixed(2));
    let gatewayFee = 0;
    let gatewayLabel = "";
    if (!b.passFee) {
      if (b.method === 'pix') {
        const pct  = parseFloat(feeSettings.pix_fee_pct || "0");
        const fixed = parseFloat(feeSettings.pix_fee_fixed || "0");
        gatewayFee = parseFloat(((amount * pct / 100) + fixed).toFixed(2));
        const parts: string[] = [];
        if (pct > 0) parts.push(`${pct}%`);
        if (fixed > 0) parts.push(`R$ ${fixed.toFixed(2).replace(".", ",")}`);
        gatewayLabel = `PIX${parts.length ? ` (${parts.join(" + ")})` : ""}`;
      } else if (b.method === 'card') {
        const i = parseInt(b.installments || "1");
        const feePct = i === 1 ? parseFloat(feeSettings.card_fee_pct || "0") : parseFloat(feeSettings[`installment_fee_${i}x`] || "0");
        const feeFixed = i === 1 ? parseFloat(feeSettings.card_fee_fixed || "0") : 0;
        gatewayFee = parseFloat(((amount * feePct / 100) + feeFixed).toFixed(2));
        gatewayLabel = `Cartão${feePct > 0 ? ` (${feePct}%)` : ""}`;
      }
    }
    // Taxa de antecipação (sobre valor bruto, igual ao formulário de cobrança)
    const hasAnticipation = !!(b.anticipation && b.method === "card");
    const anticipationPct = parseFloat(feeSettings.anticipation_fee_pct || "0");
    const anticipationFee = hasAnticipation ? parseFloat((amount * anticipationPct / 100).toFixed(2)) : 0;

    const net = parseFloat((amount - commissionFee - gatewayFee - anticipationFee).toFixed(2));
    return { amount, commissionFee, commissionPct, gatewayFee, gatewayLabel, net, passFee: b.passFee, anticipationFee, anticipationPct, hasAnticipation };
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
    const baseAmount = getDiscountedAmount();
    const options = [];
    const maxInstallments = baseAmount >= 100 ? 12 : baseAmount >= 50 ? 6 : baseAmount >= 20 ? 3 : 1;

    for (let i = 1; i <= maxInstallments; i++) {
      let fee = 0;
      if (clientPassFee) {
         const feePct = i === 1 ? parseFloat(feeSettings.card_fee_pct || "0") : parseFloat(feeSettings[`installment_fee_${i}x`] || "0");
         const feeFixed = i === 1 ? parseFloat(feeSettings.card_fee_fixed || "0") : 0;
         fee = (baseAmount * feePct / 100) + feeFixed;
      }
      const totalWithFee = baseAmount + fee;
      const val = (totalWithFee / i).toFixed(2).replace(".", ",");
      options.push({ value: String(i), label: i === 1 ? `1x de R$ ${val} (à vista)` : `${i}x de R$ ${val}` });
    }
    return options;
  };

  const awardPostPaymentCoupon = async (paymentAmount: number) => {
    if (!userId) return;
    try {
      const { data: settings } = await supabase.from("platform_settings").select("*").in("key", ["auto_discount_active", "auto_raffle_active"]);
      const isDiscountActive = settings?.find(s => s.key === "auto_discount_active")?.value === "true";
      const isRaffleActive = settings?.find(s => s.key === "auto_raffle_active")?.value === "true";

      if (!isDiscountActive && !isRaffleActive) {
        setRewardCoupon(null);
        return;
      }

      let awardedDiscount = false;

      if (isDiscountActive) {
        const { data: campaigns } = await supabase
          .from("coupon_campaigns")
          .select("*")
          .eq("is_active", true)
          .lte("min_purchase_value", paymentAmount)
          .order("created_at", { ascending: true }); 

        if (campaigns && campaigns.length > 0) {
          const validCampaign = campaigns.find(c =>
            (c.max_purchase_value === null || c.max_purchase_value === 0 || paymentAmount <= c.max_purchase_value) &&
            (c.used_quantity < c.total_quantity)
          );

          if (validCampaign) {
            const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
            await supabase.from("coupons").insert({
              user_id: userId,
              coupon_type: "discount",
              source: "payment",
              discount_percent: validCampaign.discount_percent,
              used: false,
              expires_at: expiresAt
            } as any);

            await supabase.from("coupon_campaigns").update({ used_quantity: validCampaign.used_quantity + 1 }).eq("id", validCampaign.id);

            setRewardCoupon({ type: "discount", value: validCampaign.discount_percent });
            await sendNotification(userId, "🎟️ Novo Cupom de Desconto!", `Você ganhou ${validCampaign.discount_percent}% OFF para usar no seu próximo serviço. Confira na aba Meus Cupons.`);
            awardedDiscount = true;
          }
        }
      }

      if (!awardedDiscount && isRaffleActive) {
        await supabase.from("coupons").insert({
          user_id: userId,
          coupon_type: "raffle",
          source: "payment",
          discount_percent: 0,
          used: false
        } as any);

        setRewardCoupon({ type: "raffle", value: 0 });
        await sendNotification(userId, "🎟️ Novo Cupom de Sorteio!", "Você ganhou um cupom para o Sorteio Mensal! Boa sorte.");
      }

    } catch (err) {
      console.error("Erro ao gerar cupom no banco:", err);
    }
  };

  const handleConfirmPayment = async () => {
    if (!paymentMethod || !paymentData || !userId || !threadId) return;

    if (paymentMethod === "card") {
      if (!cardForm.number || !cardForm.name || !cardForm.expiry || !cardForm.cvv) {
        toast({ title: "Preencha todos os dados do cartão", variant: "destructive" });
        return;
      }
      if (!validateCpf(cardForm.cpf)) {
        toast({ title: "CPF obrigatório", description: "Informe um CPF válido (11 dígitos).", variant: "destructive" });
        return;
      }
      if (cardForm.number.replace(/\s/g, "").length < 16) {
        toast({ title: "Número do cartão inválido", variant: "destructive" });
        return;
      }
      const { data: profileCheck } = await supabase.
      from("profiles").
      select("address_zip, address_number").
      eq("user_id", userId).
      single();
      const hasAddress = (profileCheck?.address_zip || cardForm.postalCode) && (profileCheck?.address_number || cardForm.addressNumber);
      if (!hasAddress) {
        toast({ title: "Preencha o CEP e número do endereço", variant: "destructive" });
        return;
      }
    }

    setProcessingPayment(true);
    try {
      if (paymentMethod === "card") {
        const expiryParts = cardForm.expiry.split("/");
        const { data: profile } = await supabase.
        from("profiles").
        select("full_name, email, cpf, cnpj, phone, address_zip, address_number").
        eq("user_id", userId).
        single();

        const cpfCnpj = cardForm.cpf.replace(/\D/g, "") || profile?.cpf?.replace(/\D/g, "") || profile?.cnpj?.replace(/\D/g, "") || "";
        if (!cpfCnpj) {
          toast({
            title: "CPF obrigatório",
            description: "Preencha o CPF no formulário de pagamento.",
            variant: "destructive"
          });
          setProcessingPayment(false);
          return;
        }

        const { data: { session: freshSession }, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !freshSession?.access_token) {
          toast({ title: "Sessão expirada. Faça login novamente.", variant: "destructive" });
          setProcessingPayment(false);
          return;
        }

        const finalAmount = getFinalAmountWithFee(parseInt(installments), "card");
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create_payment`;
        const fnRes = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${freshSession.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
          },
          body: JSON.stringify({
            action: "create_service_payment",
            request_id: threadId,
            amount: finalAmount,
            original_amount: parseFloat(paymentData.amount), // valor original sem desconto de cupom
            installment_count: parseInt(installments),
            credit_card: {
              holder_name: cardForm.name,
              number: cardForm.number,
              expiry_month: expiryParts[0],
              expiry_year: `20${expiryParts[1]}`,
              cvv: cardForm.cvv
            },
            credit_card_holder_info: {
              name: profile?.full_name || cardForm.name,
              email: profile?.email || "",
              cpf_cnpj: cpfCnpj,
              postal_code: profile?.address_zip || cardForm.postalCode || "",
              address_number: profile?.address_number || cardForm.addressNumber || "",
              phone: profile?.phone || ""
            }
          }),
        });
        const resData = await fnRes.json().catch(() => ({}));
        const res = { data: resData, error: !fnRes.ok ? { message: resData?.message || resData?.error } : null };

        if (res.error || res.data?.error) {
          if (fnRes.status === 401) throw new Error("Sessão expirada. Faça login novamente e tente o pagamento.");
          throw new Error(res.data?.message || res.data?.error || res.error?.message || "Erro ao processar pagamento");
        }

        // Verifica se o Asaas realmente confirmou a cobrança no cartão
        if (!res.data?.confirmed) {
          const asaasStatus = res.data?.status || "";
          const msg = asaasStatus === "AWAITING_RISK_ANALYSIS"
            ? "Pagamento em análise de risco. Aguarde a confirmação por e-mail."
            : asaasStatus === "PENDING"
            ? "Pagamento pendente de confirmação. Verifique com seu banco."
            : "Pagamento recusado. Verifique os dados do cartão e tente novamente.";
          throw new Error(msg);
        }
      } else if (paymentMethod === "pix") {
        const { data: profile } = await supabase.
        from("profiles").
        select("cpf, cnpj").
        eq("user_id", userId).
        single();

        if (!profile?.cpf && !profile?.cnpj) {
          toast({
            title: "Cadastre seu CPF ou CNPJ no perfil antes de realizar pagamentos.",
            variant: "destructive"
          });
          setProcessingPayment(false);
          setPaymentOpen(false);
          navigate("/profile");
          return;
        }

        const { data: { session: freshSession }, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !freshSession?.access_token) {
          toast({ title: "Sessão expirada. Faça login novamente.", variant: "destructive" });
          setProcessingPayment(false);
          return;
        }

        const finalAmount = getFinalAmountWithFee(1, "pix");
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create_payment`;
        const fnRes = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${freshSession.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
          },
          body: JSON.stringify({
            action: "create_service_payment",
            request_id: threadId,
            amount: finalAmount,
            original_amount: parseFloat(paymentData.amount), // valor sem desconto de cupom
            billing_type: "PIX",
          }),
        });
        const resData = await fnRes.json().catch(() => ({}));
        const res = { data: resData, error: !fnRes.ok ? { message: resData?.message || resData?.error || "Erro ao gerar PIX" } : null };

        if (res.error || res.data?.error) {
          const msg = res.data?.message || res.data?.error || res.error?.message || "Erro ao gerar PIX";
          if (!fnRes.ok && fnRes.status === 401) {
            throw new Error("Sessão expirada. Faça login novamente e tente o pagamento.");
          }
          if (String(msg).toLowerCase().includes("jwt") || String(msg).toLowerCase().includes("unauthorized")) {
            throw new Error("Sessão expirada. Faça login novamente e tente o pagamento.");
          }
          throw new Error(msg);
        }

        setPixData({
          qrCode: res.data.pix_qr_code,
          copyPaste: res.data.pix_copy_paste,
          paymentId: res.data.payment_id
        });
        pixConfirmParamsRef.current = {
          threadId: threadId!,
          userId: userId!,
          chatProUserId: chatProUserId || "",
          finalAmount,
          originalAmount: parseFloat(paymentData.amount), // valor original sem desconto de cupom
          couponDiscount,
          selectedCouponId,
          paymentDataAmount: paymentData.amount,
        };
        setProcessingPayment(false);
        setPaymentOpen(false);
        pixDismissedByUserRef.current = false; // novo pagamento criado — permite abertura automática
        pixConfirmFiredRef.current = false; // reseta guard de duplicação para novo pagamento
        setPixOpen(true);
        setPixCopied(false);

        setPixPolling(true);
        if (pixIntervalRef.current) clearInterval(pixIntervalRef.current);
        pixIntervalRef.current = setInterval(async () => {
          try {
            const check = await supabase.functions.invoke("create_payment", {
              body: { action: "check_payment_status", payment_id: res.data.payment_id }
            });
            if (check.data?.confirmed) {
              // Guard: evita confirmação dupla (polling + realtime)
              if (pixConfirmFiredRef.current) return;
              pixConfirmFiredRef.current = true;

              if (pixIntervalRef.current) clearInterval(pixIntervalRef.current);
              pixIntervalRef.current = null;
              setPixPolling(false);
              pixConfirmParamsRef.current = null;

              const discountNote = couponDiscount ?
              `\nDesconto: ${couponDiscount.type === "percentage" ? `${couponDiscount.value}%` : `R$ ${couponDiscount.value.toFixed(2).replace(".", ",")}`}` :
              "";
              const originalAmt = parseFloat(paymentData?.amount || String(finalAmount));
              const proNetPoll = calcProfessionalNet(originalAmt, "pix");
              const confirmContent = `✅ PAGAMENTO CONFIRMADO\nValor Pago: R$ ${finalAmount.toFixed(2).replace(".", ",")}${discountNote}\nMétodo: PIX\nRecebe: R$ ${proNetPoll.toFixed(2).replace(".", ",")}`;

              await supabase.from("chat_messages").insert({
                request_id: threadId,
                sender_id: userId,
                content: confirmContent
              });

              if (selectedCouponId) {
                await supabase.from("coupons").update({ used: true } as any).eq("id", selectedCouponId);
              }

              await sendNotification(userId, "✅ Pagamento Aprovado", `Seu pagamento via PIX de R$ ${finalAmount.toFixed(2).replace(".", ",")} foi confirmado com sucesso.`, null, otherParty.avatar_url ?? null);
              if (chatProUserId) await sendNotification(chatProUserId, "💰 Pagamento Recebido!", `Você vai receber R$ ${proNetPoll.toFixed(2).replace(".", ",")} via PIX (líquido após taxas).`, null, profile?.avatar_url ?? null);

              await awardPostPaymentCoupon(parseFloat(paymentData.amount));

              toast({ title: "Pagamento PIX confirmado!" });
              setPixOpen(false);
              setRatingOpen(true);
            }
          } catch (err) {
            console.error("PIX polling error:", err);
          }
        }, 3000); 

        return; 
      } else {
        setProcessingPayment(false);
        return;
      }

      // Valor original do serviço (sem desconto de cupom — o profissional não precisa saber do desconto)
      const originalAmtCard = parseFloat(paymentData.amount);
      const inst = parseInt(installments);
      const methodLabel = inst > 1 ? `Cartão de crédito (${inst}x)` : "Cartão de crédito (1x)";
      // Profissional recebe: valor original - comissão - taxa cartão
      const proNetCard = calcProfessionalNet(originalAmtCard, "card", inst);
      const confirmContent = `✅ PAGAMENTO CONFIRMADO\nValor Pago: R$ ${originalAmtCard.toFixed(2).replace(".", ",")}\nMétodo: ${methodLabel}\nRecebe: R$ ${proNetCard.toFixed(2).replace(".", ",")}`;

      await supabase.from("chat_messages").insert({
        request_id: threadId,
        sender_id: userId,
        content: confirmContent
      });

      if (selectedCouponId) {
        await supabase.from("coupons").update({ used: true } as any).eq("id", selectedCouponId);
      }

      await sendNotification(userId, "✅ Pagamento Aprovado", `Seu pagamento via Cartão de R$ ${originalAmtCard.toFixed(2).replace(".", ",")} foi confirmado com sucesso.`, null, otherParty.avatar_url ?? null);
      await sendNotification(chatProUserId, "💰 Pagamento Recebido!", `Você vai receber R$ ${proNetCard.toFixed(2).replace(".", ",")} via Cartão (líquido após taxas).`, null, profile?.avatar_url ?? null);

      await awardPostPaymentCoupon(parseFloat(paymentData.amount));

      setProcessingPayment(false);
      setPaymentConfirmed(true);
      setPaymentOpen(false);
      toast({ title: "Pagamento confirmado!" });

      setRatingOpen(true);

    } catch (err: any) {
      setProcessingPayment(false);
      toast({ title: err.message || "Erro ao processar pagamento", variant: "destructive" });
    }
  };

  const closeRatingAndShowReward = () => {
    setRatingOpen(false);
    if (rewardCoupon) {
      setTimeout(() => {
        setRewardOpen(true);
      }, 500);
    }
  };

  const handleSubmitRating = async () => {
    if (ratingStars === 0) {toast({ title: "Selecione uma nota", variant: "destructive" });return;}
    if (!userId || !threadId) return;

    const { error } = await supabase.rpc("submit_review", {
      _request_id: threadId,
      _rating: ratingStars,
      _comment: ratingComment || null
    });

    if (error) {
      console.error("submit_review error:", error);
      toast({ title: "Erro ao registrar avaliação", variant: "destructive" });
    }

    setHasRated(true);
    toast({ title: "Avaliação enviada! Obrigado!" });
    
    closeRatingAndShowReward();
  };

  const parseAudio = (content: string) => {
    const match = content.match(/\[AUDIO:(.+):(\d+)\]$/);
    if (match) return { url: match[1], duration: parseInt(match[2]) };
    return null;
  };

  const parseProduct = (content: string) => {
    const match = content.match(/\[PRODUCT:(.+):(.+):(.+):(.+)\]/);
    if (match) return { id: match[1], name: match[2], price: match[3], image: match[4] === 'null' ? null : match[4] };
    return null;
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !threadId) return;

    setUploadingReceipt(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `receipts/${threadId}/${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);

      const { error: msgError } = await supabase.from("chat_messages").insert({
        request_id: threadId,
        sender_id: userId,
        content: `📄 COMPROVANTE ENVIADO\nArquivo: ${file.name}\n\n[FILE:${urlData.publicUrl}:${file.name}]`,
        image_urls: [urlData.publicUrl]
      });

      if (msgError) throw msgError;
      sendMessagePushNotification(recipientUserId, "Comprovante");
      toast({ title: "Comprovante enviado com sucesso!" });
    } catch (error) {
      toast({ title: "Erro ao enviar comprovante", variant: "destructive" });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const renderMessageContent = (msg: Message) => {
    const billing = parseBilling(msg.content);
    const product = parseProduct(msg.content);
    const isMine = msg.sender_id === userId;
    const isBilling = msg.content.includes("💰 COBRANÇA");
    const isPaymentConfirm = msg.content.includes("✅ PAGAMENTO CONFIRMADO");
    const isRating = msg.content.includes("⭐ AVALIAÇÃO");
    const isProtocol = msg.content.startsWith("📋 PROTOCOLO:");
    const isSystemClose = msg.content.includes("🔒 CHAMADA ENCERRADA") || msg.content.includes("🚫 Solicitação cancelada");
    const isReceipt = msg.content.includes("📄 COMPROVANTE ENVIADO");
    const isProductReq = msg.content.includes("🛍️ INTERESSE EM PRODUTO");
    const audioData = parseAudio(msg.content);

    if (audioData) {
      return <AudioPlayer src={audioData.url} duration={audioData.duration} isMine={isMine} />;
    }

    if (isProductReq && product) {
      return (
        <div className="space-y-2 max-w-[200px]">
          <p className="font-semibold flex items-center gap-1.5 text-xs"><Package className="w-3.5 h-3.5" /> Interesse em Produto</p>
          <div className="bg-background rounded-xl overflow-hidden border border-border">
            {product.image ? (
               // ✨ OTIMIZAÇÃO: Usa imagem otimizada para o produto também, mas permite ver em tamanho real
               <img src={getOptimizedChatImage(product.image)} alt={product.name} loading="lazy" className="w-full h-24 object-cover cursor-pointer" onClick={() => window.open(product.image, '_blank')} />
            ) : (
               <div className="w-full h-24 bg-muted flex items-center justify-center"><Package className="w-6 h-6 text-muted-foreground/50" /></div>
            )}
            <div className="p-2 bg-muted/30">
              <p className="text-xs font-bold text-foreground line-clamp-1">{product.name}</p>
              <p className="text-[10px] font-semibold text-primary mt-0.5">{product.price}</p>
            </div>
          </div>
        </div>
      );
    }

    if (isProtocol) {
      return (
        <div className="text-center w-full">
          <div className="inline-block bg-muted/80 border rounded-xl px-4 py-2">
            <p className="text-xs font-mono font-semibold text-foreground">{msg.content.split("\n")[0].replace("📋 ", "")}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Guarde este número para referência</p>
          </div>
        </div>);
    }

    if (isSystemClose) {
      return (
        <div className="text-center w-full">
          <div className="inline-block bg-muted/80 border rounded-xl px-4 py-2">
            <p className="text-xs font-semibold text-foreground">{msg.content}</p>
          </div>
        </div>);
    }

    if (isBilling && billing) {
      const alreadyPaid = messages.some(m => m.content.includes("✅ PAGAMENTO CONFIRMADO") || m.content.includes("🤝 Pagamento presencial"));

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">R$</span>
            <span className="font-semibold">Cobrança</span>
          </div>
          <p className="text-lg font-bold">R$ {parseFloat(billing.amount).toFixed(2).replace(".", ",")}</p>
          
          {billing.passFee && !isMine && <p className="text-[10px] font-medium text-destructive mt-0 mb-1">+ Taxas no pagamento</p>}
          
          <p className="text-xs opacity-80">{billing.desc}</p>
          
          {isMine ? (
             <button
                onClick={() => setViewingBilling(billing)}
                className="mt-1 w-full py-1.5 rounded-lg bg-background/20 backdrop-blur-sm text-[11px] font-semibold hover:bg-background/30 transition-colors border border-current/20 flex items-center justify-center gap-1 px-2">
                <Info className="w-3 h-3 flex-shrink-0" /> Detalhes da cobrança
              </button>
          ) : (
            alreadyPaid ? (
              <div className="mt-2 w-full py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 text-center flex items-center justify-center gap-1.5 uppercase">
                <CheckCircle2 className="w-3 h-3" /> Pagamento efetuado
              </div>
            ) : (
              <button
                onClick={() => setConfirmServiceModal(msg)}
                className="mt-1 w-full py-2 rounded-lg bg-background/20 backdrop-blur-sm text-xs font-semibold hover:bg-background/30 transition-colors border border-current/20">
                Pagar agora
              </button>
            )
          )}
        </div>);
    }

    if (isPaymentConfirm) {
      const lines = msg.content.split("\n").slice(1);
      // "Recebe: R$X" só aparece para o profissional (quem recebe a mensagem, não quem enviou)
      const visibleLines = isMine
        ? lines.filter(l => !l.startsWith("Recebe:"))
        : lines;
      return (
        <div className="space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><Check className="w-4 h-4" /> Pagamento confirmado</p>
          {visibleLines.map((line, i) => {
            const isReceive = line.startsWith("Recebe:");
            return (
              <p key={i} className={`text-xs ${isReceive ? "font-bold text-emerald-300 mt-1" : "opacity-80"}`}>
                {isReceive ? `💰 ${line}` : line}
              </p>
            );
          })}
        </div>);
    }

    if (isRating) return null;

    if (isReceipt) {
      const fileMatch = msg.content.match(/\[FILE:(.+):(.+)\]$/);
      return (
        <div className="space-y-2">
          <p className="font-semibold flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 className="w-4 h-4" /> Comprovante enviado
          </p>
          {fileMatch && (
            <a href={fileMatch[1]} target="_blank" rel="noopener noreferrer" className="text-[10px] underline opacity-70">
              Visualizar arquivo: {fileMatch[2]}
            </a>
          )}
        </div>
      );
    }

    if (msg.image_urls && msg.image_urls.length > 0) {
      return (
        <div className="space-y-2">
          <div className={`grid ${msg.image_urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5`}>
            {msg.image_urls.map((url, j) => (
              // ✨ OTIMIZAÇÃO: Carrega imagem leve para economizar 90% de rede, mas abre full HD ao clicar
              <img key={j} src={getOptimizedChatImage(url)} alt="Mídia do chat" loading="lazy" className="w-24 h-24 rounded-lg object-cover cursor-pointer" onClick={() => window.open(url, '_blank')} />
            ))}
          </div>
          {msg.content && <p className="text-sm">{msg.content}</p>}
        </div>
      );
    }

    const imageUrlRegex = /(https?:\/\/[^\s]+?\.(png|jpg|jpeg|webp|gif))/gi;
    const parts = msg.content.split("\n");
    const hasImages = imageUrlRegex.test(msg.content);

    if (hasImages && (!msg.image_urls || msg.image_urls.length === 0)) {
      return (
        <div className="space-y-2">
          {parts.map((line, i) => {
            const imgMatch = line.match(/(https?:\/\/[^\s,]+?\.(png|jpg|jpeg|webp|gif))/gi);
            if (imgMatch) {
              return (
                <div key={i} className="flex flex-wrap gap-1.5">
                  {imgMatch.map((url, j) =>
                  // ✨ OTIMIZAÇÃO: Mesma mágica aplicada nas imagens por Regex
                  <img key={j} src={getOptimizedChatImage(url)} alt="Foto do serviço" loading="lazy" className="w-24 h-24 rounded-lg object-cover cursor-pointer" onClick={() => window.open(url, '_blank')} />
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

  const otherInitials = (otherParty?.name ?? "Chat").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div 
      className="bg-background flex flex-col overflow-hidden pb-20 fixed inset-0 w-full"
      style={{ 
        paddingBottom: '5rem',
        minHeight: '100vh',
        height: '100dvh',
      }}
    >
      <header 
        className="flex-shrink-0 z-30 bg-card/95 backdrop-blur-md border-b"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* ── Linha superior: voltar + avatar/nome ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-lg mx-auto">
          <Link to="/messages" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>

          {/* Avatar + nome clicáveis para abrir perfil do profissional */}
          <button
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
            onClick={() => { if (!isProfessional && proSlug) navigate(`/p/${proSlug}`); }}
            style={{ cursor: !isProfessional && proSlug ? "pointer" : "default" }}
          >
            {otherParty.avatar_url ? (
              <img
                src={otherParty.avatar_url}
                alt={otherParty.name}
                loading="eager"
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                onError={(e) => {
                  const t = e.currentTarget;
                  t.onerror = null;
                  t.style.display = "none";
                  const fb = t.nextElementSibling as HTMLElement | null;
                  if (fb) fb.style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center text-xs font-bold text-primary flex-shrink-0"
              style={{ display: otherParty.avatar_url ? "none" : "flex" }}
            >
              {otherInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{otherParty.name}</p>
              {!isProfessional && proAvailabilityStatus ? (
                <p className={`text-[10px] font-medium ${
                  proAvailabilityStatus === "available" ? "text-green-500" :
                  proAvailabilityStatus === "quotes_only" ? "text-amber-500" :
                  proAvailabilityStatus === "busy" ? "text-orange-500" :
                  "text-destructive"
                }`}>
                  {proAvailabilityStatus === "available" ? "● Disponível" :
                   proAvailabilityStatus === "quotes_only" ? "● Somente orçamentos" :
                   proAvailabilityStatus === "busy" ? "● Agenda fechada" :
                   "● Indisponível"}
                </p>
              ) : null}
            </div>
          </button>
        </div>

        {/* ── Barra de ações: botões maiores abaixo da linha do perfil ── */}
        {isProfessional && !isChatFinished && requestStatus === "accepted" && (
          <div className="flex gap-2.5 px-4 pb-3 max-w-screen-lg mx-auto">
            <button
              onClick={async () => { await loadFeeSettings(); setBillingOpen(true); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground shadow-sm active:scale-95 transition-transform">
              <BadgeDollarSign className="w-4.5 h-4.5" /> Cobrar
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
                await markAppointmentDone();
                await sendNotification(userId, "🎉 Serviço Finalizado!", "Parabéns, você concluiu mais um serviço com sucesso. Continue assim!");
                setClosingCall(false);
                toast({ title: "Chamada encerrada!" });
              }}
              disabled={closingCall}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-destructive/10 text-destructive border border-destructive/20 active:scale-95 transition-transform">
              <LogOut className="w-4.5 h-4.5" /> Encerrar
            </button>
          </div>
        )}

        {!isProfessional && !isChatFinished && requestStatus === "accepted" && hasPaymentConfirmed && !canCloseByDelay && (
          <div className="px-4 pb-3 max-w-screen-lg mx-auto">
            <button
              onClick={async () => {
                if (!userId || !threadId) return;
                setClosingCall(true);
                await supabase.from("chat_messages").insert({
                  request_id: threadId,
                  sender_id: userId,
                  content: "🔒 CHAMADA ENCERRADA pelo cliente."
                });
                await supabase.from("service_requests").update({ status: "completed" } as any).eq("id", threadId);
                setRequestStatus("completed");
                await markAppointmentDone();
                if (chatProUserId) {
                  await sendNotification(chatProUserId, "Chat encerrado", "O cliente encerrou a conversa.", `/messages/${threadId}`, profile?.avatar_url ?? null);
                }
                setClosingCall(false);
                toast({ title: "Chat encerrado!" });
              }}
              disabled={closingCall}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-destructive/10 text-destructive border border-destructive/20 active:scale-95 transition-transform">
              <LogOut className="w-4.5 h-4.5" /> Encerrar chat
            </button>
          </div>
        )}

        {canCloseByDelay && (
          <div className="px-4 pb-3 max-w-screen-lg mx-auto">
            <button
              onClick={async () => {
                if (!userId || !threadId) return;
                setClosingCall(true);
                await supabase.from("chat_messages").insert({
                  request_id: threadId,
                  sender_id: userId,
                  content: "⏰ Chat encerrado pelo cliente por demora na resposta."
                });
                await supabase.from("service_requests").update({ status: "cancelled" } as any).eq("id", threadId);
                setRequestStatus("cancelled");
                if (chatProUserId) {
                  await sendNotification(
                    chatProUserId,
                    "⚠️ Você perdeu um cliente por demora",
                    "O cliente encerrou o chat pois você não respondeu em mais de 4 horas.",
                    `/messages/${threadId}`,
                    profile?.avatar_url ?? null
                  );
                }
                setClosingCall(false);
                toast({ title: "Chat encerrado por demora.", description: "O profissional foi notificado." });
              }}
              disabled={closingCall}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-orange-100 text-orange-600 border border-orange-200 active:scale-95 transition-transform dark:bg-orange-900/20 dark:text-orange-400">
              <LogOut className="w-4.5 h-4.5" /> Encerrar por demora
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden max-w-screen-lg mx-auto w-full px-4 py-4 flex flex-col gap-2">
        {/* Banner de aviso: profissional sem resposta há +2h (antes das 4h) */}
        {(() => {
          if (isProfessional || isChatFinished || !userId || canCloseByDelay) return null;
          const realMsgs = messages.filter(m => !m.id.startsWith("temp-"));
          if (realMsgs.length === 0) return null;
          const last = realMsgs[realMsgs.length - 1];
          if (last.sender_id !== userId) return null;
          const elapsed = Date.now() - new Date(last.created_at).getTime();
          if (elapsed < 2 * 60 * 60 * 1000) return null;
          const hoursLeft = Math.max(0, Math.ceil((4 * 60 * 60 * 1000 - elapsed) / (60 * 60 * 1000)));
          return (
            <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl px-4 py-3 mb-1">
              <span className="text-orange-500 text-base mt-0.5">⏳</span>
              <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                O profissional ainda não respondeu. Se ele não responder em mais {hoursLeft}h, você poderá encerrar o chat por demora.
              </p>
            </div>
          );
        })()}
        {!isProfessional && requestStatus === "pending" && !isChatFinished &&
        <div className="bg-card border rounded-2xl p-4 space-y-3 mb-2 shadow-sm">
            <p className="text-sm font-semibold text-foreground text-center">Aguardando resposta</p>
            <p className="text-xs text-muted-foreground text-center">O profissional ainda não aceitou. Se desejar desistir, você pode cancelar a solicitação.</p>
            <button
              onClick={async () => {
                if (appointment) {
                  await supabase.from("agenda_appointments").update({ status: "canceled" }).eq("chat_request_id", threadId);
                  setAppointment((a) => (a ? { ...a, status: "canceled" } : null));
                  const { data: pro } = await supabase.from("professionals").select("user_id").eq("id", appointment.professional_id).single();
                  if ((pro as { user_id?: string })?.user_id)
                    await sendNotification((pro as { user_id: string }).user_id, "Agendamento cancelado", "O cliente cancelou o agendamento.", `/messages/${threadId}`, profile?.avatar_url ?? null);
                }
                await supabase.from("service_requests").update({ status: "cancelled" } as any).eq("id", threadId!);
                setRequestStatus("cancelled");
                await supabase.from("chat_messages").insert({
                  request_id: threadId!,
                  sender_id: userId!,
                  content: "🚫 Solicitação cancelada pelo cliente. Chat encerrado."
                });
                toast({ title: "Solicitação cancelada com sucesso" });
              }}
              className="w-full py-2.5 rounded-xl border-2 border-destructive text-destructive font-semibold text-sm hover:bg-destructive/10 transition-colors">
                Cancelar Solicitação
            </button>
        </div>
        }

        {isProfessional && requestStatus === "pending" && !isChatFinished && appointment?.status === "pending" &&
        <div className="bg-card border rounded-2xl p-4 space-y-3 mb-2 flex-shrink-0">
            <p className="text-sm font-semibold text-foreground text-center leading-snug flex items-center justify-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" /> Novo agendamento
            </p>
            <p className="text-xs text-muted-foreground text-center">
              {appointment.agenda_services?.name ?? "Serviço"} — {format(new Date(appointment.appointment_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} às {appointment.start_time}
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
              onClick={async () => {
                if (!threadId || !userId || !appointment) return;
                await supabase.from("agenda_appointments").update({ status: "rejected" }).eq("chat_request_id", threadId);
                setAppointment((a) => (a ? { ...a, status: "rejected" } : null));
                await supabase.from("service_requests").update({ status: "cancelled" } as any).eq("id", threadId);
                setRequestStatus("cancelled");
                await supabase.from("chat_messages").insert({
                  request_id: threadId,
                  sender_id: userId,
                  content: "❌ Agendamento recusado pelo profissional."
                });
                await sendNotification(appointment.client_id, "Agendamento recusado", "O profissional recusou seu agendamento.", `/messages/${threadId}`, profile?.avatar_url ?? null);
                toast({ title: "Agendamento recusado" });
              }}
              className="flex-1 min-w-[80px] py-2.5 rounded-xl border-2 border-destructive text-destructive font-semibold text-sm hover:bg-destructive/10 transition-colors">
                Recusar
              </button>
              <button
              onClick={() => setRemarcarOpen(true)}
              className="flex-1 min-w-[80px] py-2.5 rounded-xl border-2 border-primary text-primary font-semibold text-sm hover:bg-primary/10 transition-colors">
                Remarcar
              </button>
              <button
              onClick={async () => {
                if (!threadId || !userId || !appointment) return;
                await supabase.from("agenda_appointments").update({ status: "confirmed" }).eq("chat_request_id", threadId);
                setAppointment((a) => (a ? { ...a, status: "confirmed" } : null));
                await supabase.from("service_requests").update({ status: "accepted" } as any).eq("id", threadId);
                setRequestStatus("accepted");
                await supabase.from("chat_messages").insert({
                  request_id: threadId,
                  sender_id: userId,
                  content: "✅ Agendamento confirmado! Nos vemos no dia e horário combinados."
                });
                await sendNotification(appointment.client_id, "Agendamento confirmado", `${appointment.agenda_services?.name ?? "Serviço"} em ${format(new Date(appointment.appointment_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} às ${appointment.start_time}`, `/messages/${threadId}`, profile?.avatar_url ?? null);
                toast({ title: "Agendamento aceito!" });
              }}
              className="flex-1 min-w-[80px] py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
                Aceitar
              </button>
            </div>
          </div>
        }

        {isProfessional && requestStatus === "accepted" && !isChatFinished && appointment && (appointment.status === "confirmed" || appointment.status === "pending") &&
        <div className="bg-card border rounded-2xl p-4 space-y-3 mb-2 flex-shrink-0">
            <p className="text-sm font-semibold text-foreground text-center leading-snug flex items-center justify-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" /> Agendamento confirmado
            </p>
            <p className="text-xs text-muted-foreground text-center">
              {appointment.agenda_services?.name ?? "Serviço"} — {format(new Date(appointment.appointment_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} às {appointment.start_time}
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => setRemarcarOpen(true)}
                className="py-2.5 px-4 rounded-xl border-2 border-primary text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
              >
                Remarcar
              </button>
            </div>
          </div>
        }

        {isProfessional && requestStatus === "pending" && !isChatFinished && !appointment &&
        <div className="bg-card border rounded-2xl p-4 space-y-3 mb-2 flex-shrink-0">
            <p className="text-sm font-semibold text-foreground text-center leading-snug">Nova solicitação de serviço</p>
            <p className="text-xs text-muted-foreground text-center">Deseja aceitar esta chamada?</p>
            <div className="flex gap-2">
              <button
              onClick={async () => {
                await supabase.from("service_requests").update({ status: "cancelled" } as any).eq("id", threadId!);
                setRequestStatus("cancelled");
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

        {(requestStatus === "rejected" || requestStatus === "cancelled") &&
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 text-center mb-2">
            <p className="text-sm font-semibold text-destructive">
              {requestStatus === "rejected" ? "Chamada recusada" : "Solicitação cancelada"}
            </p>
          </div>
        }
        
        {/* 🚀 OTIMIZAÇÃO 4: Adiciona o Skeleton Screen durante o carregamento */}
        {isFetchingMessages ? (
          <div className="flex flex-col gap-4 py-8">
             <div className="flex justify-start"><div className="w-48 h-12 bg-muted animate-pulse rounded-2xl rounded-bl-none"></div></div>
             <div className="flex justify-end"><div className="w-40 h-12 bg-primary/20 animate-pulse rounded-2xl rounded-br-none"></div></div>
             <div className="flex justify-start"><div className="w-64 h-16 bg-muted animate-pulse rounded-2xl rounded-bl-none"></div></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma mensagem. Inicie a conversa!</div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === userId;
            const isRatingMsg = msg.content.includes("AVALIAÇÃO:") || msg.content.includes("avaliou seu atendimento com");
            if (isRatingMsg) return null;
            const rendered = renderMessageContent(msg);
            if (rendered === null) return null;

            const isSystemMsg = msg.content.startsWith("📋 PROTOCOLO:") || msg.content.includes("🔒 CHAMADA ENCERRADA") || msg.content.includes("🚫 Solicitação cancelada") || msg.content.includes("❌ Chamada recusada");
            if (isSystemMsg) {
              return (
                <div key={msg.id} className="flex justify-center">
                  {rendered}
                </div>);
            }

            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} gap-2`}>
                {!isMine && (
                  <div className="relative w-7 h-7 mt-1 flex-shrink-0">
                    {otherParty.avatar_url ? (
                      <img
                        src={otherParty.avatar_url}
                        alt=""
                        loading="lazy"
                        className="w-7 h-7 rounded-full object-cover absolute inset-0"
                        onError={(e) => {
                          const t = e.currentTarget;
                          t.onerror = null;
                          t.style.display = "none";
                          const fb = t.nextElementSibling as HTMLElement | null;
                          if (fb) fb.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      className="w-7 h-7 rounded-full bg-primary/10 items-center justify-center text-[10px] font-bold text-primary absolute inset-0"
                      style={{ display: otherParty.avatar_url ? "none" : "flex" }}
                    >
                      {otherInitials}
                    </div>
                  </div>
                )}
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

          })
        )}
        <div ref={bottomRef} />
      </main>

      {isChatFinished ?
      (!isChatClosedByMessage &&
      <div className="sticky bottom-20 bg-muted/50 border-t px-4 py-4">
          <p className="text-sm text-muted-foreground text-center max-w-screen-lg mx-auto">
            {requestStatus === "rejected" ? "Chamada recusada — chat encerrado" : 
             requestStatus === "cancelled" ? "Solicitação cancelada — chat encerrado" : 
             "Serviço finalizado — chat encerrado"}
          </p>
        </div>
      ) :

      <div 
        className="flex-shrink-0 bg-background border-t px-4 py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 12px)" }}
      >
          <div className="flex items-center gap-2 max-w-screen-lg mx-auto">
            {isRecording ?
          <>
                <button onClick={cancelRecording}
            className="w-10 h-10 rounded-xl bg-muted text-destructive flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <X className="w-4 h-4" />
                </button>
                <div className="flex-1 flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />
                  <div className="flex items-end gap-[2px] h-7 flex-1 min-w-0" aria-hidden>
                    {recordingLevels.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-full min-w-[3px] bg-destructive/60 transition-all duration-75"
                        style={{ height: `${Math.max(4, h * 100)}%` }}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-destructive flex-shrink-0 tabular-nums">{formatRecTime(recordingTime)}</span>
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
                <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (e.shiftKey) return; // Shift+Enter = nova linha
                e.preventDefault();
                handleSend();
              }}
              placeholder="Digite sua mensagem..."
              rows={1}
              className="flex-1 min-h-[40px] max-h-24 bg-card border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />

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

      <Dialog open={billingOpen} onOpenChange={(open) => {
        setBillingOpen(open);
        if (open) {loadFeeSettings();setBillingStep("choose_type");}
        if (!open) {setBillingStep("choose_type");setBillingMethod(null);setBillingAmount("");setBillingDesc("");setPassFeeToClient(false);}
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
                await supabase.from("chat_messages").insert({
                  request_id: threadId,
                  sender_id: userId,
                  content: "🤝 Pagamento presencial — combinado diretamente com o cliente."
                });
                await supabase.from("chat_messages").insert({
                  request_id: threadId,
                  sender_id: userId,
                  content: "🔒 CHAMADA ENCERRADA pelo profissional."
                });
                await supabase.from("service_requests").update({ status: "completed" } as any).eq("id", threadId);
                setRequestStatus("completed");
                await markAppointmentDone();

                await sendNotification(userId, "🎉 Serviço Finalizado!", "Parabéns, você concluiu mais um serviço com sucesso. Continue assim!");

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
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor Base (R$) *</label>
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

              <div className="space-y-2 mt-2 pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground">Quem pagará a taxa do sistema?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPassFeeToClient(false)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${!passFeeToClient ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    Sem Juros<br/><span className="text-[9px] font-normal">Eu assumo a taxa</span>
                  </button>
                  <button
                    onClick={() => setPassFeeToClient(true)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${passFeeToClient ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    Com Juros<br/><span className="text-[9px] font-normal">Cliente paga a taxa</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2 mt-2 border-t pt-2">
                <p className="text-xs font-medium text-muted-foreground">Forma de pagamento sugerida *</p>
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
                    <p className="text-[10px] text-muted-foreground">O cliente poderá escolher as parcelas</p>
                  </div>
                </button>
              </div>

              {billingMethod && billingAmount && parseFloat(billingAmount) > 0 &&
            <div className="bg-muted/50 border rounded-xl p-3 space-y-3">
                  {billingMethod === "card" &&
              <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Simulação de Parcelas (O cliente poderá alterar)</label>
                      <select
                  value={billingInstallments}
                  onChange={(e) => { setBillingInstallments(e.target.value); setBillingAnticipation(false); }}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">
                        {getBillingInstallmentOptions().map((opt) =>
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                  )}
                      </select>
                    </div>
              }

                  {/* Botões de antecipação (apenas cartão) */}
                  {billingMethod === "card" && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Quando deseja receber?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setBillingAnticipation(false)}
                          className={`flex-1 py-2 rounded-xl text-[11px] font-semibold border-2 transition-all ${!billingAnticipation ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground hover:bg-muted"}`}
                        >
                          Sem Antecipação<br/><span className="text-[9px] font-normal">{feeSettings.transfer_period_card_days || "32"} dias úteis</span>
                        </button>
                        <button
                          onClick={() => setBillingAnticipation(true)}
                          className={`flex-1 py-2 rounded-xl text-[11px] font-semibold border-2 transition-all ${billingAnticipation ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                        >
                          Receber Antecipado<br/><span className="text-[9px] font-normal">~{feeSettings.transfer_period_card_anticipated_days || "4"} dias úteis</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {getBillingFeeBreakdown() && (() => {
                    const b = getBillingFeeBreakdown()!;
                    const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
                    const inst = parseInt(billingInstallments);
                    const instRate = billingMethod === "card" ? getInstallmentPackageRate(inst) : 0;
                    const isPackageMode = (feeSettings.installment_mode || "individual") === "package";
                    const antMode = feeSettings.anticipation_mode || "simple";
                    const antLabel = billingAnticipation
                      ? antMode === "monthly"
                        ? `${feeSettings.anticipation_monthly_rate || "1.15"}% × ${inst} parcelas`
                        : `${feeSettings.anticipation_fee_pct || "3.5"}%`
                      : null;
                    return (
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Valor do serviço</span>
                          <span>{fmt(parseFloat(billingAmount))}</span>
                        </div>
                        {b.passedToClient ? (
                          // ── COM JUROS: taxas embutidas no valor cobrado do cliente ──
                          <>
                            <div className="flex justify-between text-blue-600 dark:text-blue-400">
                              <span>(+) Comissão da plataforma ({feeSettings.commission_pct || "10"}%)</span>
                              <span>+ {fmt(b.commissionFee)}</span>
                            </div>
                            {b.paymentFee > 0 && (
                              <div className="flex justify-between text-blue-600 dark:text-blue-400">
                                <span>
                                  (+) Taxa {billingMethod === "pix" ? "PIX" : "Cartão"}
                                  {billingMethod === "card" && ` (${instRate}%${isPackageMode ? " s/ total" : ""})`}
                                </span>
                                <span>+ {fmt(b.paymentFee)}</span>
                              </div>
                            )}
                            {billingAnticipation && b.anticipationFee > 0 && (
                              <div className="flex justify-between text-orange-500">
                                <span>(+) Taxa antecipação ({antLabel})</span>
                                <span>+ {fmt(b.anticipationFee)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-muted-foreground border-t pt-1 mt-1 text-[11px]">
                              <span>Total cobrado do cliente</span>
                              <span>{fmt(b.clientTotal)}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-400">
                              <span>Você receberá</span>
                              <span>{fmt(b.net)}</span>
                            </div>
                          </>
                        ) : (
                          // ── SEM JUROS: taxas descontadas do profissional ──
                          <>
                            <div className="flex justify-between text-red-500">
                              <span>(-) Comissão da plataforma ({feeSettings.commission_pct || "10"}%)</span>
                              <span>- {fmt(b.commissionFee)}</span>
                            </div>
                            {b.paymentFee > 0 && (
                              <div className="flex justify-between text-red-500">
                                <span>
                                  (-) Taxa {billingMethod === "pix" ? "PIX" : "Cartão"}
                                  {billingMethod === "card" && ` (${instRate}%${isPackageMode ? " s/ total" : ""})`}
                                </span>
                                <span>- {fmt(b.paymentFee)}</span>
                              </div>
                            )}
                            {billingAnticipation && b.anticipationFee > 0 && (
                              <div className="flex justify-between text-orange-500">
                                <span>(-) Taxa antecipação ({antLabel})</span>
                                <span>- {fmt(b.anticipationFee)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-400 border-t pt-1 mt-1">
                              <span>Você receberá</span>
                              <span>{fmt(b.net)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
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

      <Dialog open={!!viewingBilling} onOpenChange={(open) => !open && setViewingBilling(null)}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader><DialogTitle>Detalhes da Cobrança</DialogTitle></DialogHeader>
          {viewingBilling && (() => {
            const bd = calculateProfessionalReceiveBreakdown(viewingBilling);
            const fmtR = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
            const inst = parseInt(viewingBilling.installments || "1");
            const methodLabel = viewingBilling.method === 'pix' ? 'PIX' : `Cartão${inst > 1 ? ` (${inst}x)` : ""}`;
            return (
              <div className="space-y-2 text-sm pt-2">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Método:</span>
                  <span className="font-semibold">{methodLabel}</span>
                </div>
                {bd.hasAnticipation && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Recebimento:</span>
                    <span className="font-semibold text-primary">Antecipado (~7 dias úteis)</span>
                  </div>
                )}
                <div className="bg-muted/40 rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Valor do serviço</span>
                    <span>{fmtR(bd.amount)}</span>
                  </div>
                  <div className="flex justify-between text-red-500 text-xs">
                    <span>(-) Comissão da plataforma ({bd.commissionPct}%)</span>
                    <span>- {fmtR(bd.commissionFee)}</span>
                  </div>
                  {bd.gatewayFee > 0 && (
                    <div className="flex justify-between text-red-500 text-xs">
                      <span>(-) Taxa de transação {bd.gatewayLabel}</span>
                      <span>- {fmtR(bd.gatewayFee)}</span>
                    </div>
                  )}
                  {bd.passFee && (
                    <div className="flex justify-between text-amber-600 text-xs">
                      <span>Taxa de transação</span>
                      <span>cobrada do cliente</span>
                    </div>
                  )}
                  {bd.hasAnticipation && bd.anticipationFee > 0 && (
                    <div className="flex justify-between text-red-500 text-xs">
                      <span>(-) Taxa de antecipação ({bd.anticipationPct}% × {inst} {inst > 1 ? "parcelas" : "parcela"})</span>
                      <span>- {fmtR(bd.anticipationFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-emerald-700 border-t pt-1.5 text-sm">
                    <span>Você receberá</span>
                    <span>{fmtR(bd.net)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmação de que o serviço foi prestado (antes de abrir o pagamento) */}
      <Dialog open={!!confirmServiceModal} onOpenChange={(open) => !open && setConfirmServiceModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar serviço</DialogTitle>
            <DialogDescription>
              Você confirma que o serviço foi prestado e deseja prosseguir com o pagamento?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmServiceModal(null)}
            >
              Não
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (confirmServiceModal) {
                  openPayment(confirmServiceModal);
                  setConfirmServiceModal(null);
                }
              }}
            >
              Sim, foi prestado
            </Button>
          </div>
          {feeSettings.payment_policy && (
            <button
              onClick={() => setShowPaymentPolicy(true)}
              className="w-full mt-2 text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
            >
              📄 Ler políticas de pagamento
            </button>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Políticas de Pagamento */}
      <Dialog open={showPaymentPolicy} onOpenChange={setShowPaymentPolicy}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{feeSettings.payment_policy_title || "Políticas de Pagamento"}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {feeSettings.payment_policy || "Nenhuma política cadastrada."}
            </p>
          </div>
          <Button variant="outline" className="mt-4 w-full" onClick={() => setShowPaymentPolicy(false)}>
            Fechar
          </Button>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog (Cliente) */}
      <Dialog open={paymentOpen} onOpenChange={(open) => { setPaymentOpen(open); if (!open) setBillingDataStep(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {billingDataStep ? "Dados para pagamento" : cardStep ? "Dados do cartão" : "Resumo do Pagamento"}
            </DialogTitle>
          </DialogHeader>

          {/* TELA 0: CPF + ENDEREÇO OBRIGATÓRIOS (antes de PIX ou cartão) */}
          {paymentData && billingDataStep && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Preencha CPF e endereço para continuar. O CEP preenche rua, bairro, cidade e estado.</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">CPF do titular *</label>
                <input
                  value={formatCpf(billingForm.cpf)}
                  onChange={(e) => setBillingForm((f) => ({ ...f, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                />
              </div>
              <div className="relative">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">CEP *</label>
                <input
                  value={formatCep(billingForm.cep)}
                  onChange={(e) => handleBillingCepChange(e.target.value)}
                  placeholder="00000-000"
                  maxLength={9}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                />
                {billingCepLoading && <div className="absolute right-3 top-9 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Rua *</label>
                <input
                  value={billingForm.street}
                  onChange={(e) => setBillingForm((f) => ({ ...f, street: e.target.value }))}
                  placeholder="Rua, avenida..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bairro</label>
                <input
                  value={billingForm.neighborhood}
                  onChange={(e) => setBillingForm((f) => ({ ...f, neighborhood: e.target.value }))}
                  placeholder="Bairro"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Número *</label>
                  <input
                    value={billingForm.number}
                    onChange={(e) => setBillingForm((f) => ({ ...f, number: e.target.value }))}
                    placeholder="123"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Cidade *</label>
                  <input
                    value={billingForm.city}
                    onChange={(e) => setBillingForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Cidade"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Estado (UF) *</label>
                <input
                  value={billingForm.state}
                  onChange={(e) => setBillingForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="MG"
                  maxLength={2}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                onClick={handleSaveBillingAndContinue}
                disabled={savingBilling}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingBilling ? "Salvando..." : "Continuar para o pagamento"}
              </button>
            </div>
          )}
          
          {/* TELA 1: RESUMO E CUPOM */}
          {paymentData && !billingDataStep && !cardStep &&
          <div className="space-y-4">
              <div className="text-center p-4 bg-muted/50 rounded-xl relative">
                {couponDiscount ?
              <>
                    <p className="text-sm line-through text-muted-foreground">R$ {parseFloat(paymentData.amount).toFixed(2).replace(".", ",")}</p>
                    <p className="text-3xl font-bold text-primary">R$ {getFinalAmountWithFee(paymentMethod === "card" ? parseInt(installments) : 1, paymentMethod).toFixed(2).replace(".", ",")}</p>
                  </> :
              <p className="text-3xl font-bold text-foreground">R$ {getFinalAmountWithFee(paymentMethod === "card" ? parseInt(installments) : 1, paymentMethod).toFixed(2).replace(".", ",")}</p>
              }
              
              {clientPassFee && paymentMethod && (
                  <div className="mt-2 text-[10px] bg-amber-500/10 text-amber-600 font-semibold py-1 px-2 rounded-md inline-block">
                    Atenção: O valor acima inclui a taxa de parcelamento/transação.
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground mt-2">{paymentData.desc}</p>
              </div>

              {!selectedCouponId && availableCoupons.length > 0 && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <p className="text-xs font-bold text-emerald-600 uppercase flex items-center gap-1">
                    <Ticket className="w-3.5 h-3.5" /> Seus Cupons
                  </p>
                  {availableCoupons.slice(0, 5).map((c) => (
                    <div key={c.id} className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 flex items-center justify-between shadow-sm hover:bg-emerald-500/20 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Ticket className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-emerald-700">{c.discount_percent}% de desconto</p>
                          <p className="text-[9px] font-medium text-emerald-600/80">
                            {c.expires_at ? `Expira: ${new Date(c.expires_at).toLocaleDateString("pt-BR")}` : "Sem validade"}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => applyCoupon(c.id)} 
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 text-[11px] font-bold rounded-lg hover:bg-emerald-100 transition-colors shadow-sm"
                      >
                        Aplicar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedCouponId && couponDiscount && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center justify-between shadow-sm animate-in fade-in zoom-in">
                  <div>
                    <p className="text-sm font-bold text-primary flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Cupom Aplicado
                    </p>
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Desconto de {couponDiscount.type === "percentage" ? `${couponDiscount.value}%` : `R$ ${couponDiscount.value.toFixed(2).replace(".", ",")}`} no serviço
                    </p>
                  </div>
                  <button 
                    onClick={removeCoupon} 
                    className="text-xs text-destructive font-bold hover:underline"
                  >
                    Remover
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Método definido pelo profissional:</p>
                <div className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-primary bg-primary/5">
                  <span className="text-lg">{paymentMethod === "pix" ? "📱" : "💳"}</span>
                  <div className="text-left">
                    <p className="text-sm font-bold text-foreground">{paymentMethod === "pix" ? "PIX" : "Cartão de Crédito"}</p>
                    <p className="text-[10px] text-muted-foreground">{paymentMethod === "pix" ? "Pagamento instantâneo" : "Pagamento seguro"}</p>
                  </div>
                </div>
              </div>

              {paymentMethod === "pix" &&
                <button
                  onClick={handleConfirmPayment}
                  disabled={processingPayment}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 mt-4">
                  {processingPayment ? "Processando..." : "Confirmar e Gerar PIX"}
                </button>
              }

              {paymentMethod === "card" &&
                <button
                  onClick={() => setCardStep(true)}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors mt-4">
                  Prosseguir para o Cartão
                </button>
              }
            </div>
          }

          {/* TELA 2: FORMULÁRIO DO CARTÃO (Se for cartão) */}
          {paymentData && !billingDataStep && cardStep &&
          <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">{paymentData.desc}</p>
                {couponDiscount ?
              <>
                    <p className="text-sm line-through text-muted-foreground">R$ {parseFloat(paymentData.amount).toFixed(2).replace(".", ",")}</p>
                    <p className="text-xl font-bold text-primary">R$ {getFinalAmountWithFee(parseInt(installments), "card").toFixed(2).replace(".", ",")}</p>
                  </> :
              <p className="text-xl font-bold text-foreground">R$ {getFinalAmountWithFee(parseInt(installments), "card").toFixed(2).replace(".", ",")}</p>
              }
              </div>

              <div className="space-y-3">
              <form autoComplete="on" className="space-y-3" onSubmit={(e) => e.preventDefault()}>
                <div>
                  <label htmlFor="msg-cc-name" className="text-xs font-medium text-muted-foreground mb-1 block">Nome no cartão</label>
                  <input
                    id="msg-cc-name"
                    name="cc-name"
                    value={cardForm.name}
                    onChange={(e) => setCardForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
                    placeholder="NOME COMPLETO"
                    autoComplete="cc-name"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 uppercase"
                  />
                </div>
                <div>
                  <label htmlFor="msg-cc-number" className="text-xs font-medium text-muted-foreground mb-1 block">Número do cartão</label>
                  <input
                    id="msg-cc-number"
                    name="cc-number"
                    value={cardForm.number}
                    onChange={(e) => setCardForm((f) => ({ ...f, number: formatCardNumber(e.target.value) }))}
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="msg-card-cpf" className="text-xs font-medium text-muted-foreground mb-1 block">CPF do titular *</label>
                  <input
                    id="msg-card-cpf"
                    value={cardForm.cpf}
                    onChange={(e) => setCardForm((f) => ({ ...f, cpf: formatCpf(e.target.value) }))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    autoComplete="off"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="msg-cc-exp" className="text-xs font-medium text-muted-foreground mb-1 block">Validade</label>
                    <input
                      id="msg-cc-exp"
                      name="cc-exp"
                      value={cardForm.expiry}
                      onChange={(e) => setCardForm((f) => ({ ...f, expiry: formatExpiry(e.target.value) }))}
                      placeholder="MM/AA"
                      maxLength={5}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="msg-cc-csc" className="text-xs font-medium text-muted-foreground mb-1 block">CVV</label>
                    <input
                      id="msg-cc-csc"
                      name="cc-csc"
                      value={cardForm.cvv}
                      onChange={(e) => setCardForm((f) => ({ ...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                      placeholder="123"
                      maxLength={4}
                      type="password"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                    />
                  </div>
                </div>
              </form>
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
                  <div className="relative">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">CEP</label>
                    <input
                      value={formatCep(cardForm.postalCode)}
                      onChange={async (e) => {
                        const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
                        setCardForm((f) => ({ ...f, postalCode: raw }));
                        setCepFetchedAddress(null);
                        if (raw.length === 8) {
                          setSearchingCep(true);
                          try {
                            const data = await fetchViaCep(raw);
                            if (data) {
                              const addr = [data.logradouro, data.bairro, data.localidade && data.uf ? `${data.localidade}/${data.uf}` : null].filter(Boolean).join(", ");
                              setCepFetchedAddress(addr || null);
                            }
                          } finally {
                            setSearchingCep(false);
                          }
                        }
                      }}
                      placeholder="00000-000"
                      maxLength={9}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                    />
                    {searchingCep && <div className="absolute right-3 top-9 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                    {cepFetchedAddress && <p className="text-[10px] text-muted-foreground mt-1 truncate" title={cepFetchedAddress}>{cepFetchedAddress}</p>}
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
                onClick={() => setCardStep(false)}
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

      {/* ✅ AVALIAÇÃO OBRIGATÓRIA */}
      <Dialog open={ratingOpen} onOpenChange={(open) => {
        if (!open) {
          closeRatingAndShowReward();
        } else {
          setRatingOpen(true);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Avalie o profissional</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">Como foi sua experiênca com {otherParty.name}?</p>
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
      <Dialog open={rewardOpen} onOpenChange={(open) => {
        setRewardOpen(open);
        if (!open) setRewardCoupon(null);
      }}>
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
              onClick={() => {
                setRewardOpen(false);
                setRewardCoupon(null);
              }}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
              Entendido!
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIX QR Code Dialog */}
      <Dialog open={pixOpen} onOpenChange={(open) => {
        if (!open) {
          // Usuário fechou o modal manualmente — não reabrir automaticamente
          pixDismissedByUserRef.current = true;
          if (pixIntervalRef.current) {
            clearInterval(pixIntervalRef.current);
            pixIntervalRef.current = null;
          }
          setPixPolling(false);
        }
        setPixOpen(open);
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

      {appointment && (
        <AgendaRescheduleDialog
          open={remarcarOpen}
          onOpenChange={setRemarcarOpen}
          appointmentId={appointment.id}
          professionalId={appointment.professional_id}
          serviceId={appointment.service_id}
          durationMinutes={appointment.agenda_services?.duration_minutes ?? 30}
          clientId={appointment.client_id}
          atendenteId={appointment.atendente_id ?? null}
          onRescheduled={async (newDate, newStart, newEnd) => {
            if (!threadId || !userId) return;
            setAppointment((a) => (a ? { ...a, appointment_date: newDate, start_time: newStart, end_time: newEnd } : null));
            const serviceName = appointment.agenda_services?.name ?? "Serviço";
            await supabase.from("chat_messages").insert({
              request_id: threadId,
              sender_id: userId,
              content: `📅 Agendamento remarcado para ${format(new Date(newDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} às ${newStart}.`,
            });
            await sendNotification(appointment.client_id, "Agendamento remarcado", `${serviceName} foi remarcado para ${format(new Date(newDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} às ${newStart}.`, `/messages/${threadId}`, profile?.avatar_url ?? null);
          }}
        />
      )}

      <Dialog open={!!agendaClientModal} onOpenChange={(open) => !open && setAgendaClientModal(null)}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {agendaClientModal === "cancel" ? "Cancelar agendamento" : "Remarcar"}
            </DialogTitle>
            <DialogDescription>
              {agendaClientModal === "cancel"
                ? "Para cancelar, solicite que o profissional cancele seu agendamento pelo chat."
                : "Solicite que o profissional remarque seu horário pelo chat."}
            </DialogDescription>
          </DialogHeader>
          <Button className="rounded-xl w-full" onClick={() => setAgendaClientModal(null)}>
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
    </div>);

};

export default MessageThread;