import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { JobBriefcase3DIcon } from "./JobBriefcase3DIcon";

function sanitizeJobsTitle(raw: string): string {
  return raw
    .replace(/🔥/g, "")
    .replace(/\{count\}/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface HomeJobsBannerProps {
  jobCount: number;
  section?: { title?: string; subtitle?: string };
}

const DEFAULT_JOBS_BANNER_TITLE = "Vagas de emprego";
const DEFAULT_JOBS_BANNER_SUBTITLE = "Confira as vagas de emprego disponíveis";

const HomeJobsBanner = ({ jobCount, section }: HomeJobsBannerProps) => {
  if (jobCount <= 0) return null;

  const rawTitle = (section?.title || DEFAULT_JOBS_BANNER_TITLE).replace("{count}", String(jobCount));
  const title = sanitizeJobsTitle(rawTitle) || DEFAULT_JOBS_BANNER_TITLE;
  const subtitle = (section?.subtitle || DEFAULT_JOBS_BANNER_SUBTITLE).trim();

  return (
    <Link
      to="/jobs"
      className="group flex items-center gap-3.5 rounded-2xl bg-gradient-to-br from-primary via-primary to-orange-600 px-4 py-3.5 text-left shadow-lg shadow-primary/30 ring-1 ring-white/25 transition-all hover:brightness-[1.06] active:scale-[0.99] dark:ring-white/15 dark:to-orange-700"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 p-1.5 ring-1 ring-white/30 backdrop-blur-[1px]">
        <JobBriefcase3DIcon className="h-9 w-9 drop-shadow-md" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-white/85">{subtitle}</p>
      </div>
      <span className="flex shrink-0 items-center gap-0.5 text-sm font-bold text-white">
        Ver
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
      </span>
    </Link>
  );
};

export default HomeJobsBanner;
