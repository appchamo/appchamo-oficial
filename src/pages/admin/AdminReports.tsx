import AdminLayout from "@/components/AdminLayout";
import { Eye, MousePointerClick, Users, ArrowDown, ArrowUp, Smartphone } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

type SortDir = "desc" | "asc";

// ─── Views Tab ───
const ViewsTab = () => {
  const [categoryViews, setCategoryViews] = useState<{ name: string; count: number }[]>([]);
  const [proViews, setProViews] = useState<{ name: string; count: number }[]>([]);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      // Category stats: count professionals per category
      const { data: cats } = await supabase.from("categories").select("id, name").eq("active", true);
      const { data: pros } = await supabase.from("professionals").select("id, category_id, user_id").eq("active", true);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");

      if (cats && pros) {
        const catMap = new Map(cats.map((c) => [c.id, c.name]));
        const catCounts: Record<string, number> = {};
        for (const p of pros) {
          const name = catMap.get(p.category_id || "") || "Sem categoria";
          catCounts[name] = (catCounts[name] || 0) + 1;
        }
        setCategoryViews(Object.entries(catCounts).map(([name, count]) => ({ name, count })));
      }

      if (pros && profiles) {
        const profMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
        // Count service requests per professional
        const { data: reqs } = await supabase.from("service_requests").select("professional_id");
        const proCounts: Record<string, number> = {};
        const proNameMap: Record<string, string> = {};
        for (const p of pros) {
          proNameMap[p.id] = profMap.get(p.user_id) || "—";
          proCounts[p.id] = 0;
        }
        for (const r of (reqs || [])) {
          if (proCounts[r.professional_id] !== undefined) proCounts[r.professional_id]++;
        }
        setProViews(Object.entries(proCounts).map(([id, count]) => ({ name: proNameMap[id] || id, count })));
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const sort = (arr: { name: string; count: number }[]) =>
    [...arr].sort((a, b) => sortDir === "desc" ? b.count - a.count : a.count - b.count);

  const SortBtn = () => (
    <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} className="flex items-center gap-1 text-[11px] text-primary font-medium">
      {sortDir === "desc" ? <><ArrowDown className="w-3 h-3" /> Maior → Menor</> : <><ArrowUp className="w-3 h-3" /> Menor → Maior</>}
    </button>
  );

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Contagem de <strong>profissionais ativos</strong> por categoria (não são “visualizações” de ecrã).
      </p>
      <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground text-sm">Profissionais ativos por categoria</h3><SortBtn /></div>
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="divide-y">
          {sort(categoryViews).map((c, i) => (
            <div key={i} className="flex items-center justify-between p-3">
              <span className="text-sm text-foreground">{c.name}</span>
              <span className="text-sm font-bold text-primary">{c.count}</span>
            </div>
          ))}
          {categoryViews.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Sem dados</p>}
        </div>
      </div>

      <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground text-sm">Chamadas (pedidos) por profissional ativo</h3><SortBtn /></div>
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="divide-y">
          {sort(proViews).slice(0, 20).map((p, i) => (
            <div key={i} className="flex items-center justify-between p-3">
              <span className="text-sm text-foreground">{p.name}</span>
              <span className="text-sm font-bold text-primary">{p.count}</span>
            </div>
          ))}
          {proViews.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Sem dados</p>}
        </div>
      </div>
    </div>
  );
};

// ─── Clicks Tab ───
const ClicksTab = () => {
  const [sponsorClicks, setSponsorClicks] = useState<{ name: string; count: number }[]>([]);
  const [serviceRequests, setServiceRequests] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      // Sponsor clicks from sponsor_clicks table (accurate count)
      const { data: sponsors } = await supabase.from("sponsors").select("id, name").eq("active", true);
      if (sponsors) {
        const clickCounts: { name: string; count: number }[] = [];
        for (const s of sponsors) {
          const { count } = await supabase.from("sponsor_clicks").select("*", { count: "exact", head: true }).eq("sponsor_id", s.id);
          clickCounts.push({ name: s.name, count: count || 0 });
        }
        setSponsorClicks(clickCounts.sort((a, b) => b.count - a.count));
      }

      // Service request count = "chamadas" clicks
      const { count } = await supabase.from("service_requests").select("*", { count: "exact", head: true });
      setServiceRequests(count || 0);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border rounded-xl p-4">
          <MousePointerClick className="w-5 h-5 text-primary mb-1" />
          <p className="text-xl font-bold text-foreground">{serviceRequests}</p>
          <p className="text-[11px] text-muted-foreground">Total de Chamadas</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <Eye className="w-5 h-5 text-muted-foreground mb-1" />
          <p className="text-xl font-bold text-foreground">{sponsorClicks.reduce((a, b) => a + b.count, 0)}</p>
          <p className="text-[11px] text-muted-foreground">Cliques em Patrocinadores</p>
        </div>
      </div>

      <h3 className="font-semibold text-foreground text-sm">Cliques por Patrocinador</h3>
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="divide-y">
          {sponsorClicks.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-3">
              <span className="text-sm text-foreground">{s.name}</span>
              <span className="text-sm font-bold text-primary">{s.count}</span>
            </div>
          ))}
          {sponsorClicks.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Sem dados</p>}
        </div>
      </div>
    </div>
  );
};

// ─── Professionals Tab ───
const ProfessionalsTab = () => {
  const [data, setData] = useState<{ name: string; services: number; rating: number; reviews: number }[]>([]);
  const [sortBy, setSortBy] = useState<"services" | "rating" | "reviews">("services");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: pros } = await supabase.from("professionals").select("user_id, total_services, rating, total_reviews").eq("active", true);
      if (!pros) { setLoading(false); return; }
      const userIds = pros.map(p => p.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const nameMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
      setData(
        pros.map((p) => ({
          name: nameMap.get(p.user_id) || "—",
          services: Number(p.total_services ?? 0),
          rating: Number(p.rating ?? 0),
          reviews: Number(p.total_reviews ?? 0),
        })),
      );
      setLoading(false);
    };
    fetch();
  }, []);

  const sorted = [...data].sort((a, b) => b[sortBy] - a[sortBy]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["services", "rating", "reviews"] as const).map(key => (
          <button key={key} onClick={() => setSortBy(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sortBy === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {key === "services" ? "Mais atendimentos" : key === "rating" ? "Melhores avaliações" : "Mais avaliações"}
          </button>
        ))}
      </div>
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground">#</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Profissional</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Atendimentos</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Avaliação</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Reviews</th>
            </tr></thead>
            <tbody>
              {sorted.slice(0, 30).map((p, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium text-foreground text-xs md:text-sm">{p.name}</td>
                  <td className="p-3 text-xs">{p.services}</td>
                  <td className="p-3 text-xs">⭐ {p.rating.toFixed(1)}</td>
                  <td className="p-3 text-xs">{p.reviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Sem dados</p>}
      </div>
    </div>
  );
};

const FETCH_PAGE = 1000;

type ProfileLite = { user_id: string; full_name: string; email: string; user_type: string };
type SubLite = { user_id: string; plan_id: string; status: string; updated_at: string };
type UserDeviceRow = { user_id: string; device_id: string; device_name: string | null; last_active: string | null };

async function paginateProfiles(): Promise<ProfileLite[]> {
  const out: ProfileLite[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, user_type")
      .order("full_name", { ascending: true })
      .range(from, from + FETCH_PAGE - 1);
    if (error) {
      console.error("[AdminReports] profiles", error);
      break;
    }
    if (!data?.length) break;
    out.push(...(data as ProfileLite[]));
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return out;
}

async function paginateSubscriptions(): Promise<SubLite[]> {
  const out: SubLite[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("user_id, plan_id, status, updated_at")
      .range(from, from + FETCH_PAGE - 1);
    if (error) {
      console.error("[AdminReports] subscriptions", error);
      break;
    }
    if (!data?.length) break;
    out.push(...(data as SubLite[]));
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return out;
}

async function paginateUserDevices(): Promise<UserDeviceRow[]> {
  const out: UserDeviceRow[] = [];
  let from = 0;
  const client = supabase as unknown as {
    from: (t: string) => ReturnType<typeof supabase.from>;
  };
  for (;;) {
    const { data, error } = await client
      .from("user_devices")
      .select("user_id, device_id, device_name, last_active")
      .range(from, from + FETCH_PAGE - 1);
    if (error) {
      console.error("[AdminReports] user_devices", error);
      break;
    }
    if (!data?.length) break;
    out.push(...(data as UserDeviceRow[]));
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return out;
}

function bucketFromDeviceName(name: string | null): "iphone" | "android" | "desktop" | "outro" {
  const n = (name || "").toLowerCase();
  if (n.includes("iphone") || n.includes("ios") || n.includes("ipad")) return "iphone";
  if (n.includes("android")) return "android";
  if (n.includes("web") || n.includes("desktop") || n.includes("pwa") || n.includes("chrome")) return "desktop";
  return "outro";
}

function bucketLabel(b: "iphone" | "android" | "desktop" | "outro"): string {
  if (b === "iphone") return "iPhone";
  if (b === "android") return "Android";
  if (b === "desktop") return "Web/Desktop";
  return "Outro";
}

function pickPrimaryDeviceLabel(devices: UserDeviceRow[]): string {
  if (!devices.length) return "—";
  const sorted = [...devices].sort(
    (a, b) => new Date(b.last_active || 0).getTime() - new Date(a.last_active || 0).getTime(),
  );
  const first = sorted[0];
  const b = bucketFromDeviceName(first.device_name);
  if (b === "outro" && first.device_name?.trim()) return first.device_name.trim();
  return bucketLabel(b);
}

function formatSessionBreakdown(devices: UserDeviceRow[]): string {
  if (!devices.length) return "Sem app registado (web ou sem push)";
  const c = { iphone: 0, android: 0, desktop: 0, outro: 0 };
  for (const d of devices) {
    c[bucketFromDeviceName(d.device_name)]++;
  }
  const parts: string[] = [];
  if (c.iphone) parts.push(`${c.iphone} iPhone${c.iphone > 1 ? "s" : ""}`);
  if (c.android) parts.push(`${c.android} Android${c.android > 1 ? "s" : ""}`);
  if (c.desktop) parts.push(`${c.desktop} web/desktop`);
  if (c.outro) parts.push(`${c.outro} outro${c.outro > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

function userTypeBadge(userType: string): string {
  const t = (userType || "").toLowerCase();
  if (t === "professional") return "Profissional";
  if (t === "company") return "Empresa";
  if (t === "client") return "Cliente";
  if (t === "pending_signup") return "Cadastro pendente";
  return userType || "—";
}

function planBadgeForUser(subsByUser: Map<string, SubLite[]>, userId: string): string {
  const list = subsByUser.get(userId) || [];
  if (!list.length) return "Free (sem assinatura)";
  const rank = (s: SubLite) => {
    const paid = s.plan_id !== "free";
    if (s.status === "ACTIVE" && paid) return 5;
    if (s.status === "ACTIVE") return 4;
    if (s.status === "PENDING" && paid) return 3;
    if (s.status === "PENDING") return 2;
    return 1;
  };
  const sub = [...list].sort((a, b) => rank(b) - rank(a))[0];
  const names: Record<string, string> = { free: "Free", pro: "Pro", vip: "VIP", business: "Business" };
  const pn = names[sub.plan_id] || sub.plan_id;
  const paid = sub.plan_id !== "free";
  if (sub.status === "ACTIVE") return paid ? `Assinante · ${pn}` : "Free";
  if (sub.status === "PENDING") return paid ? `Pendente · ${pn}` : "Pendente (free)";
  return `${pn} · ${sub.status}`;
}

// ─── Devices Tab ───
const DevicesTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<
    {
      user_id: string;
      full_name: string;
      email: string;
      userType: string;
      plan: string;
      primary: string;
      breakdown: string;
      count: number;
    }[]
  >([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [profiles, subs, devices] = await Promise.all([
          paginateProfiles(),
          paginateSubscriptions(),
          paginateUserDevices(),
        ]);

        const subsByUser = new Map<string, SubLite[]>();
        for (const s of subs) {
          const arr = subsByUser.get(s.user_id) || [];
          arr.push(s);
          subsByUser.set(s.user_id, arr);
        }

        const devByUser = new Map<string, UserDeviceRow[]>();
        for (const d of devices) {
          const arr = devByUser.get(d.user_id) || [];
          arr.push(d);
          devByUser.set(d.user_id, arr);
        }

        const built = profiles.map((p) => {
          const devs = devByUser.get(p.user_id) || [];
          return {
            user_id: p.user_id,
            full_name: p.full_name || "—",
            email: p.email || "—",
            userType: userTypeBadge(p.user_type),
            plan: planBadgeForUser(subsByUser, p.user_id),
            primary: pickPrimaryDeviceLabel(devs),
            breakdown: formatSessionBreakdown(devs),
            count: devs.length,
          };
        });
        setRows(built);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.userType.toLowerCase().includes(q) ||
        r.plan.toLowerCase().includes(q),
    );
  }, [rows, query]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive py-6">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Dispositivos vêm de <code className="text-[10px]">user_devices</code> (app nativo com push). Utilizadores só web podem aparecer com 0
        aparelhos. É necessária a política admin em <code className="text-[10px]">user_devices</code> (migração recente).
      </p>
      <Input
        placeholder="Filtrar por nome, e-mail, tipo ou plano…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />
      <p className="text-[11px] text-muted-foreground">
        {filtered.length} utilizador{filtered.length !== 1 ? "es" : ""}
        {query.trim() ? ` (de ${rows.length})` : ""}
      </p>
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur border-b">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">Utilizador</th>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">E-mail</th>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">Tipo</th>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">Plano</th>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">Último uso (tipo)</th>
                <th className="text-left p-3 font-medium text-muted-foreground min-w-[200px]">Sessões / aparelhos</th>
                <th className="text-right p-3 font-medium text-muted-foreground whitespace-nowrap">#</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.user_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors align-top">
                  <td className="p-3 font-medium text-foreground text-xs md:text-sm max-w-[160px] truncate" title={r.full_name}>
                    {r.full_name}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate" title={r.email}>
                    {r.email}
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{r.userType}</span>
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">
                    <span
                      className={`rounded-md px-2 py-0.5 font-medium ${
                        r.plan.includes("Assinante") ? "bg-primary/15 text-primary" : "bg-muted text-foreground"
                      }`}
                    >
                      {r.plan}
                    </span>
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap font-medium">{r.primary}</td>
                  <td className="p-3 text-xs text-muted-foreground leading-snug">{r.breakdown}</td>
                  <td className="p-3 text-xs text-right tabular-nums">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">Nenhum resultado</p>}
      </div>
    </div>
  );
};

const AdminReports = () => {
  const [activeTab, setActiveTab] = useState("views");

  return (
    <AdminLayout title="Relatórios">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex flex-wrap w-full gap-1 h-auto min-h-10">
          <TabsTrigger value="views" className="shrink-0">
            <Eye className="w-3.5 h-3.5 mr-1" />
            Resumo mercado
          </TabsTrigger>
          <TabsTrigger value="clicks" className="shrink-0">
            <MousePointerClick className="w-3.5 h-3.5 mr-1" />
            Cliques
          </TabsTrigger>
          <TabsTrigger value="professionals" className="shrink-0">
            <Users className="w-3.5 h-3.5 mr-1" />
            Profissionais
          </TabsTrigger>
          <TabsTrigger value="devices" className="shrink-0">
            <Smartphone className="w-3.5 h-3.5 mr-1" />
            Dispositivos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="views">
          <ViewsTab />
        </TabsContent>
        <TabsContent value="clicks">
          <ClicksTab />
        </TabsContent>
        <TabsContent value="professionals">
          <ProfessionalsTab />
        </TabsContent>
        <TabsContent value="devices">
          <DevicesTab />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminReports;
