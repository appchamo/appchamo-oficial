#!/usr/bin/env node
/**
 * Lê o JSON da conta de serviço do Firebase (arquivo que você baixou)
 * e imprime o valor para colar no Supabase Secret FIREBASE_CONFIG.
 *
 * Uso:
 *   1. Salve o arquivo que você baixou do Firebase como:
 *      firebase-service-account.json
 *      (na raiz do projeto; o arquivo está no .gitignore)
 *   2. Rode: node scripts/prepare-firebase-config.js
 *   3. Copie a ÚNICA linha que aparecer no terminal
 *   4. Supabase Dashboard → Project Settings → Edge Functions → Secrets
 *      → Add secret: Name = FIREBASE_CONFIG, Value = (cole a linha)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(__dirname, "..", "firebase-service-account.json");

if (!fs.existsSync(jsonPath)) {
  console.error("Arquivo não encontrado:", jsonPath);
  console.error("");
  console.error("Salve o JSON que você baixou do Firebase como:");
  console.error("  firebase-service-account.json");
  console.error("na raiz do projeto (ao lado de package.json), e rode de novo.");
  process.exit(1);
}

const raw = fs.readFileSync(jsonPath, "utf8");
const data = JSON.parse(raw);

const config = {
  project_id: data.project_id,
  client_email: data.client_email,
  private_key: data.private_key,
};

console.log(JSON.stringify(config));
