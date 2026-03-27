/**
 * Redimensiona e comprime imagem para o chat (WebP com fallback JPEG).
 * Limite ~1024px no maior lado, WebP mais compacto para economizar banda e storage.
 */
export async function compressImageForChat(
  input: Blob | File,
  options?: { maxEdge?: number; webpQuality?: number; jpegQuality?: number },
): Promise<Blob> {
  const maxEdge = options?.maxEdge ?? 1024;
  const webpQ = options?.webpQuality ?? 0.72;
  const jpegQ = options?.jpegQuality ?? 0.78;

  const bitmap = await createImageBitmap(input).catch(() => null);
  if (!bitmap) throw new Error("Não foi possível ler a imagem.");

  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas não disponível.");
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) (ctx as CanvasRenderingContext2D).imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);

    const tryWebp = (): Promise<Blob | null> =>
      new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/webp", webpQ);
      });

    const tryJpeg = (): Promise<Blob | null> =>
      new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", jpegQ);
      });

    let out = await tryWebp();
    if (!out || out.size < 32) out = await tryJpeg();
    if (!out) throw new Error("Falha ao gerar imagem comprimida.");
    return out;
  } finally {
    bitmap.close?.();
  }
}
