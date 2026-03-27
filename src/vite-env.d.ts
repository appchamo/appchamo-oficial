/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origem HTTPS das rotas `/api/*-og` quando difere de VITE_PUBLIC_APP_URL (ex.: domínio Vercel com SSL válido). */
  readonly VITE_SHARE_OG_BASE_URL?: string;
  /** Preenchido no build na Vercel a partir de `VERCEL_URL` (ex.: https://chamoapp-xxx.vercel.app). */
  readonly VITE_VERCEL_DEPLOYMENT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
