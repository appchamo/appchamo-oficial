import AdminLayout from "@/components/AdminLayout";
import { BarChart3, Eye, MousePointerClick, Users, Trophy, ArrowDown, ArrowUp } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
        const catMap = new Map(cats.map(c => [c.id, c.name]));
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
      <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground text-sm">Visualizações por Categoria</h3><SortBtn /></div>
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

      <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground text-sm">Visualizações por Profissional</h3><SortBtn /></div>
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
      setData(pros.map(p => ({
        name: nameMap.get(p.user_id) || "—",
        services: p.total_services,
        rating: Number(p.rating),
        reviews: p.total_reviews,
      })));
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

const AdminReports = () => {
  const [activeTab, setActiveTab] = useState("views");

  return (
    <AdminLayout title="Relatórios">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="views"><Eye className="w-3.5 h-3.5 mr-1" />Visualizações</TabsTrigger>
          <TabsTrigger value="clicks"><MousePointerClick className="w-3.5 h-3.5 mr-1" />Cliques</TabsTrigger>
          <TabsTrigger value="professionals"><Users className="w-3.5 h-3.5 mr-1" />Profissionais</TabsTrigger>
        </TabsList>

        <TabsContent value="views"><ViewsTab /></TabsContent>
        <TabsContent value="clicks"><ClicksTab /></TabsContent>
        <TabsContent value="professionals"><ProfessionalsTab /></TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminReports;
