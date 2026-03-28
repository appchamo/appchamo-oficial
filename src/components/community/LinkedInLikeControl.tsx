import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ThumbsUp, Heart, PartyPopper, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export type LinkedInReactionType = "like" | "love" | "congrats" | "genius";

const PICKER: { type: LinkedInReactionType; label: string; Icon: typeof ThumbsUp; bg: string }[] = [
  { type: "like", label: "Gostar", Icon: ThumbsUp, bg: "bg-sky-500" },
  { type: "love", label: "Amei", Icon: Heart, bg: "bg-red-500" },
  { type: "congrats", label: "Parabéns", Icon: PartyPopper, bg: "bg-amber-500" },
  { type: "genius", label: "Genial", Icon: Lightbulb, bg: "bg-violet-500" },
];

const HOLD_MS = 420;
/** Metade da largura aproximada da cápsula (4×44px + gaps + padding), para clamp horizontal */
const PICKER_HALF_W = 112;
const PICKER_H = 56;
const VIEW_MARGIN = 10;
/** Distância vertical máxima (px) para considerar o dedo “sobre” a barra de reações */
const PICK_VERTICAL_SLACK = 72;
const SCALE_BASE = 1;
const SCALE_HOVER = 1.82;

type PickerPos = { left: number; top: number; flipDown: boolean };

type Props = {
  activeType: LinkedInReactionType | undefined;
  onPickReaction: (type: LinkedInReactionType) => void | Promise<void>;
  /** Toque rápido: curtir (like) ou remover se já for like */
  onQuickLikeToggle: () => void | Promise<void>;
  className?: string;
  iconClassName?: string;
  label?: string;
  /** Na barra do post ocupa 1/3; no comentário fica compacto */
  fillRow?: boolean;
  /** Só ícone (círculo), sem texto — alinha com botão Responder nos comentários */
  compact?: boolean;
};

function pickNearestReactionIndex(
  clientX: number,
  clientY: number,
  buttons: (HTMLButtonElement | null)[],
): number | null {
  let bestIdx = -1;
  let bestScore = Infinity;
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    if (!btn) continue;
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = Math.abs(clientX - cx);
    const dy = Math.abs(clientY - cy);
    if (dy > PICK_VERTICAL_SLACK) continue;
    const score = dx + dy * 0.35;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 ? bestIdx : null;
}

export function LinkedInLikeControl({
  activeType,
  onPickReaction,
  onQuickLikeToggle,
  className,
  iconClassName,
  label = "Gostei",
  fillRow = true,
  compact = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Após abrir o picker, o pointerup não deve disparar o toque rápido (curtir) */
  const skipNextQuickToggleRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<PickerPos | null>(null);
  const reactionBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hoveredPickRef = useRef<number | null>(null);
  const [hoveredPickIndex, setHoveredPickIndex] = useState<number | null>(null);
  const [tooltipRect, setTooltipRect] = useState<{ left: number; top: number; label: string } | null>(null);

  const setHoveredPick = useCallback((idx: number | null) => {
    hoveredPickRef.current = idx;
    setHoveredPickIndex(idx);
    if (idx === null || idx < 0 || idx >= PICKER.length) {
      setTooltipRect(null);
      return;
    }
    const btn = reactionBtnRefs.current[idx];
    if (!btn) {
      setTooltipRect(null);
      return;
    }
    const r = btn.getBoundingClientRect();
    setTooltipRect({
      left: r.left + r.width / 2,
      top: r.top,
      label: PICKER[idx].label,
    });
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const openPicker = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const margin = VIEW_MARGIN;
    const minCx = margin + PICKER_HALF_W;
    const maxCx = vw - margin - PICKER_HALF_W;
    const cx = Math.max(minCx, Math.min(maxCx, r.left + r.width / 2));

    const spaceAbove = r.top;
    const flipDown = spaceAbove < margin + PICKER_H;
    const top = flipDown ? r.bottom + 10 : r.top - 10;

    setPickerPos({ left: cx, top, flipDown });
    skipNextQuickToggleRef.current = true;
    setPickerOpen(true);
  }, []);

  useLayoutEffect(() => {
    if (!pickerOpen || !pickerPos) return;
    const probeY = pickerPos.flipDown ? pickerPos.top + 36 : pickerPos.top - 36;
    const idx = pickNearestReactionIndex(pickerPos.left, probeY, reactionBtnRefs.current);
    setHoveredPick(idx ?? 0);
  }, [pickerOpen, pickerPos, setHoveredPick]);

  useEffect(() => {
    if (!pickerOpen) {
      setHoveredPick(null);
      setTooltipRect(null);
      return;
    }

    const onMove = (e: PointerEvent) => {
      const idx = pickNearestReactionIndex(e.clientX, e.clientY, reactionBtnRefs.current);
      if (idx !== hoveredPickRef.current) {
        setHoveredPick(idx);
      } else if (idx !== null) {
        const btn = reactionBtnRefs.current[idx];
        if (btn) {
          const r = btn.getBoundingClientRect();
          setTooltipRect({
            left: r.left + r.width / 2,
            top: r.top,
            label: PICKER[idx].label,
          });
        }
      }
    };

    const finish = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      let type: LinkedInReactionType | null = null;
      const refIdx = hoveredPickRef.current;
      if (refIdx !== null && refIdx >= 0 && refIdx < PICKER.length) {
        type = PICKER[refIdx].type;
      } else {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const node = el?.closest("[data-ln-reaction]");
        type = (node?.getAttribute("data-ln-reaction") as LinkedInReactionType | null) ?? null;
      }
      if (type) void onPickReaction(type);
      hoveredPickRef.current = null;
      setHoveredPickIndex(null);
      setTooltipRect(null);
      setPickerOpen(false);
      setPickerPos(null);
    };

    const blockTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevBodyTouchAction = body.style.touchAction;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";

    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", finish, { capture: true });
    window.addEventListener("pointercancel", finish, { capture: true });
    window.addEventListener("touchmove", blockTouchMove, { capture: true, passive: false });

    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", finish, { capture: true });
      window.removeEventListener("pointercancel", finish, { capture: true });
      window.removeEventListener("touchmove", blockTouchMove, { capture: true });
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.touchAction = prevBodyTouchAction;
    };
  }, [pickerOpen, onPickReaction, setHoveredPick]);

  const ActiveIcon = activeType
    ? PICKER.find((p) => p.type === activeType)?.Icon ?? ThumbsUp
    : ThumbsUp;

  const iconSizeMain = compact ? "w-[18px] h-[18px]" : fillRow ? "w-[22px] h-[22px]" : "w-[18px] h-[18px]";

  return (
    <>
      <div ref={wrapRef} className={cn("relative flex", fillRow ? "flex-1" : "flex-none", className)}>
        <button
          type="button"
          style={{
            WebkitUserSelect: "none",
            userSelect: "none",
            WebkitTouchCallout: "none",
            touchAction: "manipulation",
          }}
          className={cn(
            "select-none flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:bg-muted/60 active:bg-muted/80 transition-colors rounded-none border-0 bg-transparent",
            fillRow ? "flex-1 py-3" : compact ? "h-8 w-8 min-h-8 min-w-8 shrink-0 rounded-full p-0 hover:bg-muted/70" : "py-1 px-1 min-w-[52px]",
            activeType && "text-foreground",
          )}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={() => {
            skipNextQuickToggleRef.current = false;
            holdTimer.current = setTimeout(() => {
              holdTimer.current = null;
              openPicker();
            }, HOLD_MS);
          }}
          onPointerUp={() => {
            clearHold();
            if (skipNextQuickToggleRef.current) {
              skipNextQuickToggleRef.current = false;
              return;
            }
            void onQuickLikeToggle();
          }}
          onPointerLeave={() => {
            clearHold();
          }}
          onPointerCancel={() => {
            clearHold();
          }}
        >
          <ActiveIcon
            className={cn(
              iconSizeMain,
              "pointer-events-none shrink-0",
              compact && "stroke-[1.85]",
              activeType === "like" && "text-sky-600",
              activeType === "love" && "text-red-500 fill-red-500",
              activeType === "congrats" && "text-amber-500",
              activeType === "genius" && "text-violet-600 fill-amber-200",
              !activeType && iconClassName,
            )}
          />
          {!compact ? (
            <span
              className={cn(
                "select-none pointer-events-none font-semibold",
                fillRow ? "text-[11px]" : "text-[10px] max-w-[4.5rem] truncate",
              )}
            >
              {label}
            </span>
          ) : null}
        </button>
      </div>

      {pickerOpen &&
        pickerPos &&
        createPortal(
          <>
            <div
              aria-hidden
              className="fixed inset-0 z-[199] bg-transparent"
              style={{
                touchAction: "none",
                overscrollBehavior: "none",
              }}
            />
            {tooltipRect ? (
              <div
                className="fixed z-[201] pointer-events-none"
                style={{
                  left: tooltipRect.left,
                  top: tooltipRect.top - 8,
                  transform: "translate(-50%, -100%)",
                }}
              >
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-semibold text-white shadow-md">
                  {tooltipRect.label}
                </span>
              </div>
            ) : null}
            <div
              className="fixed z-[200] pointer-events-none"
              style={{
                top: pickerPos.top,
                left: pickerPos.left,
                transform: pickerPos.flipDown ? "translate(-50%, 0)" : "translate(-50%, -100%)",
              }}
            >
              <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-white px-2 py-1.5 shadow-xl shadow-black/15">
                {PICKER.map(({ type, label: lb, Icon, bg }, i) => {
                  const active = hoveredPickIndex === i;
                  return (
                    <button
                      key={type}
                      ref={(el) => {
                        reactionBtnRefs.current[i] = el;
                      }}
                      type="button"
                      data-ln-reaction={type}
                      title={lb}
                      style={{
                        WebkitUserSelect: "none",
                        userSelect: "none",
                        touchAction: "none",
                        transform: `scale(${active ? SCALE_HOVER : SCALE_BASE})`,
                        transformOrigin: pickerPos.flipDown ? "top center" : "bottom center",
                        transition: "transform 0.1s ease-out",
                        zIndex: active ? 2 : 1,
                      }}
                      className={cn(
                        "select-none flex h-11 w-11 items-center justify-center rounded-full text-white",
                        active && "drop-shadow-md",
                      )}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", bg)}>
                        <Icon className={cn("h-5 w-5 pointer-events-none", type === "love" && "fill-white")} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
