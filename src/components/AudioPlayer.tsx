import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause } from "lucide-react";

interface AudioPlayerProps {
  src: string;
  duration: number;
  isMine?: boolean;
}

const BAR_COUNT = 28;

const generateWaveform = (seed: string): number[] => {
  // Generate pseudo-random but deterministic waveform from URL
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    hash = ((hash << 5) - hash + i * 7) | 0;
    const val = Math.abs(hash % 100) / 100;
    // Create more natural wave pattern
    const wave = 0.2 + val * 0.8;
    bars.push(wave);
  }
  return bars;
};

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const AudioPlayer = ({ src, duration, isMine = false }: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform] = useState(() => generateWaveform(src));
  const animRef = useRef<number>();

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      const p = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      setProgress(p);
      setCurrentTime(audio.currentTime);
      animRef.current = requestAnimationFrame(tick);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    } else {
      audio.play();
      setPlaying(true);
      animRef.current = requestAnimationFrame(tick);
    }
  };

  const handleEnded = () => {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  };

  const handleBarClick = (index: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const newProgress = (index + 0.5) / BAR_COUNT;
    audio.currentTime = newProgress * audio.duration;
    setProgress(newProgress);
    setCurrentTime(audio.currentTime);
  };

  const playedBars = Math.floor(progress * BAR_COUNT);

  return (
    <div className="flex items-center gap-2.5 min-w-[200px] max-w-[260px]">
      <audio ref={audioRef} src={src} preload="metadata" onEnded={handleEnded} />

      {/* Play/Pause button */}
      <button
        onClick={toggle}
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
          isMine
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-primary/15 hover:bg-primary/25 text-primary"
        }`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      {/* Waveform + time */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-end gap-[2px] h-[28px] cursor-pointer" role="slider" aria-valuenow={progress * 100}>
          {waveform.map((h, i) => (
            <div
              key={i}
              onClick={() => handleBarClick(i)}
              className="flex-1 rounded-full transition-colors duration-150"
              style={{
                height: `${h * 100}%`,
                minHeight: 3,
                backgroundColor: i <= playedBars
                  ? isMine ? "rgba(255,255,255,0.9)" : "hsl(var(--primary))"
                  : isMine ? "rgba(255,255,255,0.3)" : "hsl(var(--primary) / 0.25)",
              }}
            />
          ))}
        </div>
        <span className={`text-[10px] leading-none ${isMine ? "text-white/60" : "text-muted-foreground"}`}>
          {playing ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>
    </div>
  );
};

export default AudioPlayer;
