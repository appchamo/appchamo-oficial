import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Banner {
  id: string;
  title: string;
  image_url: string;
  image_url_mobile?: string; // ✅ Nova coluna
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
  const [isMobile, setIsMobile] = useState(false);

  // ✅ Detecta se o usuário está no celular (tela menor que 768px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
      {banners.map((b) => {
        // ✅ Escolha da imagem: Prioriza a mobile se estiver no celular
        const displayImage = (isMobile && b.image_url_mobile) 
          ? b.image_url_mobile 
          : b.image_url;

        return (
          <a
            key={b.id}
            href={b.link_url !== "#" ? b.link_url : undefined}
            target={b.link_url !== "#" ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="block rounded-2xl overflow-hidden shadow-sm border"
            style={{ 
              width: b.width, 
              // No mobile a altura fica automática para a imagem vertical não achatar
              height: isMobile ? "auto" : b.height 
            }}
          >
            <img
              src={displayImage}
              alt={b.title || "Banner"}
              className="w-full h-full object-cover"
            />
          </a>
        );
      })}
    </div>
  );
};

export default HomeBanners;