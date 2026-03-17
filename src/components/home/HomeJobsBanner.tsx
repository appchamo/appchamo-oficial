import { Link } from "react-router-dom";

/** Maleta/briefcase 100% preenchida (sem contorno vazado) */
const BriefcaseFilled = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M20 6h-4V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM10 4h4v2h-4V4zm10 15H4V8h16v11z" />
  </svg>
);

interface HomeJobsBannerProps {
  jobCount: number;
  section?: { title?: string; subtitle?: string };
}

const HomeJobsBanner = ({ jobCount, section }: HomeJobsBannerProps) => {
  if (jobCount <= 0) return null;

  const title = (section?.title || "{count} vaga(s) de emprego disponíveis")
    .replace("{count}", String(jobCount));
  const subtitle = section?.subtitle || "Confira as oportunidades na sua região";

  return (
    <Link to="/jobs" className="flex items-center gap-3 bg-accent border border-primary/20 rounded-xl p-3.5 hover:border-primary/40 transition-all">
      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
        <BriefcaseFilled className="w-5 h-5 text-primary-foreground" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <span className="text-xs font-semibold text-primary">Ver →</span>
    </Link>
  );
};

export default HomeJobsBanner;
