import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Briefcase, X } from "lucide-react";

interface Props {
  hasAppointment: boolean;
  appointmentDismissed: boolean;
  onDismissAppointment: () => void;
  appointmentLink: string;
  jobCount: number;
}

const HomeAlertCarousel = ({
  hasAppointment,
  appointmentDismissed,
  onDismissAppointment,
  appointmentLink,
  jobCount,
}: Props) => {
  const showAppointment = hasAppointment && !appointmentDismissed;
  const showJobs = jobCount > 0;

  const slideIds: string[] = [
    ...(showAppointment ? ["appointment"] : []),
    ...(showJobs ? ["jobs"] : []),
  ];

  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalSlides = slideIds.length;

  const scrollToSlide = useCallback((idx: number) => {
    const el = scrollRef.current;
    if (!el || totalSlides === 0) return;
    const clamped = Math.max(0, Math.min(idx, totalSlides - 1));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setActive(clamped);
  }, [totalSlides]);

  // Auto-advance
  useEffect(() => {
    if (totalSlides <= 1) return;
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % totalSlides;
        const el = scrollRef.current;
        if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
        return next;
      });
    }, 4000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [totalSlides]);

  // Sync active from user scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || totalSlides <= 1) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const idx = Math.round(el.scrollLeft / el.clientWidth);
        setActive(Math.max(0, Math.min(idx, totalSlides - 1)));
        raf = 0;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [totalSlides]);

  if (totalSlides === 0) return null;

  return (
    <div className="w-full">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto overflow-y-hidden scrollbar-hide snap-x snap-mandatory"
        style={{ scrollBehavior: "smooth" }}
      >
        {showAppointment && (
          <div className="flex-[0_0_100%] shrink-0 snap-start px-0.5">
            <div className="relative flex items-center gap-3 bg-primary/8 border border-primary/25 rounded-xl p-3.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDismissAppointment(); }}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-primary/15 text-muted-foreground transition-colors"
                aria-label="Fechar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <Link to={appointmentLink} className="flex items-center gap-3 flex-1 min-w-0 pr-5">
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Você tem agendamento</p>
                  <p className="text-xs text-muted-foreground">Confira data, horário e opções</p>
                </div>
                <span className="text-xs font-bold text-primary shrink-0">Ver →</span>
              </Link>
            </div>
          </div>
        )}
        {showJobs && (
          <div className="flex-[0_0_100%] shrink-0 snap-start px-0.5">
            <Link
              to="/jobs"
              className="flex items-center gap-3 bg-accent border border-primary/20 rounded-xl p-3.5 hover:border-primary/40 transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <Briefcase className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">🔥 {jobCount} vaga(s) disponíveis</p>
                <p className="text-xs text-muted-foreground">Confira as oportunidades na sua região</p>
              </div>
              <span className="text-xs font-bold text-primary shrink-0">Ver →</span>
            </Link>
          </div>
        )}
      </div>

      {totalSlides > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {slideIds.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToSlide(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === active ? "bg-primary" : "bg-muted-foreground/30"
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HomeAlertCarousel;
