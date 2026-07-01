// Copia o modelo tinyFaceDetector do face-api.js para public/face-models,
// para o reconhecimento facial (selfie) funcionar offline, sem CDN.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "node_modules", "@vladmandic", "face-api", "model");
const dest = join(root, "public", "face-models");

const FILES = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
];

try {
  if (!existsSync(src)) {
    console.warn("[copy-face-models] modelo não encontrado em node_modules; pulando.");
    process.exit(0);
  }
  mkdirSync(dest, { recursive: true });
  for (const f of FILES) {
    const from = join(src, f);
    if (existsSync(from)) copyFileSync(from, join(dest, f));
  }
  console.log("[copy-face-models] modelo copiado para public/face-models");
} catch (e) {
  console.warn("[copy-face-models] falhou:", e?.message || e);
}
