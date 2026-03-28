/** Separador interno — não deve aparecer em URLs Supabase nem em nomes de ficheiro normais */
export const SUPPORT_ATTACH_SEP = "|||SPT|||";

export type SupportAttachKind = "IMAGE" | "VIDEO" | "FILE";

/** Anexos que ainda podem ser enviados (sem vídeo). */
export type SupportOutgoingAttachKind = "IMAGE" | "FILE";

export function buildSupportAttachmentTag(
  kind: SupportOutgoingAttachKind,
  url: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/\]/g, "").slice(0, 240);
  return `[${kind}${SUPPORT_ATTACH_SEP}${url}${SUPPORT_ATTACH_SEP}${encodeURIComponent(safeName)}]`;
}

export function parseSupportAttachment(content: string): {
  kind: SupportAttachKind;
  url: string;
  name: string;
} | null {
  if (!content?.startsWith("[") || !content.endsWith("]")) return null;
  const inner = content.slice(1, -1);
  if (!inner.includes(SUPPORT_ATTACH_SEP)) return null;
  const parts = inner.split(SUPPORT_ATTACH_SEP);
  if (parts.length !== 3) return null;
  const [k, url, enc] = parts;
  if (k !== "IMAGE" && k !== "VIDEO" && k !== "FILE") return null;
  if (!url?.startsWith("http")) return null;
  try {
    return { kind: k as SupportAttachKind, url, name: decodeURIComponent(enc) };
  } catch {
    return null;
  }
}

/** Formato antigo [TYPE:url:name] — URL com porto podia partir; mantido para histórico */
export function parseLegacySupportAttachment(content: string): {
  kind: SupportAttachKind;
  url: string;
  name: string;
} | null {
  const m = content.match(/^\[(IMAGE|VIDEO|FILE):(.+):([^:[\]]+)\]$/);
  if (!m) return null;
  return { kind: m[1] as SupportAttachKind, url: m[2], name: m[3] };
}

export function parseAnySupportAttachment(content: string) {
  return parseSupportAttachment(content) ?? parseLegacySupportAttachment(content);
}

export function isSupportAttachmentContent(content: string): boolean {
  return parseAnySupportAttachment(content) != null;
}
