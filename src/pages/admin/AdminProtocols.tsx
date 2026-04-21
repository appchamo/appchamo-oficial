import AdminLayout from "@/components/AdminLayout";
import AudioPlayer from "@/components/AudioPlayer";
import {
  Search,
  MessageSquare,
  Headphones,
  User,
  Calendar,
  Loader2,
  Briefcase,
  UserRound,
  MapPin,
  Smartphone,
  Ticket,
} from "lucide-react";
import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function normalizeProtocolInput(raw: string): string {
  return raw.trim().replace(/^#+/, "").replace(/\s+/g, "");
}

type ServiceHit = {
  id: string;
  protocol: string | null;
  status: string;
  created_at: string;
  client_id: string;
  professional_id: string;
  description: string | null;
};

type SupportHit = {
  id: string;
  protocol: string | null;
  status: string;
  subject: string;
  message: string;
  created_at: string;
  user_id: string;
  admin_reply?: string | null;
};

const CALLS_PAGE_SIZE = 500;

type CallsTab = "calls" | "professional" | "client";

type ProfileAddr = {
  user_id: string;
  full_name: string | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
};

type DeviceRow = {
  user_id: string;
  device_name: string | null;
  platform: string | null;
  push_token: string | null;
  last_active: string | null;
};

type ProCouponRow = {
  id: string;
  /** Rótulo interno opcional (migrado de `code`). */
  name: string | null;
  professional_id: string;
  discount_type: "amount" | "percent";
  discount_value: number;
  min_purchase: number | null;
  max_purchase: number | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
};

type ClientCouponRow = {
  id: string;
  user_id: string;
  source: string;
  used: boolean;
  discount_percent: number;
  expires_at: string | null;
  coupon_type: string;
};

type ProEnrich = {
  pro_user_id: string | null;
  pro_name: string;
  addressFull: string;
  addressShort: string;
  deviceLabel: string;
  coupon: { name: string | null; short: string; detail: string } | null;
};

type ClientEnrich = {
  client_name: string;
  addressFull: string;
  addressShort: string;
  deviceLabel: string;
  coupon: { name: string | null; short: string; detail: string } | null;
};

/** Formata endereço completo (ou retorna "—" se vazio). */
function buildAddress(p: ProfileAddr | undefined | null): { full: string; short: string } {
  if (!p) return { full: "—", short: "—" };
  const streetPart = [p.address_street, p.address_number].filter(Boolean).join(", ");
  const cityPart = [p.address_city, p.address_state].filter(Boolean).join("/");
  const short =
    p.address_neighborhood ||
    p.address_city ||
    streetPart ||
    "—";
  const parts = [streetPart, p.address_neighborhood, cityPart].filter(Boolean) as string[];
  const full = parts.length ? parts.join(" — ") : short;
  return { full, short };
}

/** Mesma lógica usada no painel de Relatórios > Dispositivos. */
function deviceBucketForRow(d: DeviceRow): "iphone" | "android" | "desktop" | "outro" {
  const plat = (d.platform || "").toLowerCase();
  if (plat === "ios") return "iphone";
  if (plat === "android") return "android";
  if (plat === "web") return "desktop";
  const n = (d.device_name || "").toLowerCase();
  if (n.includes("iphone") || n.includes("ios") || n.includes("ipad") || n.includes("apple")) return "iphone";
  if (n.includes("android")) return "android";
  if (
    n.includes("samsung") || n.includes("galaxy") || /\bsm-/.test(n) || n.includes("pixel") ||
    n.includes("xiaomi") || n.includes("redmi") || n.includes("poco") || n.includes("motorola") ||
    n.includes("moto ") || n.includes("oneplus") || n.includes("oppo") || n.includes("realme")
  ) return "android";
  if (n.includes("web") || n.includes("desktop") || n.includes("pwa") || n.includes("chrome")) return "desktop";
  const t = (d.push_token || "").trim();
  if (t.length === 64 && /^[a-f0-9]+$/i.test(t)) return "iphone";
  if (t && (t.includes(":") || (t.length > 80 && !/^[a-f0-9]+$/i.test(t)))) return "android";
  return "outro";
}

function pickPrimaryDeviceLabel(devices: DeviceRow[]): string {
  if (!devices.length) return "—";
  const sorted = [...devices].sort(
    (a, b) => new Date(b.last_active || 0).getTime() - new Date(a.last_active || 0).getTime(),
  );
  for (const d of sorted) {
    const b = deviceBucketForRow(d);
    if (b === "iphone") return "iPhone";
    if (b === "android") return "Android";
    if (b === "desktop") return "Web";
  }
  return sorted[0].device_name?.trim() || "Outro";
}

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** Rótulo curto (ex.: "10% OFF", "R$ 20 OFF"). */
function formatProCouponShort(c: ProCouponRow): string {
  if (c.discount_type === "percent") {
    const n = Math.round(Number(c.discount_value) * 10) / 10;
    return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}% OFF`;
  }
  return `${formatBRL(Number(c.discount_value))} OFF`;
}

function formatProCouponDetail(c: ProCouponRow): string {
  const bits: string[] = [];
  if (c.name) bits.push(c.name);
  if (c.min_purchase != null) bits.push(`mín. ${formatBRL(Number(c.min_purchase))}`);
  if (c.max_purchase != null) bits.push(`teto ${formatBRL(Number(c.max_purchase))}`);
  if (c.max_uses == null) {
    bits.push("ilimitado");
  } else {
    const rem = Math.max(0, c.max_uses - (c.used_count ?? 0));
    bits.push(rem > 0 ? `${rem}/${c.max_uses} usos` : "esgotado");
  }
  if (c.expires_at) bits.push(`até ${new Date(c.expires_at).toLocaleDateString("pt-BR")}`);
  return bits.join(" · ");
}

function pickBestProCoupon(list: ProCouponRow[]): ProCouponRow | null {
  const active = list.filter((c) => {
    if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) return false;
    if (c.max_uses != null && (c.used_count ?? 0) >= c.max_uses) return false;
    return true;
  });
  if (!active.length) return null;
  const sorted = [...active].sort((a, b) => {
    const ap = a.discount_type === "percent" ? Number(a.discount_value) : 0;
    const bp = b.discount_type === "percent" ? Number(b.discount_value) : 0;
    if (ap !== bp) return bp - ap;
    const av = a.discount_type === "amount" ? Number(a.discount_value) : 0;
    const bv = b.discount_type === "amount" ? Number(b.discount_value) : 0;
    return bv - av;
  });
  return sorted[0];
}

function pickBestClientCoupon(list: ClientCouponRow[]): ClientCouponRow | null {
  const active = list.filter((c) => {
    if (c.used) return false;
    if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) return false;
    return true;
  });
  if (!active.length) return null;
  return [...active].sort((a, b) => Number(b.discount_percent) - Number(a.discount_percent))[0];
}

function formatClientCouponShort(c: ClientCouponRow): string {
  const n = Math.round(Number(c.discount_percent) * 10) / 10;
  return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}% OFF`;
}

function formatClientCouponDetail(c: ClientCouponRow): string {
  const bits: string[] = [];
  const srcMap: Record<string, string> = {
    registration: "cadastro",
    payment: "pagamento",
    bonus: "bônus",
    admin: "admin",
  };
  bits.push(`origem ${srcMap[c.source] || c.source}`);
  if (c.coupon_type) bits.push(c.coupon_type);
  if (c.expires_at) bits.push(`até ${new Date(c.expires_at).toLocaleDateString("pt-BR")}`);
  return bits.join(" · ");
}

/** Mesmo formato que `MessageThread` / `chat_messages` (`[AUDIO:url:segundos]`). */
function parseAudioMessage(content: string): { url: string; duration: number } | null {
  const match = content.trim().match(/\[AUDIO:(.+):(\d+)\]$/);
  if (!match) return null;
  const duration = parseInt(match[2], 10);
  if (Number.isNaN(duration)) return null;
  return { url: match[1], duration };
}

function AdminChatMessageBody({ content }: { content: string }) {
  const audio = parseAudioMessage(content);
  if (audio) {
    return <AudioPlayer src={audio.url} duration={audio.duration} isMine={false} />;
  }
  return <pre className="text-xs whitespace-pre-wrap break-words font-sans text-foreground">{content}</pre>;
}

function mergeCallsById(prev: ServiceHit[], incoming: ServiceHit[]): ServiceHit[] {
  const map = new Map<string, ServiceHit>();
  for (const r of prev) map.set(r.id, r);
  for (const r of incoming) map.set(r.id, r);
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

const AdminProtocols = () => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [allCalls, setAllCalls] = useState<ServiceHit[]>([]);
  const [supportHits, setSupportHits] = useState<SupportHit[]>([]);
  const [supportSearched, setSupportSearched] = useState(false);
  const [tab, setTab] = useState<CallsTab>("calls");

  /** Mapas de enriquecimento — carregados sob demanda ao trocar de aba. */
  const [proEnrich, setProEnrich] = useState<Map<string, ProEnrich>>(new Map());
  const [clientEnrich, setClientEnrich] = useState<Map<string, ClientEnrich>>(new Map());
  const [enrichLoading, setEnrichLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailType, setDetailType] = useState<"call" | "support" | null>(null);
  const [callDetail, setCallDetail] = useState<{
    request: ServiceHit;
    clientName: string;
    proName: string;
    messages: { id: string; content: string; created_at: string; sender_id: string; senderLabel: string }[];
  } | null>(null);
  const [supportDetail, setSupportDetail] = useState<{
    ticket: SupportHit;
    userName: string;
    messages: { id: string; content: string; created_at: string; sender_id: string; user_id: string; is_system: boolean; senderLabel: string }[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setListLoading(true);
      try {
        const { data, error } = await supabase
          .from("service_requests")
          .select("id, protocol, status, created_at, client_id, professional_id, description")
          .order("created_at", { ascending: false })
          .limit(CALLS_PAGE_SIZE);
        if (error) throw error;
        if (!cancelled) setAllCalls((data || []) as ServiceHit[]);
      } catch (e: unknown) {
        if (!cancelled) {
          toast({
            title: "Erro ao carregar chamadas",
            description: translateError(e instanceof Error ? e.message : "Falha ao carregar"),
            variant: "destructive",
          });
          setAllCalls([]);
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayedCalls = useMemo(() => {
    const term = normalizeProtocolInput(q).toLowerCase();
    if (term.length < 2) return allCalls;
    return allCalls.filter((row) => (row.protocol || "").toLowerCase().includes(term));
  }, [allCalls, q]);

  /** Carrega enriquecimento (endereço/dispositivo/cupom) conforme aba ativa. */
  useEffect(() => {
    if (tab === "calls") return;
    if (displayedCalls.length === 0) return;
    let cancelled = false;

    const run = async () => {
      setEnrichLoading(true);
      try {
        if (tab === "professional") {
          const proIds = [...new Set(displayedCalls.map((c) => c.professional_id).filter(Boolean))];
          if (!proIds.length) {
            if (!cancelled) setProEnrich(new Map());
            return;
          }

          const { data: proRows } = await supabase
            .from("professionals")
            .select("id, user_id")
            .in("id", proIds);
          const proUserMap = new Map<string, string>();
          for (const row of (proRows || []) as { id: string; user_id: string }[]) {
            if (row.user_id) proUserMap.set(row.id, row.user_id);
          }
          const userIds = [...new Set(proUserMap.values())];

          const [{ data: profs }, { data: devs }, { data: coupons }] = await Promise.all([
            userIds.length
              ? supabase
                  .from("profiles")
                  .select(
                    "user_id, full_name, address_street, address_number, address_neighborhood, address_city, address_state",
                  )
                  .in("user_id", userIds)
              : Promise.resolve({ data: [] as ProfileAddr[] }),
            userIds.length
              ? (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
                  .from("user_devices")
                  .select("user_id, device_name, platform, push_token, last_active")
                  .in("user_id", userIds)
              : Promise.resolve({ data: [] as DeviceRow[] }),
            supabase
              .from("professional_coupons")
              .select(
                "id, name, professional_id, discount_type, discount_value, min_purchase, max_purchase, max_uses, used_count, expires_at, active",
              )
              .in("professional_id", proIds)
              .eq("active", true),
          ]);

          const profMap = new Map<string, ProfileAddr>();
          for (const p of (profs || []) as ProfileAddr[]) profMap.set(p.user_id, p);
          const devByUser = new Map<string, DeviceRow[]>();
          for (const d of (devs || []) as DeviceRow[]) {
            const arr = devByUser.get(d.user_id) || [];
            arr.push(d);
            devByUser.set(d.user_id, arr);
          }
          const couponsByPro = new Map<string, ProCouponRow[]>();
          for (const c of (coupons || []) as ProCouponRow[]) {
            const arr = couponsByPro.get(c.professional_id) || [];
            arr.push(c);
            couponsByPro.set(c.professional_id, arr);
          }

          const map = new Map<string, ProEnrich>();
          for (const pid of proIds) {
            const uid = proUserMap.get(pid) || null;
            const prof = uid ? profMap.get(uid) : null;
            const addr = buildAddress(prof);
            const devices = uid ? devByUser.get(uid) || [] : [];
            const best = pickBestProCoupon(couponsByPro.get(pid) || []);
            map.set(pid, {
              pro_user_id: uid,
              pro_name: prof?.full_name || "—",
              addressFull: addr.full,
              addressShort: addr.short,
              deviceLabel: pickPrimaryDeviceLabel(devices),
              coupon: best
                ? { name: best.name, short: formatProCouponShort(best), detail: formatProCouponDetail(best) }
                : null,
            });
          }
          if (!cancelled) setProEnrich(map);
        } else {
          const clientIds = [...new Set(displayedCalls.map((c) => c.client_id).filter(Boolean))];
          if (!clientIds.length) {
            if (!cancelled) setClientEnrich(new Map());
            return;
          }

          const [{ data: profs }, { data: devs }, { data: coupons }] = await Promise.all([
            supabase
              .from("profiles")
              .select(
                "user_id, full_name, address_street, address_number, address_neighborhood, address_city, address_state",
              )
              .in("user_id", clientIds),
            (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
              .from("user_devices")
              .select("user_id, device_name, platform, push_token, last_active")
              .in("user_id", clientIds),
            supabase
              .from("coupons")
              .select("id, user_id, source, used, discount_percent, expires_at, coupon_type")
              .in("user_id", clientIds)
              .eq("used", false),
          ]);

          const profMap = new Map<string, ProfileAddr>();
          for (const p of (profs || []) as ProfileAddr[]) profMap.set(p.user_id, p);
          const devByUser = new Map<string, DeviceRow[]>();
          for (const d of (devs || []) as DeviceRow[]) {
            const arr = devByUser.get(d.user_id) || [];
            arr.push(d);
            devByUser.set(d.user_id, arr);
          }
          const couponsByUser = new Map<string, ClientCouponRow[]>();
          for (const c of (coupons || []) as ClientCouponRow[]) {
            const arr = couponsByUser.get(c.user_id) || [];
            arr.push(c);
            couponsByUser.set(c.user_id, arr);
          }

          const map = new Map<string, ClientEnrich>();
          for (const uid of clientIds) {
            const prof = profMap.get(uid);
            const addr = buildAddress(prof);
            const devices = devByUser.get(uid) || [];
            const best = pickBestClientCoupon(couponsByUser.get(uid) || []);
            map.set(uid, {
              client_name: prof?.full_name || "—",
              addressFull: addr.full,
              addressShort: addr.short,
              deviceLabel: pickPrimaryDeviceLabel(devices),
              coupon: best
                ? {
                    code: "—",
                    short: formatClientCouponShort(best),
                    detail: formatClientCouponDetail(best),
                  }
                : null,
            });
          }
          if (!cancelled) setClientEnrich(map);
        }
      } catch (e) {
        console.warn("[AdminProtocols] enrich failed:", e);
      } finally {
        if (!cancelled) setEnrichLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [tab, displayedCalls]);

  const search = useCallback(async () => {
    const term = normalizeProtocolInput(q);
    if (term.length < 3) {
      toast({
        title: "Digite ao menos 3 caracteres",
        description: "Use Buscar para achar protocolo de suporte (SUP-…) ou chamadas fora desta lista.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setSupportSearched(true);
    const pattern = `%${escapeIlike(term)}%`;
    try {
      const [srRes, stRes] = await Promise.all([
        supabase
          .from("service_requests")
          .select("id, protocol, status, created_at, client_id, professional_id, description")
          .ilike("protocol", pattern)
          .order("created_at", { ascending: false })
          .limit(80),
        supabase
          .from("support_tickets")
          .select("id, protocol, status, subject, message, created_at, user_id, admin_reply")
          .ilike("protocol", pattern)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      if (srRes.error) throw srRes.error;
      if (stRes.error) throw stRes.error;
      const found = (srRes.data || []) as ServiceHit[];
      setAllCalls((prev) => mergeCallsById(prev, found));
      setSupportHits((stRes.data || []) as SupportHit[]);
    } catch (e: unknown) {
      toast({
        title: "Erro na busca",
        description: translateError(e instanceof Error ? e.message : "Falha ao buscar"),
        variant: "destructive",
      });
      setSupportHits([]);
    }
    setLoading(false);
  }, [q]);

  const loadNameMap = async (ids: string[]) => {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return new Map<string, string>();
    const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uniq);
    return new Map((data || []).map((p) => [p.user_id, p.full_name || "—"]));
  };

  const openCallDetail = async (row: ServiceHit) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailType("call");
    setCallDetail(null);
    setSupportDetail(null);
    try {
      const { data: proRow } = await supabase.from("professionals").select("user_id").eq("id", row.professional_id).maybeSingle();
      const proUserId = proRow?.user_id;
      const nameMap = await loadNameMap([row.client_id, proUserId].filter(Boolean) as string[]);
      const clientName = nameMap.get(row.client_id) || "Cliente";
      const proName = proUserId ? nameMap.get(proUserId) || "Profissional" : "Profissional";

      const { data: msgs, error: mErr } = await supabase
        .from("chat_messages")
        .select("id, content, created_at, sender_id")
        .eq("request_id", row.id)
        .order("created_at", { ascending: true });
      if (mErr) throw mErr;
      const senderIds = [...new Set((msgs || []).map((m) => m.sender_id))];
      const senderMap = await loadNameMap(senderIds);
      const messages = (msgs || []).map((m) => ({
        ...m,
        senderLabel:
          senderMap.get(m.sender_id) ||
          (m.sender_id === row.client_id ? clientName : m.sender_id === proUserId ? proName : "Usuário"),
      }));
      setCallDetail({ request: row, clientName, proName, messages });
    } catch (e: unknown) {
      toast({
        title: "Erro ao carregar chamada",
        description: translateError(e instanceof Error ? e.message : ""),
        variant: "destructive",
      });
      setDetailOpen(false);
    }
    setDetailLoading(false);
  };

  const openSupportDetail = async (row: SupportHit) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailType("support");
    setCallDetail(null);
    setSupportDetail(null);
    try {
      const nameMap = await loadNameMap([row.user_id]);
      const userName = nameMap.get(row.user_id) || "Usuário";

      const { data: msgs, error: mErr } = await supabase
        .from("support_messages")
        .select("id, content, created_at, sender_id, user_id, is_system")
        .eq("ticket_id", row.id)
        .order("created_at", { ascending: true });
      if (mErr) throw mErr;
      const senderIds = [...new Set((msgs || []).map((m) => m.sender_id))];
      const userIds = [...new Set((msgs || []).map((m) => m.user_id))];
      const senderMap = await loadNameMap([...senderIds, ...userIds]);

      const messages = (msgs || []).map((m) => {
        let senderLabel = "Sistema";
        if (m.is_system) senderLabel = "Chamô";
        else senderLabel = senderMap.get(m.sender_id) || senderMap.get(m.user_id) || "Atendente";
        return { ...m, senderLabel };
      });
      setSupportDetail({ ticket: row, userName, messages });
    } catch (e: unknown) {
      toast({
        title: "Erro ao carregar suporte",
        description: translateError(e instanceof Error ? e.message : ""),
        variant: "destructive",
      });
      setDetailOpen(false);
    }
    setDetailLoading(false);
  };

  const callStatusLabel: Record<string, string> = {
    pending: "Pendente",
    accepted: "Aceita",
    completed: "Concluída",
    cancelled: "Recusada / cancelada",
    rejected: "Recusada",
    closed: "Encerrada",
  };

  const callStatusClass = (status: string) => {
    if (status === "pending") return "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30";
    if (status === "accepted") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30";
    if (status === "completed") return "bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/30";
    if (status === "cancelled" || status === "rejected") return "bg-red-500/12 text-red-800 dark:text-red-200 border-red-500/25";
    return "bg-muted text-muted-foreground border-border";
  };

  const statusLabel: Record<string, string> = {
    ...callStatusLabel,
    open: "Aberto",
    in_progress: "Em andamento",
    resolved: "Resolvido",
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <AdminLayout title="Chamadas">
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Lista das últimas <strong>{CALLS_PAGE_SIZE}</strong> chamadas. Filtre pelo protocolo no campo abaixo ou use{" "}
        <strong>Buscar</strong> (mín. 3 caracteres) para incluir chamadas fora da lista e tickets de{" "}
        <strong>suporte</strong> (<code className="text-xs bg-muted px-1 rounded">SUP-…</code>). Toque numa linha para ver
        o histórico de mensagens.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
            placeholder="Filtrar por protocolo (CHM-…) ou buscar SUP-…"
            className="flex-1 bg-transparent text-sm outline-none font-mono placeholder:font-sans placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      <section className="mb-8">
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto scrollbar-hide -mx-0.5 px-0.5">
          {(
            [
              { id: "calls", label: "Chamadas", icon: MessageSquare },
              { id: "professional", label: "Profissional", icon: Briefcase },
              { id: "client", label: "Cliente", icon: UserRound },
            ] as { id: CallsTab; label: string; icon: typeof MessageSquare }[]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors border",
                tab === id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/60",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
          {!listLoading && (
            <span className="ml-auto text-xs text-muted-foreground">
              {displayedCalls.length}
              {q.trim().length >= 2 && allCalls.length !== displayedCalls.length ? ` de ${allCalls.length}` : ""}{" "}
              {displayedCalls.length === 1 ? "chamada" : "chamadas"}
              {tab !== "calls" && enrichLoading ? " · carregando…" : ""}
            </span>
          )}
        </div>

        <div className="bg-card border rounded-xl overflow-hidden">
          {listLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : displayedCalls.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border-t border-dashed">
              Nenhuma chamada encontrada{q.trim().length >= 2 ? " com esse filtro." : "."}
            </div>
          ) : tab === "calls" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Protocolo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Horário</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCalls.map((row) => (
                    <tr
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => void openCallDetail(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void openCallDetail(row);
                        }
                      }}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="p-3 font-mono text-xs text-primary font-semibold">{row.protocol || "—"}</td>
                      <td className="p-3 text-xs text-foreground tabular-nums">{formatDate(row.created_at)}</td>
                      <td className="p-3 text-xs text-muted-foreground tabular-nums">{formatTime(row.created_at)}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold",
                            callStatusClass(row.status),
                          )}
                        >
                          {callStatusLabel[row.status] || row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : tab === "professional" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Protocolo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Profissional</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Endereço</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Dispositivo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Cupom do profissional</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCalls.map((row) => {
                    const info = proEnrich.get(row.professional_id);
                    return (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => void openCallDetail(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void openCallDetail(row);
                          }
                        }}
                        className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors align-top"
                      >
                        <td className="p-3 font-mono text-xs text-primary font-semibold whitespace-nowrap">
                          {row.protocol || "—"}
                          <div className="mt-0.5 text-[10px] text-muted-foreground font-sans font-normal tabular-nums">
                            {formatDate(row.created_at)} · {formatTime(row.created_at)}
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          <p className="font-medium text-foreground">{info?.pro_name || "—"}</p>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[220px]">
                          <div className="flex items-start gap-1">
                            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary/70" />
                            <span title={info?.addressFull} className="leading-tight">
                              {info?.addressFull || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <Smartphone className="w-3 h-3 text-primary/70" />
                            {info?.deviceLabel || "—"}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          {info?.coupon ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-bold w-fit">
                                <Ticket className="w-3 h-3" />
                                {info.coupon.short}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{info.coupon.detail}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60 italic text-[11px]">sem cupom</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold",
                              callStatusClass(row.status),
                            )}
                          >
                            {callStatusLabel[row.status] || row.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Protocolo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Endereço</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Dispositivo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Cupom do cliente</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCalls.map((row) => {
                    const info = clientEnrich.get(row.client_id);
                    return (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => void openCallDetail(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void openCallDetail(row);
                          }
                        }}
                        className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors align-top"
                      >
                        <td className="p-3 font-mono text-xs text-primary font-semibold whitespace-nowrap">
                          {row.protocol || "—"}
                          <div className="mt-0.5 text-[10px] text-muted-foreground font-sans font-normal tabular-nums">
                            {formatDate(row.created_at)} · {formatTime(row.created_at)}
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          <p className="font-medium text-foreground">{info?.client_name || "—"}</p>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[220px]">
                          <div className="flex items-start gap-1">
                            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary/70" />
                            <span title={info?.addressFull} className="leading-tight">
                              {info?.addressFull || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <Smartphone className="w-3 h-3 text-primary/70" />
                            {info?.deviceLabel || "—"}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          {info?.coupon ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 text-[11px] font-bold w-fit">
                                <Ticket className="w-3 h-3" />
                                {info.coupon.short}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{info.coupon.detail}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60 italic text-[11px]">sem cupom</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold",
                              callStatusClass(row.status),
                            )}
                          >
                            {callStatusLabel[row.status] || row.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {supportSearched && supportHits.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
            <Headphones className="w-4 h-4 text-violet-500" /> Suporte ({supportHits.length})
          </h2>
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Protocolo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Assunto</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Horário</th>
                </tr>
              </thead>
              <tbody>
                {supportHits.map((row) => (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void openSupportDetail(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openSupportDetail(row);
                      }
                    }}
                    className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="p-3 font-mono text-xs text-violet-600 font-semibold">{row.protocol || "—"}</td>
                    <td className="p-3 text-xs max-w-[220px] truncate hidden sm:table-cell">{row.subject}</td>
                    <td className="p-3 text-xs tabular-nums">{formatDate(row.created_at)}</td>
                    <td className="p-3 text-xs text-muted-foreground tabular-nums">{formatTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Dialog open={detailOpen} onOpenChange={(o) => !o && setDetailOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
            <DialogTitle className="flex items-center justify-between gap-2 pr-8">
              {detailType === "call" && (
                <span className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" /> Chamada
                </span>
              )}
              {detailType === "support" && (
                <span className="flex items-center gap-2">
                  <Headphones className="w-5 h-5 text-violet-500" /> Suporte
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailLoading && (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {!detailLoading && callDetail && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-4 py-3 space-y-2 border-b bg-muted/30 text-sm shrink-0">
                <p className="font-mono font-bold text-primary">{callDetail.request.protocol}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3" /> Cliente: <strong className="text-foreground">{callDetail.clientName}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3" /> Profissional: <strong className="text-foreground">{callDetail.proName}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(callDetail.request.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="text-xs">
                  Status: <strong>{callStatusLabel[callDetail.request.status] || callDetail.request.status}</strong>
                </p>
                {callDetail.request.description && (
                  <p className="text-xs text-muted-foreground border-t pt-2 mt-1">{callDetail.request.description}</p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px] max-h-[55vh]">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Mensagens do chat</p>
                {callDetail.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhuma mensagem nesta conversa.</p>
                ) : (
                  callDetail.messages.map((m) => (
                    <div key={m.id} className="rounded-xl bg-muted/50 border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground">{m.senderLabel}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <AdminChatMessageBody content={m.content} />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {!detailLoading && supportDetail && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-4 py-3 space-y-2 border-b bg-muted/30 text-sm shrink-0">
                <p className="font-mono font-bold text-violet-600">{supportDetail.ticket.protocol}</p>
                <p className="font-medium text-foreground">{supportDetail.ticket.subject}</p>
                <p className="text-xs text-muted-foreground">
                  Usuário: <strong className="text-foreground">{supportDetail.userName}</strong> ·{" "}
                  {new Date(supportDetail.ticket.created_at).toLocaleString("pt-BR")}
                </p>
                <p className="text-xs">
                  Status: <strong>{statusLabel[supportDetail.ticket.status] || supportDetail.ticket.status}</strong>
                </p>
                <div className="text-xs text-muted-foreground border-t pt-2 mt-1 space-y-1">
                  <p className="font-medium text-foreground">Mensagem inicial</p>
                  <pre className="whitespace-pre-wrap break-words font-sans">{supportDetail.ticket.message}</pre>
                  {supportDetail.ticket.admin_reply && (
                    <>
                      <p className="font-medium text-foreground pt-2">Resposta admin (legado)</p>
                      <pre className="whitespace-pre-wrap break-words font-sans">{supportDetail.ticket.admin_reply}</pre>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px] max-h-[50vh]">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Histórico da conversa</p>
                {supportDetail.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem adicional no ticket.</p>
                ) : (
                  supportDetail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        m.is_system ? "bg-amber-500/10 border-amber-500/20" : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground">{m.senderLabel}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <AdminChatMessageBody content={m.content} />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminProtocols;
