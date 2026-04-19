// =============================================================================
// Dispara um TEST notification da App Store Server API para a URL configurada
// no App Store Connect.
//
// Uso (Node 18+):
//   node scripts/apple_request_test_notification.mjs
//
// Variáveis de ambiente:
//   APPLE_KEY_PATH   = caminho para o .p8 baixado do App Store Connect
//   APPLE_KEY_ID     = Key ID (10 chars, do nome do arquivo)
//   APPLE_ISSUER_ID  = Issuer ID (UUID, no topo da página de chaves)
//   APPLE_BUNDLE_ID  = com.chamo.app
//   APPLE_ENV        = "Production" (default) ou "Sandbox"
// =============================================================================
import { readFileSync } from "node:fs";
import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";

const keyPath = process.env.APPLE_KEY_PATH;
const keyId = process.env.APPLE_KEY_ID;
const issuerId = process.env.APPLE_ISSUER_ID;
const bundleId = process.env.APPLE_BUNDLE_ID ?? "com.chamo.app";
const envName = process.env.APPLE_ENV ?? "Production";

if (!keyPath || !keyId || !issuerId) {
  console.error(
    "Faltam env vars. Defina APPLE_KEY_PATH, APPLE_KEY_ID, APPLE_ISSUER_ID.",
  );
  process.exit(1);
}

const privateKey = readFileSync(keyPath, "utf8");
const env =
  envName === "Production" ? Environment.PRODUCTION : Environment.SANDBOX;

const client = new AppStoreServerAPIClient(
  privateKey,
  keyId,
  issuerId,
  bundleId,
  env,
);

console.log(`→ Pedindo TEST notification (${envName})…`);
try {
  const response = await client.requestTestNotification();
  console.log("✅ TEST notification enviada!");
  console.log("   testNotificationToken:", response.testNotificationToken);
  console.log(
    "\nAgora cheque os logs do webhook (em outro terminal):\n  supabase functions logs apple_server_notifications --tail",
  );
} catch (e) {
  console.error("❌ Erro ao pedir TEST notification:");
  console.error(e);
  process.exit(1);
}
