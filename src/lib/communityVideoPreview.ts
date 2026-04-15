import { guessCommunityVideoMime } from "./communityVideoConstants";

/**
 * Tenta obter um object URL que o <video> nativo consegue reproduzir (ex.: MP4).
 * Devolve null se metadata falhar ou não chegar a tempo (ex.: MOV HEVC no Safari).
 */
export function tryCreateNativeVideoPreviewUrl(file: File, timeoutMs = 2200): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const mime = guessCommunityVideoMime(file);
    const url = URL.createObjectURL(new Blob([file], { type: mime }));

    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;

    let timer: ReturnType<typeof setTimeout>;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error", onErr);
      if (!ok) {
        URL.revokeObjectURL(url);
        resolve(null);
      } else {
        resolve(url);
      }
    };

    const onMeta = () => {
      const d = v.duration;
      finish(Number.isFinite(d) && d > 0 && d < 86400);
    };
    const onErr = () => finish(false);

    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", onErr);
    v.src = url;
    v.load();

    timer = setTimeout(() => finish(false), timeoutMs);
  });
}
