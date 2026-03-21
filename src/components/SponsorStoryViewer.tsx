import { useEffect, useRef, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface SponsorStory {
  id: string;
  sponsor_id: string;
  sponsor_name: string;
  sponsor_logo: string | null;
  photo_url: string;
  caption: string | null;
  link_url: string | null;
  sponsor_link: string;
}

interface Props {
  stories: SponsorStory[];
  initialIndex?: number;
  onClose: () => void;
}

const STORY_DURATION_MS = 6000;

const SponsorStoryViewer = ({ stories, initialIndex = 0, onClose }: Props) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewRegistered = useRef<Set<string>>(new Set());

  const current = stories[currentIndex];

  const goNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((i) => i + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setProgress(0);
    }
  };

  useEffect(() => {
    if (!current?.id || viewRegistered.current.has(current.id)) return;
    viewRegistered.current.add(current.id);
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabase.from("story_views").insert({
        story_id: current.id,
        viewer_id: session?.user?.id ?? null,
      }).then(() => {});
    });
  }, [current?.id]);

  useEffect(() => {
    setProgress(0);
    if (progressRef.current) clearInterval(progressRef.current);
    const step = 100 / (STORY_DURATION_MS / 50);
    progressRef.current = setInterval(() => {
      setProgress((p) => {
        if (p + step >= 100) {
          clearInterval(progressRef.current!);
          setTimeout(goNext, 100);
          return 100;
        }
        return p + step;
      });
    }, 50);
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [currentIndex]);

  const handleLinkClick = () => {
    const url = current.link_url || current.sponsor_link;
    if (!url) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabase.from("story_clicks").insert({
        story_id: current.id,
        clicker_id: session?.user?.id ?? null,
      }).then(() => {});
    });
    window.open(url, "_blank");
  };

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      style={{ touchAction: "none" }}
    >
      {/* Barras de progresso */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-3" style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{
                width: i < currentIndex ? "100%" : i === currentIndex ? `${progress}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div
        className="absolute left-0 right-0 z-20 flex items-center gap-2 px-4"
        style={{ top: "max(env(safe-area-inset-top), 16px)", paddingTop: 20 }}
      >
        <div className="w-9 h-9 rounded-full overflow-hidden bg-white/20 flex items-center justify-center shrink-0">
          {current.sponsor_logo ? (
            <img src={current.sponsor_logo} alt={current.sponsor_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-xs font-bold">{current.sponsor_name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold leading-tight">{current.sponsor_name}</p>
          <p className="text-white/60 text-[11px]">Patrocinado</p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/30 text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Imagem */}
      <div className="flex-1 relative">
        <img
          src={current.photo_url}
          alt="Novidade"
          className="w-full h-full object-contain"
          draggable={false}
        />
        <div className="absolute inset-0 flex">
          <div className="flex-1" onClick={goPrev} />
          <div className="flex-1" onClick={goNext} />
        </div>
      </div>

      {/* Legenda + botão */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 px-4"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 24px)" }}
      >
        {current.caption && (
          <p className="text-white text-sm mb-4 text-center drop-shadow">{current.caption}</p>
        )}
        {(current.link_url || current.sponsor_link) && (
          <button
            onClick={handleLinkClick}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white text-gray-900 font-semibold text-sm shadow-lg active:scale-[0.98] transition-transform"
          >
            <ExternalLink className="w-4 h-4" />
            Saiba mais
          </button>
        )}
      </div>
    </div>
  );
};

export default SponsorStoryViewer;
