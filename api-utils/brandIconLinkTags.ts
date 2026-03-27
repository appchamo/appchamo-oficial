/**
 * `<link>` de favicon / apple-touch para HTML servido em Edge (OG) e alinhado ao `public/`.
 */
export function brandIconLinkTags(publicAppOrigin: string, escAttr: (s: string) => string): string {
  const base = publicAppOrigin.replace(/\/$/, "");
  const ico = `${base}/favicon.ico`;
  const png192 = `${base}/icon-192.png`;
  return `<link rel="icon" href="${escAttr(ico)}" sizes="any" />
<link rel="icon" type="image/png" href="${escAttr(png192)}" sizes="192x192" />
<link rel="apple-touch-icon" href="${escAttr(png192)}" />`;
}
