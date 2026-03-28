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
  const pickerVisibleRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

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
    setPickerPos({
      top: r.top + window.scrollY - 8,
      left: r.left + r.width / 2 + window.scrollX,
    });
    pickerVisibleRef.current = true;
    setPickerOpen(true);
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const finish = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const node = el?.closest("[data-ln-reaction]");
      const type = node?.getAttribute("data-ln-reaction") as LinkedInReactionType | null;
      if (type) void onPickReaction(type);
      pickerVisibleRef.current = false;
      setPickerOpen(false);
      setPickerPos(null);
    };
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    return () => {
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
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
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:bg-muted/60 active:bg-muted/80 transition-colors rounded-none border-0 bg-transparent",
            fillRow ? "flex-1 py-3" : "py-1 px-1 min-w-[52px]",
            activeType && "text-foreground",
          )}
          onPointerDown={() => {
            holdTimer.current = setTimeout(() => {
              holdTimer.current = null;
              openPicker();
            }, HOLD_MS);
          }}
          onPointerUp={() => {
            clearHold();
            if (pickerVisibleRef.current) return;
            void onQuickLikeToggle();
          }}
          onPointerLeave={() => clearHold()}
          onPointerCancel={() => clearHold()}
        >
          <ActiveIcon
            className={cn(
              fillRow ? "w-[22px] h-[22px]" : "w-[18px] h-[18px]",
              activeType === "like" && "text-sky-600",
              activeType === "love" && "text-red-500 fill-red-500",
              activeType === "congrats" && "text-amber-500",
              activeType === "genius" && "text-violet-600 fill-amber-200",
              !activeType && iconClassName,
            )}
          />
          <span className={cn("font-semibold", fillRow ? "text-[11px]" : "text-[10px] max-w-[4.5rem] truncate")}>
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
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-white px-2 py-1.5 shadow-xl shadow-black/15">
              {PICKER.map(({ type, label: lb, Icon, bg }) => (
                <button
                  key={type}
                  type="button"
                  data-ln-reaction={type}
                  title={lb}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform hover:scale-110 active:scale-95"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
                >
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", bg)}>
                    <Icon className={cn("h-5 w-5", type === "love" && "fill-white")} />
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
