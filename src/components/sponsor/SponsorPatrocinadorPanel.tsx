import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart2, Loader2 } from "lucide-react";

interface SponsorPatrocinadorPanelProps {
  sponsorId: string;
}

/**
 * Bloco "RELATÓRIOS" para conta ligada a patrocinador (visualizações nas novidades,
 * cliques no carrossel vs novidade, alcance único estimado).
 */
const SponsorPatrocinadorPanel = ({ sponsorId }: SponsorPatrocinadorPanelProps) => {
  const [loading, setLoading] = useState(true);
  const [viewsSum, setViewsSum] = useState(0);
  const [clicksCarousel, setClicksCarousel] = useState(0);
  const [clicksStory, setClicksStory] = useState(0);
  const [reach, setReach] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: stories, error: se } = await supabase
        .from("sponsor_stories")
        .select("id, views_count")
        .eq("sponsor_id", sponsorId);
      if (se) throw se;
      const list = stories || [];
      const storyIds = list.map((s: { id: string }) => s.id);
      const vSum = list.reduce((acc: number, s: { views_count?: number }) => acc + (s.views_count || 0), 0);
      setViewsSum(vSum);

      const { count: carCount, error: ce } = await supabase
        .from("sponsor_clicks")
        .select("*", { count: "exact", head: true })
        .eq("sponsor_id", sponsorId);
      if (ce) throw ce;
      setClicksCarousel(carCount ?? 0);

      let stClicks = 0;
      if (storyIds.length) {
        const { count: stc, error: ste } = await supabase
          .from("story_clicks")
          .select("*", { count: "exact", head: true })
          .in("story_id", storyIds);
        if (ste) throw ste;
        stClicks = stc ?? 0;
      }
      setClicksStory(stClicks);

      const unique = new Set<string>();
      if (storyIds.length) {
        const { data: svRows } = await supabase.from("story_views").select("viewer_id").in("story_id", storyIds);
        (svRows || []).forEach((r: { viewer_id?: string | null }) => {
          if (r.viewer_id) unique.add(r.viewer_id);
        });
        const { data: stClickRows } = await supabase.from("story_clicks").select("clicker_id").in("story_id", storyIds);
        (stClickRows || []).forEach((r: { clicker_id?: string | null }) => {
          if (r.clicker_id) unique.add(r.clicker_id);
        });
      }
      const { data: spClickRows } = await supabase
        .from("sponsor_clicks")
        .select("user_id")
        .eq("sponsor_id", sponsorId);
      (spClickRows || []).forEach((r: { user_id?: string | null }) => {
        if (r.user_id) unique.add(r.user_id);
      });
      setReach(unique.size);
    } catch {
      setViewsSum(0);
      setClicksCarousel(0);
      setClicksStory(0);
      setReach(0);
    } finally {
      setLoading(false);
    }
  }, [sponsorId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold tracking-tight">RELATÓRIOS</h3>
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="space-y-3 text-sm">
          <li className="flex justify-between gap-3 border-b border-border/40 pb-2">
            <span className="text-muted-foreground">Visualizações (novidades)</span>
            <span className="font-semibold tabular-nums">{viewsSum.toLocaleString("pt-BR")}</span>
          </li>
          <li className="flex justify-between gap-3 border-b border-border/40 pb-2">
            <span className="text-muted-foreground">Cliques (carrossel, sem abrir novidade)</span>
            <span className="font-semibold tabular-nums">{clicksCarousel.toLocaleString("pt-BR")}</span>
          </li>
          <li className="flex justify-between gap-3 border-b border-border/40 pb-2">
            <span className="text-muted-foreground">Cliques (pela novidade)</span>
            <span className="font-semibold tabular-nums">{clicksStory.toLocaleString("pt-BR")}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span className="text-muted-foreground">Pessoas únicas alcançadas</span>
            <span className="font-semibold tabular-nums">{reach.toLocaleString("pt-BR")}</span>
          </li>
        </ul>
      )}
    </div>
  );
};

export default SponsorPatrocinadorPanel;
