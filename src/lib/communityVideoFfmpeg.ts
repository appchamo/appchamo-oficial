/**
 * Normalização de vídeo para a Comunidade via ffmpeg.wasm (iPhone MOV/HEVC, Android, AVI, WebM, >50 MB, etc.).
 * O <video> do browser não serve para formatos/codecs variados — tudo passa por aqui ao publicar.
 */
import {
  COMMUNITY_VIDEO_MAX_BYTES,
  COMMUNITY_VIDEO_MAX_SECONDS,
  guessFfmpegInputExtension,
} from "./communityVideoConstants";

const logSubscribers = new Set<(msg: string) => void>();

/** Same-origin (public/ffmpeg após postinstall) — evita “Load failed” no WKWebView ao ir à CDN. */
function ffmpegCorePublicUrls(): { coreURL: string; wasmURL: string } {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return {
    coreURL: `${root}ffmpeg/ffmpeg-core.js`,
    wasmURL: `${root}ffmpeg/ffmpeg-core.wasm`,
  };
}

function subscribeLogs(fn: (msg: string) => void): () => void {
  logSubscribers.add(fn);
  return () => logSubscribers.delete(fn);
}

let ffmpegLoadPromise: Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null = null;

async function getFfmpeg(): Promise<import("@ffmpeg/ffmpeg").FFmpeg> {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ff = new FFmpeg();
      ff.on("log", ({ message }) => {
        logSubscribers.forEach((fn) => fn(message));
      });
      const { coreURL, wasmURL } = ffmpegCorePublicUrls();
      await ff.load({ coreURL, wasmURL });
      return ff;
    })();
  }
  return ffmpegLoadPromise;
}

/** Vírgula em min(720,ih) escapada no graph do ffmpeg. */
const SCALE_VF = "scale=-2:min(720\\,ih):flags=lanczos";

async function probeInputDurationSeconds(ff: import("@ffmpeg/ffmpeg").FFmpeg, inputName: string): Promise<number> {
  const lines: string[] = [];
  const unsub = subscribeLogs((m) => lines.push(m));
  try {
    try {
      await ff.exec(["-i", inputName]);
    } catch {
      /* Sem output o ffmpeg devolve exit != 0; a duração vem nos logs. */
    }
  } finally {
    unsub();
  }
  const text = lines.join("\n");
  const m = text.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
  if (!m) {
    throw new Error(
      "Não foi possível ler este vídeo. Verifica se o ficheiro não está corrompido e tenta outro formato (ex.: MP4).",
    );
  }
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const sec = parseFloat(m[3]);
  const total = h * 3600 + min * 60 + sec;
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("Duração do vídeo inválida.");
  }
  return total;
}

async function deleteQuiet(ff: import("@ffmpeg/ffmpeg").FFmpeg, name: string) {
  await ff.deleteFile(name).catch(() => {});
}

/**
 * Converte qualquer vídeo suportado pelo ffmpeg para MP4 (H.264 + AAC ou só vídeo), ≤ 50 MB, máx. 90 s.
 */
export async function prepareCommunityVideoFileWithFfmpeg(
  file: File,
  onProgress?: (label: string) => void,
): Promise<Blob> {
  const { fetchFile } = await import("@ffmpeg/util");
  const ff = await getFfmpeg();

  const ext = guessFfmpegInputExtension(file);
  const sid = crypto.randomUUID();
  const inputName = `in_${sid}${ext}`;
  const outName = `out_${sid}.mp4`;

  onProgress?.("A preparar o vídeo…");
  await deleteQuiet(ff, inputName);
  await deleteQuiet(ff, outName);
  await ff.writeFile(inputName, await fetchFile(file));

  try {
    onProgress?.("A analisar duração…");
    const durationSec = await probeInputDurationSeconds(ff, inputName);
    if (durationSec > COMMUNITY_VIDEO_MAX_SECONDS + 0.35) {
      throw new Error(`O vídeo pode ter no máximo ${COMMUNITY_VIDEO_MAX_SECONDS} segundos.`);
    }

    const runTranscode = async (args: string[]) => {
      await deleteQuiet(ff, outName);
      await ff.exec(args);
      const u8 = await ff.readFile(outName);
      const buf = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8 as ArrayBuffer);
      return new Blob([buf], { type: "video/mp4" });
    };

    const argsWithAudio = (crf: number) =>
      [
        "-y",
        "-i",
        inputName,
        "-vf",
        SCALE_VF,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        String(crf),
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        outName,
      ] as string[];

    const argsNoAudio = (crf: number) =>
      [
        "-y",
        "-i",
        inputName,
        "-vf",
        SCALE_VF,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        String(crf),
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-movflags",
        "+faststart",
        outName,
      ] as string[];

    const unsubLog = onProgress
      ? subscribeLogs((m) => {
          const t = m.trim();
          if (t.startsWith("frame=") || t.startsWith("size=")) onProgress("A converter vídeo…");
        })
      : () => {};

    let crf = 23;
    let blob: Blob | null = null;
    let triedNoAudio = false;

    try {
      onProgress?.("A converter e otimizar (MP4)…");
      for (let attempt = 0; attempt < 9; attempt++) {
        try {
          blob = await runTranscode(argsWithAudio(crf));
        } catch {
          if (!triedNoAudio) {
            triedNoAudio = true;
            try {
              blob = await runTranscode(argsNoAudio(crf));
            } catch {
              blob = null;
            }
          } else {
            blob = null;
          }
        }
        if (blob && blob.size <= COMMUNITY_VIDEO_MAX_BYTES) break;
        crf += 2;
      }
    } finally {
      unsubLog();
    }

    if (!blob || blob.size > COMMUNITY_VIDEO_MAX_BYTES) {
      throw new Error(
        "Não foi possível reduzir o vídeo abaixo de 50 MB. Usa um clipe mais curto ou grava com menos qualidade.",
      );
    }
    return blob;
  } finally {
    await deleteQuiet(ff, inputName);
    await deleteQuiet(ff, outName);
  }
}

/** Clipe curto em MP4 H.264 para o compositor quando o <video> nativo não reproduz o ficheiro. */
const PREVIEW_SCALE_VF = "scale=-2:min(480\\,ih):flags=fast_bilinear";

export async function generateCommunityVideoPreviewBlob(file: File): Promise<Blob> {
  const { fetchFile } = await import("@ffmpeg/util");
  const ff = await getFfmpeg();
  const ext = guessFfmpegInputExtension(file);
  const sid = crypto.randomUUID();
  const inputName = `prev_in_${sid}${ext}`;
  const outName = `prev_out_${sid}.mp4`;

  await deleteQuiet(ff, inputName);
  await deleteQuiet(ff, outName);
  await ff.writeFile(inputName, await fetchFile(file));

  try {
    await ff.exec([
      "-y",
      "-i",
      inputName,
      "-t",
      "10",
      "-vf",
      PREVIEW_SCALE_VF,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "32",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      outName,
    ]);
    const u8 = await ff.readFile(outName);
    const buf = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8 as ArrayBuffer);
    return new Blob([buf], { type: "video/mp4" });
  } finally {
    await deleteQuiet(ff, inputName);
    await deleteQuiet(ff, outName);
  }
}
