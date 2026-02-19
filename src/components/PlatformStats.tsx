import {
  Users, CheckCircle2, Trophy, Briefcase,
  Hammer, Home, Scissors, HeartPulse, Car, Monitor,
  Camera, BriefcaseBusiness, Tractor, Truck, PawPrint,
  Wrench, Paintbrush, Zap, Droplets, ShieldCheck, BookOpen,
  Dumbbell, UtensilsCrossed, Baby, Laptop, Sparkles, Music,
  Leaf, Building2, Cog, Palette, Star, Heart, Award, Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const iconMap: Record<string, LucideIcon> = {
  Users, CheckCircle2, Trophy, Briefcase,
  Hammer, Home, Scissors, HeartPulse, Car, Monitor,
  Camera, BriefcaseBusiness, Tractor, Truck, PawPrint,
  Wrench, Paintbrush, Zap, Droplets, ShieldCheck, BookOpen,
  Dumbbell, UtensilsCrossed, Baby, Laptop, Sparkles, Music,
  Leaf, Building2, Cog, Palette, Star, Heart, Award, Target,
};

export { iconMap };

interface StatRow {
  id: string;
  icon_name: string;
  label: string;
  value_mode: string;
  manual_value: number;
  sort_order: number;
}

const PlatformStats = () => {
  const [stats, setStats] = useState<(StatRow & { computed: number })[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: rows } = await supabase
        .from("platform_stats")
        .select("*")
        .eq("active", true)
        .order("sort_order");

      if (!rows || rows.length === 0) return;

      // Fetch auto values in parallel
      const [{ count: prosCount }, { data: prosData }, { count: couponsCount }] = await Promise.all([
        supabase.from("professionals").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("professionals").select("total_services").eq("active", true),
        supabase.from("coupons").select("*", { count: "exact", head: true }),
      ]);

      const servicesTotal = prosData?.reduce((a, p) => a + (p.total_services || 0), 0) || 0;

      const autoValues: Record<string, number> = {
        auto_professionals: prosCount || 0,
        auto_services: servicesTotal,
        auto_coupons: couponsCount || 0,
      };

      setStats(
        (rows as StatRow[]).map((r) => ({
          ...r,
          computed: r.value_mode === "manual" ? r.manual_value : (autoValues[r.value_mode] ?? 0),
        }))
      );
    };
    load();
  }, []);

  if (stats.length === 0) return null;

  return (
    <section className="grid grid-cols-3 gap-3">
      {stats.map((s) => {
        const Icon = iconMap[s.icon_name] || Briefcase;
        return (
          <div key={s.id} className="bg-card border rounded-xl p-3 text-center">
            <Icon className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-foreground">{s.computed}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        );
      })}
    </section>
  );
};

export default PlatformStats;
