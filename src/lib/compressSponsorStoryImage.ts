/** Compressão para novidades de patrocinadores — mais nitidez que o preset antigo (600px / 0.62). */
export async function compressSponsorStoryImage(
  file: File,
  opts?: { maxDim?: number; webpQuality?: number },
): Promise<File> {
  const maxDim = opts?.maxDim ?? 1080;
  const webpQuality = opts?.webpQuality ?? 0.84;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const name = file.name.replace(/\.[^.]+$/, ".webp");
          resolve(new File([blob], name, { type: "image/webp" }));
        },
        "image/webp",
        webpQuality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}
