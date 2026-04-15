import { Star, BadgeCheck, MapPin, ChevronsUpDown, Check, ChevronRight } from "lucide-react";
import { sortPublicSealsForDisplay } from "@/components/seals/FeaturedSealStack";
import { ProfessionalSealIcon } from "@/components/seals/ProfessionalSealIcon";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getHomeLocationCache,
  matchesFeaturedRegion,
  normalizeStateToUF,
  writeHomeLocationCacheOnly,
} from "@/lib/locationUtils";
import { diagLog, hardReloadOnce } from "@/lib/diag";
import { Capacitor } from "@capacitor/core";
import { useProProfileImpression } from "@/hooks/useProProfileImpression";
import { cn } from "@/lib/utils";
import { isSponsorClientAccount } from "@/lib/sponsorVisibility";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";

const AUTO_ADVANCE_MS = 6000;
/** Espaço entre cards no carrossel (alinhar ao gap-3 ≈ 0.75rem). */
const CAROUSEL_GAP_PX = 12;
/** Limite de linhas no PostgREST antes dos filtros em memória (verificado + região). */
const FEATURED_FETCH_LIMIT = 320;
/** Máximo de candidatos na região antes de escolher os exibidos no carrossel. */
const FEATURED_POOL_MAX = 200;
/** Quantos profissionais aparecem no carrossel (aleatório ou ordenado); o último slide é o CTA “Ver todos”. */
const FEATURED_DISPLAY_COUNT = 12;
/** Se a lista regional vier menor que isto, funde profissionais de todo o mesmo estado. */
const MIN_MERGE_STATE_POOL = 28;

type FeaturedSortMode = "random" | "rating" | "name" | "response_time";

const FEATURED_SORT_OPTIONS: { value: FeaturedSortMode; label: string }[] = [
  { value: "random", label: "Ordem aleatória" },
  { value: "rating", label: "Avaliação" },
  { value: "name", label: "Nome" },
  { value: "response_time", label: "Tempo de resposta" },
];

const featuredProSelect =
  "id, rating, total_services, verified, avg_response_seconds, user_id, category_id, categories(name), profession_id, professions(name), created_at";

function baseFeaturedProsQuery() {
  return supabase
    .from("professionals")
    .select(featuredProSelect)
    .eq("active", true)
    .eq("profile_status", "approved")
    .neq("availability_status", "unavailable")
    .order("verified", { ascending: false })
    .order("rating", { ascending: false });
}

interface Pro {
  id: string;
  rating: number;
  total_services: number;
  verified: boolean;
  /** Tempo médio de resposta em segundos (null = sem amostra ainda) */
  avg_response_seconds: number | null;
  user_id: string;
  profession_name: string;
  full_name: string;
  avatar_url: string | null;
  address_city: string | null;
  address_state: string | null;
  created_at: string | null;
  /** Selos públicos (ordenados: destaque primeiro) */
  seals?: { icon_variant: string }[];
}

/** Remove espaços invisíveis / ZW* que quebram ordem “alfabética” na UI. */
function normalizeForNameSort(raw: string): string {
  return (raw || "")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .normalize("NFC");
}

const nameSortCollator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function compareFeaturedNamesAsc(a: Pro, b: Pro): number {
  return nameSortCollator.compare(normalizeForNameSort(a.full_name), normalizeForNameSort(b.full_name));
}

function shuffleArray<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickFeaturedDisplay(pool: Pro[], mode: FeaturedSortMode): Pro[] {
  if (pool.length === 0) return [];
  const n = Math.min(FEATURED_DISPLAY_COUNT, pool.length);
  switch (mode) {
    case "random":
      return shuffleArray(pool).slice(0, n);
    case "rating":
      return [...pool]
        .sort((a, b) => b.rating - a.rating || b.total_services - a.total_services)
        .slice(0, n);
    case "name":
      return [...pool].sort(compareFeaturedNamesAsc).slice(0, n);
    case "response_time": {
      const sec = (p: Pro) =>
        p.avg_response_seconds != null && p.avg_response_seconds >= 0 ? p.avg_response_seconds : null;
      return [...pool]
        .sort((a, b) => {
          const sa = sec(a);
          const sb = sec(b);
          if (sa === null && sb === null) return b.rating - a.rating || b.total_services - a.total_services;
          if (sa === null) return 1;
          if (sb === null) return -1;
          if (sa !== sb) return sa - sb;
          return b.rating - a.rating || b.total_services - a.total_services;
        })
        .slice(0, n);
    }
    default:
      return pool.slice(0, n);
  }
}

/** Profissional logado sempre em 1.º, se estiver no pool regional (até FEATURED_DISPLAY_COUNT itens). */
function applySelfFirstInFeatured(picked: Pro[], rawPool: Pro[], selfUserId: string | undefined): Pro[] {
  if (!selfUserId) return picked;
  const selfPro = rawPool.find((p) => p.user_id === selfUserId);
  if (!selfPro) return picked;
  const withoutSelf = picked.filter((p) => p.id !== selfPro.id);
  const maxLen = FEATURED_DISPLAY_COUNT;
  const rest = withoutSelf.slice(0, Math.max(0, maxLen - 1));
  return [selfPro, ...rest];
}

interface FeaturedProfessionalsProps {
  section?: { title?: string };
}

const getAvatarUrl = (avatarUrl?: string | null) => {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/${avatarUrl}`;
};

/**
 * Melhor selo na frente; 2º e 3º atrás, lado a lado, ~50% sobrepostos entre si.
 * Selos além do 3º viram +N ao lado.
 */
function FeaturedSealStrip({ seals }: { seals: { icon_variant: string }[] }) {
  const best = seals[0];
  if (!best) return null;
  const backA = seals[1];
  const backB = seals[2];
  const extra = Math.max(0, seals.length - 3);
  return (
    <div
      className="flex items-center justify-end gap-2 min-w-0 flex-1 pl-3"
      aria-hidden
    >
      <div className="relative h-11 w-[3.25rem] sm:w-[3.5rem] shrink-0">
        {(backA || backB) && (
          <div className="absolute right-[1.65rem] top-1/2 z-0 flex flex-row items-center -translate-y-1/2">
            {backA && (
              <div className="relative shrink-0 opacity-90">
                <ProfessionalSealIcon variant={backA.icon_variant} size={18} earned flat />
              </div>
            )}
            {backB && (
              <div className={cn("relative shrink-0 opacity-90", backA && "-ml-[9px]")}>
                <ProfessionalSealIcon variant={backB.icon_variant} size={18} earned flat />
              </div>
            )}
          </div>
        )}
        <div className="absolute right-0 top-1/2 z-[2] -translate-y-1/2">
          <ProfessionalSealIcon variant={best.icon_variant} size={28} earned flat />
        </div>
      </div>
      {extra > 0 && (
        <span className="shrink-0 text-[11px] font-bold tabular-nums tracking-tight text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}

function FeaturedProCard({ pro }: { pro: Pro }) {
  const impressionRef = useProProfileImpression(pro.user_id);
  const initials = pro.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarSrc = getAvatarUrl(pro.avatar_url);
  const cityLine =
    pro.address_city || pro.address_state
      ? [pro.address_city, pro.address_state].filter(Boolean).join(", ")
      : null;
  return (
    <div ref={impressionRef} className="w-full min-w-0 min-h-0 flex">
      <Link
        to={`/professional/${pro.id}`}
        className="bg-card rounded-xl lg:rounded-2xl border shadow-card p-4 lg:p-5 flex flex-col gap-2.5 lg:gap-3 w-full min-w-0 overflow-hidden active:scale-[0.97] transition-transform"
      >
        {/* Foto + selos ao lado (melhor selo maior); texto abaixo da foto */}
        <div className="flex gap-4 lg:gap-5 items-start w-full min-w-0">
          <div className="relative shrink-0 self-start">
            <div className="w-16 h-16 lg:w-[72px] lg:h-[72px] rounded-full bg-muted flex items-center justify-center text-base font-bold text-muted-foreground overflow-hidden ring-2 ring-border/40">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={pro.full_name}
                  className="w-full h-full object-cover rounded-full"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                initials
              )}
            </div>
            {pro.verified && (
              <div className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center ring-2 ring-card shadow-sm">
                <BadgeCheck className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          {pro.seals && pro.seals.length > 0 ? (
            <FeaturedSealStrip seals={pro.seals} />
          ) : (
            <div className="flex-1 min-w-0" />
          )}
        </div>

        <div className="min-w-0 -mt-0.5">
          <p className="font-bold text-foreground text-sm lg:text-base truncate leading-tight">{pro.full_name}</p>
          <p className="text-sm lg:text-[15px] font-semibold text-primary truncate mt-0.5">{pro.profession_name}</p>
          {pro.verified && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 mt-0.5">
              <BadgeCheck className="w-3 h-3 shrink-0" /> Verificado
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-primary text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">{Number(pro.rating).toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">· {pro.total_services} serv.</span>
        </div>

        {cityLine && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">{cityLine}</span>
          </div>
        )}

        <div className="mt-auto pt-1">
          <div className="w-full text-center text-sm font-semibold py-2.5 rounded-lg bg-primary text-white">
            Contratar
          </div>
        </div>
      </Link>
    </div>
  );
}

const FeaturedProfessionals = ({ section }: FeaturedProfessionalsProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  /** Candidatos regionais (até FEATURED_POOL_MAX); ordenação final = pickFeaturedDisplay + self primeiro + selos. */
  const [rawPool, setRawPool] = useState<Pro[]>([]);
  const [professionals, setProfessionals] = useState<Pro[]>([]);
  const [prosLoaded, setProsLoaded] = useState(false);
  const [sortMode, setSortMode] = useState<FeaturedSortMode>("random");
  const [filterOpen, setFilterOpen] = useState(false);
  const { user, profile } = useAuth();
  const featuredSelfUserId =
    profile?.user_type === "professional" || profile?.user_type === "company" ? user?.id : undefined;

  // Init from localStorage immediately — avoids waiting for DB before first render
  const cachedLoc = useMemo(() => getHomeLocationCache(), []);
  const [userCity, setUserCity] = useState<string | null>(cachedLoc?.city ?? null);
  const [userState, setUserState] = useState<string | null>(cachedLoc?.state ?? null);

  const loadGenRef = useRef(0);
  const hangRetryRef = useRef(0);

  // Fetch fresh location in background and update cache
  const refreshUserLocation = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("address_city, address_state")
      .eq("user_id", user.id)
      .single();
    if (!data) return;
    const city = data.address_city ?? null;
    const state = data.address_state ?? null;
    writeHomeLocationCacheOnly(city, state);
    setUserCity(city);
    setUserState(state);
  }, []);

  const loadPros = useCallback(async () => {
    loadGenRef.current += 1;
    const gen = loadGenRef.current;
    setProsLoaded(false);
    setRawPool([]);
    setProfessionals([]);

    const timeoutMs = Capacitor.isNativePlatform() ? 12_000 : 9_000;

    const watchdog = setTimeout(() => {
      if (loadGenRef.current !== gen) return;
      diagLog("warn", "featured", "pros fetch timeout", { ms: timeoutMs });
      hardReloadOnce("featured_pros_timeout");
      hangRetryRef.current += 1;
      loadGenRef.current += 1;
      if (hangRetryRef.current <= 3) {
        setTimeout(() => loadPros(), 1_200);
      } else {
        hangRetryRef.current = 0;
        setRawPool([]);
        setProfessionals([]);
        setProsLoaded(true);
      }
    }, timeoutMs);

    try {
      diagLog("info", "featured", "pros fetch start", { city: userCity, state: userState });

      // ── Passo 1: user_ids em profiles que batem com a região do cliente ─────
      // Com cidade definida: só essa cidade (normalizada), sem fallback para estado/país
      // (evita mostrar SP quando o cliente escolheu Patrocínio e não há match na query exata).
      let locationUserIds: string[] | null = null;
      const cityTrim = (userCity || "").trim();
      const hasCityFilter = cityTrim.length > 0;

      const escapeIlike = (s: string) => s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

      if (hasCityFilter || userState) {
        try {
          if (hasCityFilter) {
            const pattern = `%${escapeIlike(cityTrim)}%`;
            const { data: cand } = await supabase
              .from("profiles")
              .select("user_id, address_city, address_state")
              .ilike("address_city", pattern)
              .limit(500);
            const matched = (cand || []).filter((row) =>
              matchesFeaturedRegion(cityTrim, userState, row.address_city, row.address_state),
            );
            locationUserIds = matched.map((p) => p.user_id);
            diagLog("info", "featured", "location city filter", {
              city: cityTrim,
              candidates: cand?.length ?? 0,
              matched: locationUserIds.length,
            });
          } else if (userState) {
            const uf = userState.length === 2 ? userState.toUpperCase() : userState;
            const { data: cand } = await supabase
              .from("profiles")
              .select("user_id, address_city, address_state")
              .or(`address_state.ilike.${uf},address_state.ilike.${userState}`)
              .limit(500);
            const matched = (cand || []).filter((row) =>
              matchesFeaturedRegion(null, userState, row.address_city, row.address_state),
            );
            locationUserIds = matched.map((p) => p.user_id);
            diagLog("info", "featured", "location state filter", { matched: locationUserIds.length });
          }
        } catch {
          diagLog("warn", "featured", "location pre-filter failed");
          locationUserIds = hasCityFilter ? [] : null;
        }
      }

      // Cidade não encontrou nenhum perfil, mas há UF: amplia para todo o estado (evita destaque vazio).
      if (hasCityFilter && locationUserIds !== null && locationUserIds.length === 0 && userState) {
        try {
          const uf = userState.length === 2 ? userState.toUpperCase() : userState;
          const { data: cand } = await supabase
            .from("profiles")
            .select("user_id, address_city, address_state")
            .or(`address_state.ilike.${uf},address_state.ilike.${userState}`)
            .limit(800);
          const matched = (cand || []).filter((row) =>
            matchesFeaturedRegion(null, userState, row.address_city, row.address_state),
          );
          locationUserIds = matched.map((p) => p.user_id);
          diagLog("info", "featured", "city had 0 profiles — widened to state", { matched: locationUserIds.length });
        } catch {
          locationUserIds = [];
        }
      }

      // ── Passo 2: profissionais ─────────────────────────────────────────────
      let finalPros: any[] | null = null;
      let prosErr: { message: string } | null = null;

      if (hasCityFilter && locationUserIds !== null && locationUserIds.length === 0 && !userState) {
        diagLog("info", "featured", "strict city, no state fallback — empty regional ids");
        finalPros = [];
      } else {
        let prosQuery = baseFeaturedProsQuery();

        if (locationUserIds !== null) {
          if (locationUserIds.length > 0) {
            prosQuery = prosQuery.in("user_id", locationUserIds);
          } else {
            finalPros = [];
          }
        }

        if (finalPros === null) {
          const { data: pros, error: qErr } = await prosQuery.limit(FEATURED_FETCH_LIMIT);
          if (qErr) prosErr = qErr;
          else finalPros = pros || [];
        }
      }

      // Poucos na região: incluir verificados (e demais) de todo o estado do utilizador.
      if (!prosErr && finalPros && userState && finalPros.length < MIN_MERGE_STATE_POOL) {
        try {
          const uf = userState.length === 2 ? userState.toUpperCase() : userState;
          const { data: stCand } = await supabase
            .from("profiles")
            .select("user_id, address_city, address_state")
            .or(`address_state.ilike.${uf},address_state.ilike.${userState}`)
            .limit(1200);
          const stMatched = (stCand || []).filter((row) =>
            matchesFeaturedRegion(null, userState, row.address_city, row.address_state),
          );
          const stIds = stMatched.map((p) => p.user_id);
          if (stIds.length > 0) {
            const { data: morePros, error: mErr } = await baseFeaturedProsQuery()
              .in("user_id", stIds)
              .limit(FEATURED_FETCH_LIMIT);
            if (!mErr && morePros?.length) {
              const byId = new Map(finalPros.map((p: any) => [p.id, p]));
              for (const p of morePros) byId.set(p.id, p);
              finalPros = [...byId.values()];
              diagLog("info", "featured", "merged state pool", { total: finalPros.length });
            }
          }
        } catch {
          /* ignore */
        }
      }

      // Sem nenhum resultado regional: lista global (prioriza verificado + rating na query).
      if (!prosErr && finalPros && finalPros.length === 0) {
        diagLog("info", "featured", "empty regional — global list");
        const { data: allPros, error: gErr } = await baseFeaturedProsQuery().limit(FEATURED_FETCH_LIMIT);
        if (gErr) prosErr = gErr;
        else finalPros = allPros || [];
      }

      clearTimeout(watchdog);
      if (loadGenRef.current !== gen) return;

      if (prosErr) {
        diagLog("error", "featured", "pros fetch error", { message: prosErr.message });
        hangRetryRef.current += 1;
        loadGenRef.current += 1;
        if (hangRetryRef.current <= 3) setTimeout(() => loadPros(), 1_200);
        else { hangRetryRef.current = 0; setRawPool([]); setProfessionals([]); setProsLoaded(true); }
        return;
      }

      if (!finalPros || finalPros.length === 0) {
        diagLog("warn", "featured", "no pros after all fallbacks");
        hangRetryRef.current = 0;
        setRawPool([]);
        setProfessionals([]);
        setProsLoaded(true);
        return;
      }

      const userIds = finalPros.map((p) => p.user_id);

      let profilesRes: { data: unknown[] | null; error: unknown };
      let locationsRes: { data: unknown[] | null; error: unknown };
      try {
        const pair = await Promise.race([
          Promise.all([
            supabase.from("profiles_public" as any).select("user_id, full_name, avatar_url").in("user_id", userIds),
            supabase.from("profiles").select("user_id, address_city, address_state, user_type").in("user_id", userIds),
          ]),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("featured_secondary_timeout")), 8_000)),
        ]);
        [profilesRes, locationsRes] = pair;
      } catch {
        diagLog("warn", "featured", "secondary queries timeout");
        profilesRes = { data: [], error: null };
        locationsRes = { data: [], error: null };
      }

      if (loadGenRef.current !== gen) return;

      const profileMap = new Map(
        ((profilesRes.data || []) as { user_id: string; full_name: string; avatar_url: string | null }[]).map((p) => [p.user_id, p])
      );
      const locationMap = new Map(
        ((locationsRes.data || []) as { user_id: string; address_city: string | null; address_state: string | null; user_type?: string | null }[]).map((p) => [p.user_id, p])
      );

      const finalProsNoSponsor = finalPros.filter(
        (p) => !isSponsorClientAccount(locationMap.get(p.user_id)?.user_type),
      );

      const userUF = normalizeStateToUF(userState);

      const mappedBase = finalProsNoSponsor.map((p) => {
        const loc = locationMap.get(p.user_id);
        return {
          id: p.id,
          rating: p.rating,
          total_services: p.total_services,
          verified: p.verified,
          avg_response_seconds:
            typeof p.avg_response_seconds === "number" && Number.isFinite(p.avg_response_seconds)
              ? p.avg_response_seconds
              : null,
          user_id: p.user_id,
          profession_name: (p.professions as any)?.name || (p.categories as any)?.name || "—",
          full_name: profileMap.get(p.user_id)?.full_name || "Profissional",
          avatar_url: profileMap.get(p.user_id)?.avatar_url || null,
          address_city: loc?.address_city ?? null,
          address_state: loc?.address_state ?? null,
          created_at: (p as any).created_at as string | null,
        };
      });

      const strictInRegion = (p: (typeof mappedBase)[0]) =>
        matchesFeaturedRegion(userCity, userState, p.address_city, p.address_state);

      const tierStrict = mappedBase.filter(strictInRegion);
      const idsStrict = new Set(tierStrict.map((p) => p.id));

      const tierStateVerified = mappedBase.filter(
        (p) =>
          !idsStrict.has(p.id) &&
          p.verified &&
          !!userUF &&
          normalizeStateToUF(p.address_state) === userUF,
      );

      let combined = [...tierStrict, ...tierStateVerified];
      const inCombined = new Set(combined.map((p) => p.id));

      if (combined.length < 12) {
        const extraVerified = mappedBase
          .filter((p) => p.verified && !inCombined.has(p.id))
          .sort((a, b) => b.rating - a.rating || b.total_services - a.total_services);
        for (const p of extraVerified) {
          if (combined.length >= FEATURED_POOL_MAX) break;
          combined.push(p);
          inCombined.add(p.id);
        }
      }

      combined.sort((a, b) => {
        const aS = strictInRegion(a) ? 0 : 1;
        const bS = strictInRegion(b) ? 0 : 1;
        if (aS !== bS) return aS - bS;
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        if (b.total_services !== a.total_services) return b.total_services - a.total_services;
        if (b.rating !== a.rating) return b.rating - a.rating;
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tA - tB;
      });

      const poolCapped = combined.slice(0, FEATURED_POOL_MAX);

      diagLog("info", "featured", "pros pool ready", {
        total: finalPros.length,
        pool: poolCapped.length,
        displayCap: FEATURED_DISPLAY_COUNT,
      });
      if (loadGenRef.current !== gen) return;
      hangRetryRef.current = 0;
      setRawPool(poolCapped);
    } catch (e) {
      clearTimeout(watchdog);
      if (loadGenRef.current === gen) {
        diagLog("error", "featured", "pros load threw", { e: String(e) });
        hangRetryRef.current += 1;
        loadGenRef.current += 1;
        if (hangRetryRef.current <= 3) setTimeout(() => loadPros(), 1_200);
        else { hangRetryRef.current = 0; setRawPool([]); setProfessionals([]); setProsLoaded(true); }
      }
    } finally {
      if (loadGenRef.current === gen) setProsLoaded(true);
    }
  }, [userCity, userState]);

  const displayPicked = useMemo(
    () => applySelfFirstInFeatured(pickFeaturedDisplay(rawPool, sortMode), rawPool, featuredSelfUserId),
    [rawPool, sortMode, featuredSelfUserId],
  );

  useEffect(() => {
    const picked = displayPicked;
    if (picked.length === 0) {
      setProfessionals([]);
      return;
    }

    let cancelled = false;
    setProfessionals([]);

    void (async () => {
      const proIds = picked.map((p) => p.id);
      const sealsByPro = new Map<string, { icon_variant: string }[]>();
      try {
        const { data: sealData } = await supabase.rpc("public_professional_seals" as any, { p_ids: proIds });
        type SealRow = {
          professional_id: string;
          icon_variant: string;
          sort_order: number;
          is_special: boolean;
        };
        const rows = (sealData || []) as SealRow[];
        const grouped = new Map<string, SealRow[]>();
        for (const r of rows) {
          const list = grouped.get(r.professional_id) || [];
          list.push(r);
          grouped.set(r.professional_id, list);
        }
        grouped.forEach((list, pid) => {
          const sorted = sortPublicSealsForDisplay(list);
          sealsByPro.set(
            pid,
            sorted.map((s) => ({ icon_variant: s.icon_variant })),
          );
        });
      } catch (sealErr) {
        diagLog("warn", "featured", "public_professional_seals failed", { e: String(sealErr) });
      }

      if (cancelled) return;
      setProfessionals(
        picked.map((p) => ({
          ...p,
          seals: sealsByPro.get(p.id) ?? [],
        })),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [displayPicked]);

  const displayKey = useMemo(() => displayPicked.map((p) => p.id).join("|"), [displayPicked]);

  useEffect(() => {
    setActiveIndex(0);
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: 0, behavior: "auto" });
  }, [displayKey, sortMode]);

  useEffect(() => {
    refreshUserLocation();
  }, [refreshUserLocation]);

  useEffect(() => {
    const onLoc = (e: Event) => {
      const d = (e as CustomEvent<{ city: string | null; state: string | null }>).detail;
      if (!d) return;
      setUserCity(d.city ?? null);
      setUserState(d.state ?? null);
    };
    window.addEventListener("chamo_home_location_updated", onLoc);
    return () => window.removeEventListener("chamo_home_location_updated", onLoc);
  }, []);

  useEffect(() => {
    loadPros();
  }, [loadPros]);

  useEffect(() => {
    const channel = supabase
      .channel("featured-pro-updates")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "professionals" }, () => {
        loadPros();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPros]);

  const getFeaturedCardEls = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll<HTMLElement>("[data-featured-card]"));
  }, []);

  const scrollToCardIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      const cards = getFeaturedCardEls();
      if (!el || cards.length === 0) return;
      const i = Math.max(0, Math.min(index, cards.length - 1));
      setActiveIndex(i);
      const card = cards[i];
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      el.scrollTo({ left: card.offsetLeft - pad, behavior: "smooth" });
    },
    [getFeaturedCardEls],
  );

  const syncActiveIndexFromScroll = useCallback(() => {
    const el = scrollRef.current;
    const cards = getFeaturedCardEls();
    if (!el || cards.length === 0) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const mid = c.offsetLeft + c.offsetWidth / 2;
      if (mid <= center) best = i;
    }
    setActiveIndex(best);
  }, [getFeaturedCardEls]);

  useEffect(() => {
    if (isPaused || professionals.length === 0) return;
    const interval = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-featured-card]"));
      if (cards.length === 0) return;
      const gapStr = getComputedStyle(el).gap;
      const gapPx = parseFloat(gapStr);
      const gap = Number.isFinite(gapPx) ? gapPx : CAROUSEL_GAP_PX;
      const step = cards[0].offsetWidth + gap;
      const max = el.scrollWidth - el.clientWidth;
      let next = el.scrollLeft + step;
      if (next >= max - 2) next = 0;
      el.scrollTo({ left: next, behavior: "smooth" });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [isPaused, professionals.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || professionals.length === 0) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        syncActiveIndexFromScroll();
        raf = 0;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [professionals.length, syncActiveIndexFromScroll]);

  const showFeaturedSkeleton = !prosLoaded || (rawPool.length > 0 && professionals.length === 0);

  if (showFeaturedSkeleton) {
    return (
      <section className="w-full min-w-0">
        <div className="px-1 mb-3 lg:mb-4">
          <h3 className="font-semibold lg:text-lg text-foreground text-center w-full mb-3">
            {section?.title ?? "Profissionais em destaque"}
          </h3>
          <div className="rounded-2xl border border-border/60 bg-muted/25 p-1.5">
            <div className="h-10 w-full rounded-xl bg-muted animate-pulse" aria-hidden />
          </div>
        </div>
        <div className="flex gap-3 lg:gap-4 overflow-x-auto pb-2" data-tab-swipe-ignore>
          {[1, 2].map((i) => (
            <div key={i} className="flex-shrink-0 w-[140px] lg:w-[168px] rounded-2xl border bg-card p-3 lg:p-4 space-y-2">
              <div className="w-14 h-14 rounded-full bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-20 rounded bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-16 rounded bg-muted animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (rawPool.length === 0) return null;

  const sortTriggerLabel = FEATURED_SORT_OPTIONS.find((o) => o.value === sortMode)?.label ?? "Ordenar";

  const featuredCardWidthClass =
    "flex-none w-[min(11rem,calc(50vw-1.75rem))] sm:w-[13.5rem] lg:w-[15rem] min-w-0";

  return (
    <section className="w-full min-w-0">
      <div className="px-1 mb-3 lg:mb-4">
        <h3 className="font-semibold lg:text-lg text-foreground text-center w-full mb-3 tracking-tight">
          {section?.title ?? "Profissionais em destaque"}
        </h3>
        <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-card to-muted/20 dark:to-muted/10 p-1.5 shadow-sm min-w-0">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background/90 px-3 py-2.5 text-left text-xs sm:text-sm font-semibold text-foreground shadow-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/35"
                aria-label="Ordenar profissionais em destaque"
                aria-expanded={filterOpen}
              >
                <span className="min-w-0 flex-1 truncate">{sortTriggerLabel}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-[min(100vw-1.5rem,17.5rem)] rounded-2xl border border-border/80 bg-card p-2 shadow-xl"
            >
              <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Ordenar por
              </p>
              <ul className="space-y-0.5" role="listbox">
                {FEATURED_SORT_OPTIONS.map((opt) => {
                  const selected = sortMode === opt.value;
                  return (
                    <li key={opt.value} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onClick={() => {
                          setSortMode(opt.value);
                          setFilterOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                          selected ? "bg-primary/12 text-foreground" : "text-foreground hover:bg-primary/8",
                        )}
                      >
                        <span className="flex w-5 shrink-0 justify-center text-primary">
                          {selected ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}
                        </span>
                        <span className="min-w-0 leading-snug">{opt.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div
        ref={scrollRef}
        data-tab-swipe-ignore
        className="flex overflow-x-auto overflow-y-hidden gap-3 lg:gap-5 pb-2 scrollbar-hide px-2 lg:px-4 box-border overscroll-x-contain touch-pan-x"
        style={{ WebkitOverflowScrolling: "touch" }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {professionals.map((pro) => (
          <div key={pro.id} data-featured-card className={featuredCardWidthClass}>
            <FeaturedProCard pro={pro} />
          </div>
        ))}
        <div data-featured-card className={featuredCardWidthClass}>
          <Link
            to="/search"
            className="flex h-full min-h-[17.5rem] flex-col items-center justify-center gap-3 rounded-xl lg:rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-b from-primary/12 via-primary/6 to-transparent p-4 text-center shadow-inner shadow-primary/5 transition-all hover:border-primary/55 hover:from-primary/16 active:scale-[0.98]"
          >
            <span className="text-[15px] sm:text-base font-black uppercase tracking-[0.12em] text-primary leading-tight">
              Ver todos
            </span>
            <span className="text-[11px] sm:text-xs text-muted-foreground leading-snug px-1">
              Explorar todos os profissionais na busca
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-md">
              Abrir busca
              <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>
        </div>
      </div>

      {professionals.length + 1 > 1 && (
        <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
          {professionals.map((pro, i) => (
            <button
              key={pro.id}
              type="button"
              onClick={() => scrollToCardIndex(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                i === activeIndex ? "bg-primary" : "bg-muted-foreground/30"
              }`}
              aria-label={`Profissional ${i + 1} de ${professionals.length}`}
            />
          ))}
          <button
            type="button"
            onClick={() => scrollToCardIndex(professionals.length)}
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
              activeIndex === professionals.length ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            aria-label="Ver todos os profissionais"
          />
        </div>
      )}
    </section>
  );
};

export default FeaturedProfessionals;
