/**
 * Vídeos da Comunidade: validação + normalização via ffmpeg.wasm (compatível com iPhone, Android, AVI, >50 MB).
 */
export {
  COMMUNITY_VIDEO_MAX_SECONDS,
  COMMUNITY_VIDEO_MAX_BYTES,
  guessCommunityVideoMime,
  isCommunityVideoFile,
} from "./communityVideoConstants";

import { isCommunityVideoFile } from "./communityVideoConstants";

export async function prepareCommunityVideoForUpload(
  file: File,
  options?: { onProgress?: (label: string) => void },
): Promise<Blob> {
  if (!isCommunityVideoFile(file)) {
    throw new Error("Selecione um arquivo de vídeo.");
  }

  const { prepareCommunityVideoFileWithFfmpeg } = await import("./communityVideoFfmpeg");
  return prepareCommunityVideoFileWithFfmpeg(file, options?.onProgress);
}

/** MP4 curto para pré-visualização no compositor (MOV/HEVC, etc.). */
export async function generateCommunityVideoPreviewBlob(file: File): Promise<Blob> {
  const { generateCommunityVideoPreviewBlob: gen } = await import("./communityVideoFfmpeg");
  return gen(file);
}
