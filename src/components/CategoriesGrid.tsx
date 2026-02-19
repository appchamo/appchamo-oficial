import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Hammer, Home, Scissors, HeartPulse, Car, Monitor,
  Camera, BriefcaseBusiness, Tractor, Truck, PawPrint, Briefcase,
  Wrench, Paintbrush, Zap, Droplets, ShieldCheck, BookOpen,
  Dumbbell, UtensilsCrossed, Baby, Laptop, Sparkles, Music,
  Leaf, Building2, Cog, Palette,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Hammer, Home, Scissors, HeartPulse, Car, Monitor,
  Camera, BriefcaseBusiness, Tractor, Truck, PawPrint, Briefcase,
  Wrench, Paintbrush, Zap, Droplets, ShieldCheck, BookOpen,
  Dumbbell, UtensilsCrossed, Baby, Laptop, Sparkles, Music,
  Leaf, Building2, Cog, Palette,
};


interface Category {
  id: string;
  name: string;
  slug: string;
  icon_name: string;
  icon_url: string | null;
}

const CategoriesGrid = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState(false);
  const cols = typeof window !== "undefined" && window.innerWidth >= 640 ? 5 : 4;
  const visibleCount = cols * 2;

  useEffect(() => {
    supabase.from("categories").select("id, name, slug, icon_name, icon_url").eq("active", true).order("sort_order").then(({ data }) => {
      if (data) setCategories(data);
    });
  }, []);

  if (categories.length === 0) return null;

  const shown = expanded ? categories : categories.slice(0, visibleCount);

  return (
    <section>
      <h3 className="font-semibold text-foreground mb-3 px-1">Categorias</h3>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
      {shown.map((cat, i) => {
          const Icon = iconMap[cat.icon_name] || Briefcase;
          return (
            <Link
              key={cat.id}
              to={`/category/${cat.slug}`}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                {cat.icon_url ? (
                  <img src={cat.icon_url} alt={cat.name} className="w-7 h-7 object-contain" />
                ) : (
                  <Icon className="w-6 h-6 text-primary" />
                )}
              </div>
              <span className="text-[11px] font-medium text-foreground text-center leading-tight">
                {cat.name}
              </span>
            </Link>
          );
        })}
      </div>
      {categories.length > visibleCount && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 py-2.5 rounded-xl border text-sm font-medium text-primary hover:bg-accent transition-colors"
        >
          {expanded ? "Ver menos" : `Ver mais (${categories.length - visibleCount})`}
        </button>
      )}
    </section>
  );
};

export default CategoriesGrid;
