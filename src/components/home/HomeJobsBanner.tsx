import { Link } from "react-router-dom";
import { Briefcase } from "lucide-react";

interface HomeJobsBannerProps {
  jobCount: number;
  section?: { title?: string; subtitle?: string };
}

const HomeJobsBanner = ({ jobCount, section }: HomeJobsBannerProps) => {
  if (jobCount <= 0) return null;

  const title = (section?.title || "🔥 {count} vaga(s) de emprego disponíveis")
    .replace("{count}", String(jobCount));
  const subtitle = section?.subtitle || "Confira as oportunidades na sua região";

  return (
    <Link to="/jobs" className="flex items-center gap-3 bg-accent border border-primary/20 rounded-xl p-3.5 hover:border-primary/40 transition-all">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <Briefcase className="w-5 h-5 text-primary" />
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
