/**
 * Extrai o caminho do objeto dentro do bucket `uploads` a partir do que está em `profiles.avatar_url`.
 * Suporta path relativo, getPublicUrl, signed URL e variantes com /render/image/.
 */
export function extractUploadsObjectPath(imageRef: string | null | undefined): string | null {
  const raw = (imageRef || "").trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/^\/+/, "");
  }

  const markers = [
    "/object/public/uploads/",
    "/object/sign/uploads/",
    "/render/image/public/uploads/",
    "/render/image/sign/uploads/",
  ];
  for (const m of markers) {
    const idx = raw.indexOf(m);
    if (idx >= 0) {
      const rest = raw.slice(idx + m.length).split("?")[0];
      try {
        return decodeURIComponent(rest);
      } catch {
        return rest;
      }
    }
  }

  const alt = raw.match(/\/(?:public|sign)\/uploads\/([^?]+)/);
  if (alt) {
    try {
      return decodeURIComponent(alt[1]);
    } catch {
      return alt[1];
    }
  }

  return null;
}
