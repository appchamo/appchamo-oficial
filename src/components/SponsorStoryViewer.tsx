import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, ChevronLeft, ChevronRight, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SponsorStory {
  id: string;
  sponsor_id: string;
  sponsor_name: string;
  sponsor_logo: string | null;
  photo_url: string;
  caption: string | null;
  link_url: string | null;
  link_button_label?: string | null;
  sponsor_link: string;
}

/** Só safe area — o viewer cobre a tab bar (portal no body) */
const CTA_BOTTOM_PAD = "calc(max(env(safe-area-inset-bottom), 14px) + 10px)";

const VIEWER_Z = 215;

interface Props {
  stories: SponsorStory[];
  initialIndex?: number;
  onClose: () => void;
  /** Quando o utilizador autenticado é dono deste patrocinador, mostra menu e edição */
  ownerSponsorId?: string | null;
  onStoryUpdated?: (story: SponsorStory) => void;
  onStoryDeleted?: (storyId: string) => void;
}

const STORY_DURATION_MS = 6000;
const TICK_MS = 50;

function normalizeHref(raw: string): string {
  const t = raw.trim();
  if (!t || t === "#") return "";
  return t.includes("://") ? t : `https://${t}`;
}

function getEffectiveHref(story: SponsorStory): string {
  const fromStory = normalizeHref(story.link_url || "");
  if (fromStory) return fromStory;
  return normalizeHref(story.sponsor_link || "");
}

const SponsorStoryViewer = ({
  stories,
  initialIndex = 0,
  onClose,
  ownerSponsorId = null,
  onStoryUpdated,
  onStoryDeleted,
}: Props) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editLink, setEditLink] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewRegistered = useRef<Set<string>>(new Set());
  const isPausedRef = useRef(false);
  const currentIndexRef = useRef(currentIndex);

  const current = stories[currentIndex];
  const [imgLoaded, setImgLoaded] = useState(false);

  const isOwner = !!(ownerSponsorId && current && current.sponsor_id === ownerSponsorId);
  const effectiveHref = current ? getEffectiveHref(current) : "";
  const hasValidLink = !!effectiveHref;
  const buttonTitle = ((current?.link_button_label || "").trim() || "Saiba mais").trim();

  const blockAutoAdvance = menuOpen || editOpen || deleteOpen;

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    setImgLoaded(false);
  }, [currentIndex]);

  useEffect(() => {
    isPausedRef.current = isPaused || blockAutoAdvance;
  }, [isPaused, blockAutoAdvance]);

  useEffect(() => {
    setCurrentIndex((i) => {
      if (stories.length === 0) return 0;
      return Math.min(i, stories.length - 1);
    });
  }, [stories.length]);

  useEffect(() => {
    if (current && editOpen) {
      setEditLabel((current.link_button_label || "").trim() || "Saiba mais");
      setEditLink((current.link_url || "").trim());
    }
  }, [current?.id, editOpen, current?.link_url, current?.link_button_label]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Pré-carrega as próximas 2 imagens
  useEffect(() => {
    const urls = [stories[currentIndex + 1]?.photo_url, stories[currentIndex + 2]?.photo_url].filter(Boolean) as string[];
    urls.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, [currentIndex, stories]);

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

  useEffect(() => {
    setProgress(0);
    if (progressRef.current) clearInterval(progressRef.current);

    const step = 100 / (STORY_DURATION_MS / TICK_MS);
    progressRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      setProgress((p) => {
        if (p + step >= 100) {
          clearInterval(progressRef.current!);
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

    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [currentIndex, stories.length, onClose]);

  const handleLinkClick = () => {
    if (!current) return;
    if (isOwner && !hasValidLink) {
      setEditOpen(true);
      return;
    }
    const raw = (current.link_url || "").trim();
    const fallback = raw || (current.sponsor_link || "").trim();
    if (!fallback || fallback === "#") return;
    const url = normalizeHref(fallback);
    if (!url) return;
    if (!isOwner) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        supabase.from("story_clicks").insert({
          story_id: current.id,
          clicker_id: session?.user?.id ?? null,
        }).then(() => {});
      });
    }
    window.open(url, "_blank");
  };

  const openEditFromMenu = () => {
    setMenuOpen(false);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!current) return;
    const labelTrim = editLabel.trim();
    const link_button_label = !labelTrim || labelTrim === "Saiba mais" ? null : labelTrim;
    const linkTrim = editLink.trim();
    let normalizedLink: string | null = null;
    if (linkTrim) {
      const candidate = linkTrim.includes("://") ? linkTrim : `https://${linkTrim}`;
      try {
        normalizedLink = new URL(candidate).toString();
      } catch {
        toast({ title: "Link inválido", variant: "destructive" });
        return;
      }
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("sponsor_stories")
        .update({
          link_url: normalizedLink,
          link_button_label,
        })
        .eq("id", current.id);
      if (error) throw error;
      const updated: SponsorStory = {
        ...current,
        link_url: normalizedLink,
        link_button_label,
      };
      onStoryUpdated?.(updated);
      toast({ title: "Salvo!" });
      setEditOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao guardar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!current) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("sponsor_stories").delete().eq("id", current.id);
      if (error) throw error;
      const id = current.id;
      onStoryDeleted?.(id);
      toast({
        title: "Novidade removida",
        description: "O limite semanal já tinha sido contado; excluir não devolve o slot.",
      });
      setDeleteOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao excluir";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const currentSponsorId = current?.sponsor_id;
  const sponsorStoriesStart = stories.findIndex((s) => s.sponsor_id === currentSponsorId);
  const sponsorStories = stories.filter((s) => s.sponsor_id === currentSponsorId);
  const localIndex = currentIndex - sponsorStoriesStart;

  const showCta = isOwner || hasValidLink;

  if (!current) return null;

  const shell = (
    <div
      className="fixed inset-0 flex flex-col select-none bg-black"
      style={{
        zIndex: VIEWER_Z,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Topo: safe area + barras + menu (sempre acima da imagem) */}
      <div className="shrink-0 z-40 px-3 pt-[max(8px,env(safe-area-inset-top))] pb-2 bg-gradient-to-b from-black/90 via-black/50 to-transparent pointer-events-auto">
        <div className="flex gap-1.5 mb-2">
          {sponsorStories.map((_, i) => (
            <div key={i} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{
                  width: i < localIndex ? "100%" : i === localIndex ? `${progress}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 min-h-11">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-white/20 flex items-center justify-center shrink-0 ring-1 ring-white/25">
            {current.sponsor_logo ? (
              <img
                src={current.sponsor_logo}
                alt={current.sponsor_name}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <span className="text-white text-xs font-bold">{current.sponsor_name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight drop-shadow-md">{current.sponsor_name}</p>
            <p className="text-white/75 text-[11px] drop-shadow-md">Patrocinado</p>
          </div>
          {isOwner && (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-black/55 text-white shrink-0 ring-1 ring-white/25"
                  aria-label="Opções da novidade"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 z-[320]">
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openEditFromMenu(); }}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar link e texto do botão
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir novidade
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-3 flex items-center justify-center gap-1.5 rounded-full bg-white text-gray-900 shrink-0 font-bold text-xs shadow-lg ring-1 ring-black/10"
            aria-label="Fechar novidade"
          >
            <X className="w-5 h-5 shrink-0" />
            <span>Fechar</span>
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 relative z-10"
        onMouseDown={() => !blockAutoAdvance && setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => !blockAutoAdvance && setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
        onTouchCancel={() => setIsPaused(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        <img
          key={current.photo_url}
          src={current.photo_url}
          alt="Novidade"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
          onLoad={() => setImgLoaded(true)}
          style={{
            opacity: imgLoaded ? 1 : 0,
            transition: "opacity 0.2s ease",
            willChange: "opacity",
          }}
        />

        {isPaused && !blockAutoAdvance && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/40 rounded-full p-3 backdrop-blur-sm">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-6 bg-white rounded-full" />
                <div className="w-1.5 h-6 bg-white rounded-full" />
              </div>
            </div>
          </div>
        )}

        {currentIndex > 0 && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-90 transition-transform"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <button
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-90 transition-transform"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        <div
          className="absolute bottom-0 left-0 right-0 z-20 px-4 flex flex-col items-stretch bg-gradient-to-t from-black/85 via-black/35 to-transparent pt-10"
          style={{ paddingBottom: CTA_BOTTOM_PAD }}
        >
          {current.caption && (
            <p className="text-white text-sm mb-3 text-center drop-shadow-md px-1">{current.caption}</p>
          )}
          {showCta && (
            <div className="relative w-full">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLinkClick();
                }}
                className="w-full flex flex-col items-center rounded-2xl bg-white text-gray-900 shadow-lg active:scale-[0.99] transition-transform pt-2.5 pb-3 px-4 pr-12 relative"
              >
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{buttonTitle}</span>
                <span className="text-sm font-bold flex items-center gap-2 mt-1">
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  {hasValidLink ? "Abrir link" : isOwner ? "Definir link" : "Saiba mais"}
                </span>
              </button>
              {isOwner && (
                <button
                  type="button"
                  className="absolute top-1/2 -translate-y-1/2 right-2 w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-md active:scale-95 z-10"
                  aria-label="Editar texto e link do botão"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <div
          className="absolute inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="story-edit-title"
          onClick={() => setEditOpen(false)}
        >
          <div
            className="w-full max-w-sm mx-auto sm:rounded-2xl rounded-t-2xl bg-background border border-border shadow-2xl flex flex-col max-h-[min(92dvh,100svh)] min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 p-4 pb-2 border-b border-border/60">
              <h2 id="story-edit-title" className="text-lg font-semibold">
                Texto e link do botão
              </h2>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Título do botão</label>
                <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Saiba mais" className="mt-1 rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">URL</label>
                <Input
                  value={editLink}
                  onChange={(e) => setEditLink(e.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="mt-1 rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Vazio usa o link padrão do patrocinador na app.</p>
              </div>
            </div>
            <div className="shrink-0 flex gap-2 p-4 pt-2 border-t border-border/60 bg-background pb-[max(16px,env(safe-area-inset-bottom))]">
              <Button type="button" variant="outline" className="flex-1 rounded-xl h-11" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" className="flex-1 rounded-xl h-11 font-bold" disabled={savingEdit} onClick={() => void saveEdit()}>
                {savingEdit ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          onClick={() => !deleting && setDeleteOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-background border border-border p-5 shadow-2xl max-h-[85dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Excluir novidade?</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Esta ação remove a novidade de imediato. O teu limite semanal já foi contado — excluir não devolve uma
              publicação.
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <Button type="button" variant="outline" className="rounded-xl w-full h-11" disabled={deleting} onClick={() => setDeleteOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" className="rounded-xl w-full h-11" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? "Excluindo…" : "Excluir"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
};

export default SponsorStoryViewer;
