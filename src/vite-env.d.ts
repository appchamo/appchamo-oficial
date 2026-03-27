/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origem HTTPS das rotas `/api/*-og` quando difere de VITE_PUBLIC_APP_URL (ex.: domínio Vercel com SSL válido). */
  readonly VITE_SHARE_OG_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
