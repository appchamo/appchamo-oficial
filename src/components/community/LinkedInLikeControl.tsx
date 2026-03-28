import { useCallback, useEffect, useRef, useState } from "react";
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
};

export function LinkedInLikeControl({
  activeType,
  onPickReaction,
  onQuickLikeToggle,
  className,
  iconClassName,
  label = "Gostei",
  fillRow = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Após abrir o picker, o pointerup não deve disparar o toque rápido (curtir) */
  const skipNextQuickToggleRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<PickerPos | null>(null);

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

  useEffect(() => {
    if (!pickerOpen) return;
    const finish = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const node = el?.closest("[data-ln-reaction]");
      const type = node?.getAttribute("data-ln-reaction") as LinkedInReactionType | null;
      if (type) void onPickReaction(type);
      setPickerOpen(false);
      setPickerPos(null);
    };
    window.addEventListener("pointerup", finish, { capture: true });
    window.addEventListener("pointercancel", finish, { capture: true });
    return () => {
      window.removeEventListener("pointerup", finish, { capture: true });
      window.removeEventListener("pointercancel", finish, { capture: true });
    };
  }, [pickerOpen, onPickReaction]);

  const ActiveIcon = activeType
    ? PICKER.find((p) => p.type === activeType)?.Icon ?? ThumbsUp
    : ThumbsUp;

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
            fillRow ? "flex-1 py-3" : "py-1 px-1 min-w-[52px]",
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
              fillRow ? "w-[22px] h-[22px]" : "w-[18px] h-[18px]",
              "pointer-events-none shrink-0",
              activeType === "like" && "text-sky-600",
              activeType === "love" && "text-red-500 fill-red-500",
              activeType === "congrats" && "text-amber-500",
              activeType === "genius" && "text-violet-600 fill-amber-200",
              !activeType && iconClassName,
            )}
          />
          <span
            className={cn(
              "select-none pointer-events-none font-semibold",
              fillRow ? "text-[11px]" : "text-[10px] max-w-[4.5rem] truncate",
            )}
          >
            {label}
          </span>
        </button>
      </div>

      {pickerOpen &&
        pickerPos &&
        createPortal(
          <div
            className="fixed z-[200] pointer-events-none"
            style={{
              top: pickerPos.top,
              left: pickerPos.left,
              transform: pickerPos.flipDown ? "translate(-50%, 0)" : "translate(-50%, -100%)",
            }}
          >
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-white px-2 py-1.5 shadow-xl shadow-black/15">
              {PICKER.map(({ type, label: lb, Icon, bg }) => (
                <button
                  key={type}
                  type="button"
                  data-ln-reaction={type}
                  title={lb}
                  style={{ WebkitUserSelect: "none", userSelect: "none", touchAction: "manipulation" }}
                  className="select-none flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform hover:scale-110 active:scale-95"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", bg)}>
                    <Icon className={cn("h-5 w-5 pointer-events-none", type === "love" && "fill-white")} />
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
