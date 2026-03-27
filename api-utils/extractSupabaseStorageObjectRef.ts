import { extractUploadsObjectPath } from "./extractUploadsObjectPath";

export type SupabaseStorageObjectRef = { bucket: string; objectPath: string };

/**
 * Bucket + chave do objeto no Storage a partir de `profiles.avatar_url` (ou URLs antigas).
 * Suporta qualquer bucket (`uploads`, `avatars`, `professionals`, etc.) e URLs legacy só com `/uploads/`.
 */
export function extractSupabaseStorageObjectRef(ref: string | null | undefined): SupabaseStorageObjectRef | null {
  const raw = (ref || "").trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    return { bucket: "uploads", objectPath: raw.replace(/^\/+/, "") };
  }

  const decodePath = (p: string) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  };

  const objectPair = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?#]+)/i);
  if (objectPair) {
    return { bucket: objectPair[1], objectPath: decodePath(objectPair[2]) };
  }

  const renderPair = raw.match(/\/storage\/v1\/render\/image\/(?:public|sign)\/([^/]+)\/([^?#]+)/i);
  if (renderPair) {
    return { bucket: renderPair[1], objectPath: decodePath(renderPair[2]) };
  }

  const legacyUploadsPath = extractUploadsObjectPath(raw);
  if (legacyUploadsPath) {
    return { bucket: "uploads", objectPath: legacyUploadsPath };
  }

  return null;
}
