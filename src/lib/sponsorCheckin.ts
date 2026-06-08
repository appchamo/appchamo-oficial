/**
 * Helpers do check-in de cliente no caixa do patrocinador.
 * O QR impresso contém uma URL estável: {base}/c/<checkin_token>.
 */
import { getPublicAppBaseUrl } from "@/lib/publicAppUrl";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Conteúdo do QR a ser impresso/exibido. */
export function buildCheckinQrData(token: string): string {
  return `${getPublicAppBaseUrl()}/c/${token}`;
}

/** URL de imagem PNG do QR (mesma API já usada no login via web). */
export function buildQrImageUrl(data: string, size = 280): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    data,
  )}&bgcolor=ffffff&color=1a1a1a&qzone=2&format=png`;
}

/**
 * Detecta se um conteúdo lido pelo scanner é um QR de check-in de caixa.
 * Aceita a URL /c/<uuid> (qualquer host) e retorna o token; senão null.
 */
export function parseCheckinToken(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  // Precisa parecer um check-in: ter "/c/" seguido de uuid.
  const m = s.match(/\/c\/([0-9a-f-]{36})/i);
  if (m && UUID_RE.test(m[1])) return m[1].toLowerCase();
  return null;
}

/** Abre uma janela imprimível com o QR do caixa (admin e dashboard do patrocinador). */
export function printCheckinQr(name: string, token: string): void {
  const img = buildQrImageUrl(buildCheckinQrData(token), 600);
  const w = window.open("", "_blank", "width=480,height=680");
  if (!w) return;
  w.document.write(
    `<html><head><title>QR Caixa - ${name}</title></head>` +
    `<body style="text-align:center;font-family:-apple-system,sans-serif;padding:32px;color:#1a1a1a">` +
    `<div style="font-size:26px;font-weight:800;color:#ea580c">CHAMÔ</div>` +
    `<h2 style="margin:8px 0 0">${name}</h2>` +
    `<p style="margin:4px 0 16px;color:#555">Cliente Chamô? Valide aqui no caixa</p>` +
    `<img src="${img}" style="width:340px;height:340px"/>` +
    `<p style="margin-top:16px;color:#777;font-size:13px">Abra o app Chamô &gt; Validar no caixa e aponte a câmera</p>` +
    `<script>const i=document.images[0];i.complete?setTimeout(()=>window.print(),300):i.onload=()=>setTimeout(()=>window.print(),300);<\/script>` +
    `</body></html>`,
  );
  w.document.close();
}

/** dd/mm/aaaa a partir de uma data ISO (YYYY-MM-DD). */
export function formatBirthDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
