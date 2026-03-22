import { useCallback, useEffect, useRef, useState } from "react";
import { X, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
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
const TICK_MS = 50;

const SponsorStoryViewer = ({ stories, initialIndex = 0, onClose }: Props) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewRegistered = useRef<Set<string>>(new Set());
  const isPausedRef = useRef(false);
  // Referência estável para currentIndex para usar dentro do setInterval
  const currentIndexRef = useRef(currentIndex);

  const current = stories[currentIndex];

  // Mantém currentIndexRef atualizado
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Sincroniza isPausedRef
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i < stories.length - 1) return i + 1;
      onClose();
      return i;
    });
    setProgress(0);
  }, [stories.length, onClose]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => {
      if (i > 0) return i - 1;
      return i;
    });
    setProgress(0);
  }, []);

  // Registra view quando muda de story
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

  // Timer de progresso
  useEffect(() => {
    setProgress(0);
    if (progressRef.current) clearInterval(progressRef.current);

    const step = 100 / (STORY_DURATION_MS / TICK_MS);
    progressRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      setProgress((p) => {
        if (p + step >= 100) {
          clearInterval(progressRef.current!);
          // Pequeno delay para a barra chegar a 100% visivelmente
          setTimeout(() => {
            setCurrentIndex((i) => {
              if (i < stories.length - 1) {
                setProgress(0);
                return i + 1;
              }
              onClose();
              return i;
            });
          }, 80);
          return 100;
        }
        return p + step;
      });
    }, TICK_MS);

    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [currentIndex, stories.length, onClose]);

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

  // Calcula quais barras de progresso mostrar (só as do patrocinador atual)
  const currentSponsorId = current?.sponsor_id;
  const sponsorStoriesStart = stories.findIndex((s) => s.sponsor_id === currentSponsorId);
  const sponsorStories = stories.filter((s) => s.sponsor_id === currentSponsorId);
  const localIndex = currentIndex - sponsorStoriesStart;

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col select-none"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* Barras de progresso (apenas do patrocinador atual) */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}
      >
        {sponsorStories.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{
                width:
                  i < localIndex ? "100%" :
                  i === localIndex ? `${progress}%` :
                  "0%",
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
            <img
              src={current.sponsor_logo}
              alt={current.sponsor_name}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <span className="text-white text-xs font-bold">
              {current.sponsor_name.slice(0, 2).toUpperCase()}
            </span>
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

      {/* Imagem — pressionar e segurar pausa; soltar retoma */}
      <div
        className="flex-1 relative overflow-hidden"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
        onTouchCancel={() => setIsPaused(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={current.photo_url}
          alt="Novidade"
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
        />

        {/* Indicador de pausa */}
        {isPaused && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/40 rounded-full p-3 backdrop-blur-sm">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-6 bg-white rounded-full" />
                <div className="w-1.5 h-6 bg-white rounded-full" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botões de navegação laterais */}
      {currentIndex > 0 && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm active:scale-90 transition-transform"
          style={{ marginTop: 30 }}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      <button
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); goNext(); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm active:scale-90 transition-transform"
        style={{ marginTop: 30 }}
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Legenda + botão Saiba mais */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 px-4"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 24px)" }}
      >
        {current.caption && (
          <p className="text-white text-sm mb-4 text-center drop-shadow">
            {current.caption}
          </p>
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
