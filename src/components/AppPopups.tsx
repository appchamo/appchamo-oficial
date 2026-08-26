import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Popup {
  id: string;
  title: string | null;
  image_url: string | null;
  image_url_mobile: string | null;
  link_url: string | null;
}

// Mostra os popups (banners com position="popup", ativos) uma vez por abertura do app.
const SESSION_KEY = "chamo_popups_shown_v1";

const AppPopups = () => {
  const navigate = useNavigate();
  const [popups, setPopups] = useState<Popup[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("banners" as never)
          .select("id, title, image_url, image_url_mobile, link_url")
          .eq("position", "popup")
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .limit(3);
        const list = (((data as unknown) as Popup[]) || []).filter((p) => p.image_url || p.image_url_mobile);
        if (!cancelled && list.length) {
          setPopups(list);
          sessionStorage.setItem(SESSION_KEY, "1");
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (idx >= popups.length) return null;
  const p = popups[idx];
  const img = p.image_url_mobile || p.image_url;
  if (!img) return null;
  const link = p.link_url && p.link_url.trim() && p.link_url.trim() !== "#" ? p.link_url.trim() : null;
  const close = () => setIdx((i) => i + 1);
  const openLink = () => {
    if (!link) return;
    close();
    if (link.startsWith("/")) navigate(link);
    else window.open(link, "_blank");
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/70 px-6 py-8" onClick={close}>
      <div className="relative flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-lg active:scale-95"
        >
          <X className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <img
          src={img}
          alt={p.title || "Aviso"}
          onClick={link ? openLink : undefined}
          className={`max-h-[70vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl ${link ? "cursor-pointer" : ""}`}
        />
        {p.title ? <p className="mt-3 max-w-xs text-center text-sm text-white">{p.title}</p> : null}
        {link ? (
          <button
            type="button"
            onClick={openLink}
            className="mt-3 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-md active:scale-[0.98]"
          >
            Saiba mais
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default AppPopups;
