/**
 * Gera PNGs em public/seals/push/ a partir dos SVG (FCM/iOS não usam SVG na miniatura).
 * Rode: npm run export:seal-pngs
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "seals", "push");
const files = (await readdir(dir)).filter((f) => f.endsWith(".svg"));

for (const f of files) {
  const buf = await readFile(join(dir, f));
  const out = f.replace(".svg", ".png");
  await sharp(buf)
    .resize(512, null, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(dir, out));
  console.log("ok", out);
}
