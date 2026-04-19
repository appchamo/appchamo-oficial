// =============================================================================
// Dispara um TEST notification da App Store Server API para a URL de produção
// (ou sandbox) configurada no App Store Connect.
//
// Uso (Deno):
//   deno run --allow-read --allow-env --allow-net \
//     scripts/apple_request_test_notification.ts
//
// Variáveis de ambiente:
//   APPLE_KEY_PATH   = caminho para o .p8 baixado do App Store Connect
//   APPLE_KEY_ID     = Key ID (10 chars)
//   APPLE_ISSUER_ID  = Issuer ID (UUID)
//   APPLE_BUNDLE_ID  = com.chamo.app
//   APPLE_ENV        = "Production" (default) ou "Sandbox"
// =============================================================================
import {
  AppStoreServerAPIClient,
  Environment,
} from "npm:@apple/app-store-server-library@1.6.0";

const keyPath = Deno.env.get("APPLE_KEY_PATH");
const keyId = Deno.env.get("APPLE_KEY_ID");
const issuerId = Deno.env.get("APPLE_ISSUER_ID");
const bundleId = Deno.env.get("APPLE_BUNDLE_ID") ?? "com.chamo.app";
const envName = (Deno.env.get("APPLE_ENV") ?? "Production") as
  | "Production"
  | "Sandbox";

if (!keyPath || !keyId || !issuerId) {
  console.error(
    "Faltam env vars. Defina APPLE_KEY_PATH, APPLE_KEY_ID, APPLE_ISSUER_ID.",
  );
  Deno.exit(1);
}

const privateKey = await Deno.readTextFile(keyPath);
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
const response = await client.requestTestNotification();
console.log("✅ TEST notification enviada!");
console.log("   testNotificationToken:", response.testNotificationToken);
console.log(
  "\nAgora cheque os logs do webhook:\n  supabase functions logs apple_server_notifications --tail",
);
