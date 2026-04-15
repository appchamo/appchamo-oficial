import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const destDir = path.join(root, "public", "ffmpeg");

if (!fs.existsSync(srcDir)) {
  console.warn("[copy-ffmpeg-core] node_modules/@ffmpeg/core/dist/esm não encontrado — ignorado.");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
}
console.log("[copy-ffmpeg-core] Copiado para public/ffmpeg/");
