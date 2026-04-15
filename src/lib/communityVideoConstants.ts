export const COMMUNITY_VIDEO_MAX_SECONDS = 90;
export const COMMUNITY_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** MIME para <video> / Blob (galeria iOS muitas vezes sem file.type). */
export function guessCommunityVideoMime(file: File): string {
  const t = (file.type || "").trim().toLowerCase();
  if (t.startsWith("video/")) return t;
  const n = file.name.toLowerCase();
  if (n.endsWith(".mov") || n.endsWith(".qt")) return "video/quicktime";
  if (n.endsWith(".mp4") || n.endsWith(".m4v")) return "video/mp4";
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".3gp")) return "video/3gpp";
  if (n.endsWith(".avi")) return "video/x-msvideo";
  if (n.endsWith(".mkv")) return "video/x-matroska";
  if (n.endsWith(".mpeg") || n.endsWith(".mpg")) return "video/mpeg";
  if (n.endsWith(".wmv")) return "video/x-ms-wmv";
  return "video/mp4";
}

/** Extensão no MEMFS do ffmpeg (ajuda o demuxer). */
export function guessFfmpegInputExtension(file: File): string {
  const n = file.name.toLowerCase();
  const known = [
    ".mov",
    ".qt",
    ".mp4",
    ".m4v",
    ".webm",
    ".mkv",
    ".avi",
    ".wmv",
    ".flv",
    ".3gp",
    ".mpeg",
    ".mpg",
  ];
  for (const e of known) if (n.endsWith(e)) return e;
  const t = (file.type || "").toLowerCase();
  if (t.includes("quicktime")) return ".mov";
  if (t.includes("avi") || t.includes("msvideo")) return ".avi";
  if (t.includes("webm")) return ".webm";
  if (t.includes("matroska")) return ".mkv";
  return ".mp4";
}

export function isCommunityVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return /\.(mov|qt|mp4|m4v|webm|mkv|avi|wmv|flv|3gp|mpeg|mpg)$/i.test(file.name);
}
