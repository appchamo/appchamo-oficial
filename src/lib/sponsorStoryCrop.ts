import type { Area } from "react-easy-crop";

const STORY_OUT_W = 1080;
const STORY_OUT_H = 1920;

export function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (err) => reject(err));
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

/** Exporta o recorte 9:16 para 1080×1920 (cover), sem distorção. */
export async function getCroppedStoryImageBlob(
  imageSrc: string,
  pixelCrop: Area,
  webpQuality = 0.88,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = STORY_OUT_W;
  canvas.height = STORY_OUT_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    STORY_OUT_W,
    STORY_OUT_H,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Falha ao gerar imagem"));
      },
      "image/webp",
      webpQuality,
    );
  });
}

export function storyBlobToFile(blob: Blob, baseName = "novidade"): File {
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}
