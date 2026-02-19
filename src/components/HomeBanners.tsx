import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  position: string;
  sort_order: number;
  width: string;
  height: string;
}

interface Props {
  position: string;
}

const HomeBanners = ({ position }: Props) => {
  const [banners, setBanners] = useState<Banner[]>([]);

  useEffect(() => {
    supabase
      .from("banners" as any)
      .select("*")
      .eq("active", true)
      .eq("position", position)
      .order("sort_order")
      .then(({ data }) => setBanners((data as any[]) || []));
  }, [position]);

  if (banners.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {banners.map((b) => (
        <a
          key={b.id}
          href={b.link_url !== "#" ? b.link_url : undefined}
          target={b.link_url !== "#" ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="block rounded-2xl overflow-hidden shadow-sm border"
          style={{ width: b.width, height: b.height }}
        >
          <img
            src={b.image_url}
            alt={b.title || "Banner"}
            className="w-full h-full object-cover"
          />
        </a>
      ))}
    </div>
  );
};

export default HomeBanners;
